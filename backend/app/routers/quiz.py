import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Lecture
from app.schemas import Question, Quiz
from app import storage
from app.vllm_client import generate_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/{lecture_id}", response_model=Quiz)
async def make_quiz(lecture_id: int, session: AsyncSession = Depends(get_session)):
    """Return the lecture's quiz, generating + caching it on the first request.

    The set is generated once (count chosen by the model from the whole lecture,
    capped at 50) and stored on the lecture, so every later user gets the same
    pre-generated set instead of triggering a fresh generation. Concurrent first
    requests are serialized by a per-lecture advisory lock so generation runs at
    most once.
    """
    lecture = await session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "lecture not found")
    if lecture.status != "done" or not lecture.transcript_path:
        raise HTTPException(409, "lecture is not ready yet")

    # Serve the cached set if one was already generated.
    if lecture.questions_json:
        return Quiz(
            lecture_id=lecture_id,
            questions=[Question(**q) for q in lecture.questions_json],
            cached=True,
        )

    # Only one generation per lecture: a concurrent request blocks here until the
    # holder commits, then re-reads the now-cached set below. Transaction-scoped,
    # so it releases on commit/rollback (incl. on error).
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": lecture_id})

    # Re-check after taking the lock — another request may have generated meanwhile.
    await session.refresh(lecture)
    if lecture.questions_json:
        return Quiz(
            lecture_id=lecture_id,
            questions=[Question(**q) for q in lecture.questions_json],
            cached=True,
        )

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "t.txt")
        storage.download(lecture.transcript_path, path)
        transcript = open(path, encoding="utf-8").read()

    questions = await generate_quiz(transcript, lecture.summary or "")
    if not questions:
        raise HTTPException(502, "не удалось сгенерировать вопросы")

    lecture.questions_json = questions
    await session.commit()
    return Quiz(lecture_id=lecture_id, questions=[Question(**q) for q in questions])
