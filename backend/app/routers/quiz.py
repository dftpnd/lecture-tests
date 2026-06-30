import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Lecture
from app.schemas import Question, Quiz
from app import storage
from app.vllm_client import generate_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/{lecture_id}", response_model=Quiz)
async def make_quiz(lecture_id: int, session: AsyncSession = Depends(get_session)):
    """Generate fresh MCQs on demand when the user starts a test.

    Count is chosen by the model from the lecture's content (capped at 50);
    questions are drawn from the whole lecture, not just its start.
    """
    lecture = await session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "lecture not found")
    if lecture.status != "done" or not lecture.transcript_path:
        raise HTTPException(409, "lecture is not ready yet")

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "t.txt")
        storage.download(lecture.transcript_path, path)
        transcript = open(path, encoding="utf-8").read()

    questions = await generate_quiz(transcript, lecture.summary or "")
    if not questions:
        raise HTTPException(502, "не удалось сгенерировать вопросы")
    return Quiz(lecture_id=lecture_id, questions=[Question(**q) for q in questions])
