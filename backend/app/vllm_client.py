"""Async client to the vLLM OpenAI-compatible endpoint with structured output."""

import asyncio
import json
import math
import re

import httpx

from app.config import settings

# JSON schema that constrains the model to return exactly our quiz shape.
QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "correct_index": {"type": "integer", "minimum": 0, "maximum": 3},
                },
                "required": ["question", "options", "correct_index"],
            },
        }
    },
    "required": ["questions"],
}

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def _strip_think(text: str) -> str:
    """Qwen3 is a reasoning model; drop any leftover <think> block."""
    return _THINK_RE.sub("", text).strip()


async def _chat(messages: list[dict], response_schema: dict | None = None, max_tokens: int = 1024) -> str:
    payload: dict = {
        "model": settings.vllm_model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": max_tokens,
        # Disable Qwen3 thinking — we want direct answers, and it saves tokens
        # (important with the trimmed 6144 context).
        "chat_template_kwargs": {"enable_thinking": False},
    }
    if response_schema is not None:
        # v0.23 structured output — forces clean JSON (no <think>), unlike guided_json.
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "out", "schema": response_schema},
        }

    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{settings.vllm_base_url}/chat/completions", json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def summarize(transcript: str) -> str:
    """Short Russian summary used as the lecture's structured overview."""
    content = await _chat(
        [
            {"role": "system", "content": "Ты помощник, который кратко конспектирует лекции на русском языке."},
            {
                "role": "user",
                "content": f"Составь краткий конспект лекции (основные темы и тезисы):\n\n{transcript[:12000]}",
            },
        ],
        max_tokens=1024,
    )
    return _strip_think(content)


async def generate_title(summary: str) -> str:
    """Short Russian lecture title derived from the summary (for the UI/test name)."""
    content = await _chat(
        [
            {"role": "system", "content": "Ты придумываешь короткие заголовки лекций на русском языке."},
            {
                "role": "user",
                "content": (
                    "По конспекту придумай короткий заголовок лекции — 3–7 слов, "
                    "отражающий её тему. Ответь только заголовком: без кавычек, "
                    "пояснений и точки в конце.\n\n"
                    f"Конспект:\n{summary[:2000]}"
                ),
            },
        ],
        max_tokens=64,
    )
    cleaned = _strip_think(content).strip()
    first = cleaned.splitlines()[0] if cleaned else ""
    return first.strip(" \"«».").strip()[:200]


# Quiz generation must cover the WHOLE lecture, but vLLM's context is small
# (max_model_len 6144). So we slice the transcript into windows that span the
# entire lecture and generate questions per window, then merge + dedupe + cap.
_QUIZ_MAX = 50          # hard upper bound on total questions
_CHUNK_CHARS = 3500     # per-window transcript size (fits context with the output)
_MAX_CHUNKS = 12        # cap on parallel vLLM calls (bounds latency)


def _windows(text: str, n_chunks: int, size: int) -> list[str]:
    """`n_chunks` evenly-spaced windows of up to `size` chars spanning the text."""
    if n_chunks <= 1 or len(text) <= size:
        return [text[:size]] if text else []
    step = len(text) / n_chunks
    return [text[int(i * step) : int(i * step) + size] for i in range(n_chunks)]


# The prompt forbids referring back to the source, but the model still slips
# (~1 in 10 questions). This deterministic filter drops any question that leaks a
# source reference, so such questions can never reach a user. Phrases here are
# unambiguous references ("во фрагменте", "согласно описанию"); a bare "в тексте"
# is left alone because it legitimately means "within a text" in many questions.
_SOURCE_REF_RE = re.compile(
    r"фрагмент"
    r"|в\s+лекции"
    r"|в\s+(?:данном|приведённом|приведенном|этом|указанном)\s+(?:тексте|отрывке|материале)"
    r"|согласно\s+(?:тексту|описанию|лекции|фрагменту|материалу)"
    r"|по\s+мнению\s+автора"
    r"|как\s+сказано\s+(?:выше|в\s+тексте)"
    r"|упоминается\s+в\s+тексте"
    r"|упомянут\w*\s+в\s+тексте"
    r"|описанн\w+\s+в\s+(?:тексте|лекции|материале)"
    r"|в\s+тексте\s+как\s+пример"
    # References to the lecture/speaker/seminar as the source. Qualified so that
    # legitimate subjects survive ("автор библиотеки", "ведущий инструмент").
    r"|автор\w*\s+(?:лекци|семинар|доклад|видео|материал|курс)"
    r"|по\s+словам\s+автор"
    r"|лектор|докладчик|выступающ\w+"
    r"|на\s+(?:этом\s+|данном\s+|нашем\s+|прошлом\s+)?(?:семинаре|лекции|занятии|вебинаре)"
    r"|в\s+(?:этом\s+|данном\s+|нашем\s+)?(?:семинаре|докладе|вебинаре|видео|занятии)",
    re.IGNORECASE,
)


def _refers_to_source(question: str) -> bool:
    return bool(_SOURCE_REF_RE.search(question))


_QUIZ_SYS = (
    "Ты составляешь тесты по лекциям на русском языке. "
    "Каждый вопрос — с 4 вариантами ответа, ровно один верный. "
    "Вопросы проверяют понимание материала.\n"
    "Каждый вопрос должен быть самодостаточным и проверять знание темы по сути, "
    "а не пересказ конкретного источника. Запрещены любые отсылки к источнику: "
    "не используй формулировки вроде «в тексте», «в лекции», «во фрагменте», "
    "«согласно тексту», «как сказано выше», «по мнению автора», «приведён в тексте». "
    "Формулируй вопрос так, чтобы он был понятен человеку, который лекцию не читал."
)


async def _quiz_chunk(fragment: str, k: int) -> list[dict]:
    """Up to `k` questions strictly from one transcript fragment. Never raises."""
    try:
        raw = await _chat(
            [
                {"role": "system", "content": _QUIZ_SYS},
                {
                    "role": "user",
                    "content": (
                        f"На основе этого фрагмента лекции составь до {k} вопросов. "
                        "Сделай ровно столько вопросов, сколько оправдано содержанием "
                        "фрагмента — не выдумывай лишнего и не дублируй.\n"
                        "Фрагмент — только источник тем и фактов: каждый вопрос должен "
                        "быть самодостаточным и не ссылаться на сам фрагмент, текст или "
                        "лекцию. Не пиши «в тексте», «во фрагменте», «в лекции» и т.п.\n\n"
                        f"Фрагмент:\n{fragment}"
                    ),
                },
            ],
            response_schema=QUIZ_SCHEMA,
            max_tokens=1500,
        )
        return json.loads(_strip_think(raw))["questions"]
    except Exception as exc:  # noqa: BLE001 — one bad window shouldn't kill the quiz
        print(f"quiz chunk failed: {exc}")
        return []


# LLM-judge pass. The regex above only catches phrasings we anticipated; this
# second reviewer (same model, separate call) reads each question and decides
# whether it is genuinely self-contained — understandable to someone who never
# saw the lecture — and free of any reference to the source. Questions it rejects
# are dropped. It runs in batches (parallel) to keep latency bounded.
_REVIEW_SYS = (
    "Ты — строгий редактор тестовых вопросов. Для каждого вопроса реши, можно ли "
    "показать его студенту, который НЕ видел исходную лекцию.\n"
    "Вопрос ГОДЕН только если выполнено ВСЁ:\n"
    "1) он самодостаточный — понятен сам по себе, без доступа к лекции, тексту, "
    "слайдам, фрагменту или иному контексту;\n"
    "2) он не ссылается на источник — никаких отсылок к «лекции», «тексту», "
    "«фрагменту», «семинару», «видео», «материалу», «автору», «лектору», "
    "«докладчику», «как сказано выше» и т.п.;\n"
    "3) это цельный, осмысленный вопрос по сути темы с конкретным ответом.\n"
    "Если хоть одно условие нарушено — вопрос НЕ годен."
)

_REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "verdicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "ok": {"type": "boolean"},
                },
                "required": ["index", "ok"],
            },
        }
    },
    "required": ["verdicts"],
}

_REVIEW_BATCH = 10  # questions per judge call (keeps each call within context)


async def _review_batch(batch: list[dict]) -> list[bool]:
    """Judge one batch; returns a keep-flag per question. Fail-open: on any error
    (or an index the judge forgot) the question is kept, so a judge hiccup can't
    empty the quiz — the regex pre-filter is still the hard guarantee."""
    listing = "\n".join(f"{i}. {q['question']}" for i, q in enumerate(batch))
    try:
        raw = await _chat(
            [
                {"role": "system", "content": _REVIEW_SYS},
                {
                    "role": "user",
                    "content": (
                        "Оцени каждый вопрос из списка. Верни для каждого его номер "
                        "(index) и ok=true, если вопрос годен, иначе ok=false.\n\n"
                        + listing
                    ),
                },
            ],
            response_schema=_REVIEW_SCHEMA,
            max_tokens=512,
        )
        verdicts = json.loads(_strip_think(raw))["verdicts"]
    except Exception as exc:  # noqa: BLE001 — never let the judge kill generation
        print(f"review batch failed: {exc}")
        return [True] * len(batch)

    keep = [True] * len(batch)  # default-keep any index the judge omitted
    for v in verdicts:
        i = v.get("index")
        if isinstance(i, int) and 0 <= i < len(batch):
            keep[i] = bool(v.get("ok", True))
    return keep


async def _review_questions(questions: list[dict]) -> list[dict]:
    """Keep only questions the LLM judge accepts as self-contained and source-free."""
    if not questions:
        return questions
    batches = [questions[i : i + _REVIEW_BATCH] for i in range(0, len(questions), _REVIEW_BATCH)]
    flags = await asyncio.gather(*(_review_batch(b) for b in batches))
    return [q for batch, keep in zip(batches, flags) for q, k in zip(batch, keep) if k]


async def generate_quiz(transcript: str, summary: str, max_n: int = _QUIZ_MAX) -> list[dict]:
    """Generate as many MCQs as the lecture warrants (capped at max_n), drawn from
    the whole transcript rather than just its start.

    The transcript is sliced into windows covering the entire lecture; each window
    yields a proportional share of the questions, generated in parallel (vLLM
    batches them). Results are merged, de-duplicated by question text, capped.
    """
    source = transcript if transcript.strip() else summary
    n_chunks = max(1, min(_MAX_CHUNKS, math.ceil(len(source) / _CHUNK_CHARS)))
    per_chunk = max(1, min(8, math.ceil(max_n / n_chunks)))

    windows = _windows(source, n_chunks, _CHUNK_CHARS)
    results = await asyncio.gather(*(_quiz_chunk(w, per_chunk) for w in windows))

    seen: set[str] = set()
    questions: list[dict] = []
    for chunk in results:
        for q in chunk:
            key = q["question"].strip().lower()
            if not key or key in seen:
                continue
            # Prompting alone doesn't stop the model from referring back to the
            # source; drop those questions outright so users never see them.
            if _refers_to_source(q["question"]):
                continue
            seen.add(key)
            questions.append(q)

    # Second pass: an LLM judge drops anything not genuinely self-contained.
    questions = await _review_questions(questions)
    return questions[:max_n]
