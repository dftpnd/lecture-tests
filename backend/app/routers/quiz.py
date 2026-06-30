import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Attempt, Lecture, QuizSet
from app.routers.users import get_or_create_user
from app.schemas import Question, Quiz
from app import storage
from app.vllm_client import generate_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


async def _pick_unused_set(session: AsyncSession, lecture_id: int, user_id: int) -> QuizSet | None:
    """Oldest set for this lecture that the user hasn't attempted yet, or None."""
    taken = (
        select(Attempt.quiz_set_id)
        .where(Attempt.user_id == user_id, Attempt.lecture_id == lecture_id)
        .where(Attempt.quiz_set_id.is_not(None))
    )
    stmt = (
        select(QuizSet)
        .where(QuizSet.lecture_id == lecture_id, QuizSet.id.not_in(taken))
        .order_by(QuizSet.id)
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


@router.post("/{lecture_id}", response_model=Quiz)
async def make_quiz(
    lecture_id: int,
    user_name: str,
    session: AsyncSession = Depends(get_session),
):
    """Serve a quiz set the user hasn't taken yet, generating a fresh one if needed.

    Lectures keep a growing pool of sets shared across users. Each user is served
    a set at most once: we hand out the oldest set they haven't attempted. When a
    user has already gone through every set in the pool, a new one is generated,
    appended to the pool, and returned. Per-(lecture, user) generation is
    serialized by an advisory lock so a double-click can't generate twice.
    """
    lecture = await session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "lecture not found")
    if lecture.status != "done" or not lecture.transcript_path:
        raise HTTPException(409, "lecture is not ready yet")

    user = await get_or_create_user(session, user_name)

    # Serve an existing unused set if there is one.
    quiz_set = await _pick_unused_set(session, lecture_id, user.id)
    if quiz_set is not None:
        return Quiz(
            lecture_id=lecture_id,
            quiz_set_id=quiz_set.id,
            questions=[Question(**q) for q in quiz_set.questions_json],
            cached=True,
        )

    # User has exhausted the pool — generate a new set. Serialize per (lecture,
    # user): a concurrent duplicate request blocks here, then re-reads below.
    # Transaction-scoped, so it releases on commit/rollback (incl. on error).
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:l, :u)"), {"l": lecture_id, "u": user.id}
    )

    # Re-check: a racing request from this user may have added one meanwhile.
    quiz_set = await _pick_unused_set(session, lecture_id, user.id)
    if quiz_set is not None:
        return Quiz(
            lecture_id=lecture_id,
            quiz_set_id=quiz_set.id,
            questions=[Question(**q) for q in quiz_set.questions_json],
            cached=True,
        )

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "t.txt")
        storage.download(lecture.transcript_path, path)
        transcript = open(path, encoding="utf-8").read()

    questions = await generate_quiz(transcript, lecture.summary or "")
    if not questions:
        raise HTTPException(502, "не удалось сгенерировать вопросы")

    quiz_set = QuizSet(lecture_id=lecture_id, questions_json=questions)
    session.add(quiz_set)
    await session.commit()
    await session.refresh(quiz_set)
    return Quiz(
        lecture_id=lecture_id,
        quiz_set_id=quiz_set.id,
        questions=[Question(**q) for q in questions],
    )
