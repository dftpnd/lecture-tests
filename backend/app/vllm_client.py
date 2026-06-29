"""Async client to the vLLM OpenAI-compatible endpoint with guided JSON output."""

import json

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


async def _chat(messages: list[dict], guided_json: dict | None = None, max_tokens: int = 4096) -> str:
    payload: dict = {
        "model": settings.vllm_model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": max_tokens,
    }
    if guided_json is not None:
        # vLLM guided decoding — forces structurally valid JSON.
        payload["guided_json"] = guided_json

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
    return content.strip()


async def generate_quiz(transcript: str, summary: str, n: int = 20) -> list[dict]:
    """Generate N fresh multiple-choice questions in Russian from the lecture."""
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
                    f"Конспект:\n{summary}\n\nТранскрипт:\n{transcript[:16000]}"
                ),
            },
        ],
        guided_json=QUIZ_SCHEMA,
        max_tokens=6144,
    )
    return json.loads(raw)["questions"]
