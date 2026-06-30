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
            if key and key not in seen:
                seen.add(key)
                questions.append(q)
    return questions[:max_n]
