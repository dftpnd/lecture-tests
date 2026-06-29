"""Async client to the vLLM OpenAI-compatible endpoint with structured output."""

import json
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


async def generate_quiz(transcript: str, summary: str, n: int = 20) -> list[dict]:
    """Generate N fresh multiple-choice questions in Russian from the lecture.

    Context is tight (vLLM max_model_len 6144), so we rely mostly on the summary
    (which already condenses the whole lecture) plus a transcript excerpt.
    """
    raw = await _chat(
        [
            {
                "role": "system",
                "content": (
                    "Ты составляешь тесты по лекциям на русском языке. "
                    "Каждый вопрос — с 4 вариантами ответа, ровно один верный. "
                    "Вопросы должны покрывать разные части лекции и проверять понимание."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Составь {n} разных вопросов с вариантами ответа по этой лекции.\n\n"
                    f"Конспект (охватывает всю лекцию):\n{summary[:2500]}\n\n"
                    f"Фрагмент транскрипта:\n{transcript[:5000]}"
                ),
            },
        ],
        response_schema=QUIZ_SCHEMA,
        max_tokens=2800,
    )
    return json.loads(_strip_think(raw))["questions"]
