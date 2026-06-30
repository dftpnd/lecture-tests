from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Attempt, Lecture, User
from app.routers.users import get_or_create_user
from app.schemas import AttemptHistory, AttemptIn, AttemptOut, LectureProgress

router = APIRouter(tags=["attempts"])


@router.post("/attempts", response_model=AttemptOut)
async def submit_attempt(payload: AttemptIn, session: AsyncSession = Depends(get_session)):
    """Client checks answers locally and submits the per-question breakdown."""
    user = await get_or_create_user(session, payload.user_name)
    attempt = Attempt(
        user_id=user.id,
        lecture_id=payload.lecture_id,
        score=payload.score,
        total=payload.total,
        details_json=[d.model_dump() for d in payload.details],
    )
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)
    return attempt


@router.get("/users/{name}/progress", response_model=list[LectureProgress])
async def user_progress(name: str, session: AsyncSession = Depends(get_session)):
    """Variant B: per-lecture history + mastery for the progress bars."""
    user = (await session.execute(select(User).where(User.name == name.strip()))).scalar_one_or_none()
    if user is None:
        raise HTTPException(404, "user not found")

    lectures = (await session.execute(select(Lecture))).scalars().all()
    attempts = (
        await session.execute(select(Attempt).where(Attempt.user_id == user.id).order_by(Attempt.created_at))
    ).scalars().all()

    by_lecture: dict[int, list[Attempt]] = {}
    for a in attempts:
        by_lecture.setdefault(a.lecture_id, []).append(a)

    out: list[LectureProgress] = []
    for lec in lectures:
        items = by_lecture.get(lec.id, [])
        best = max((a.score / a.total for a in items), default=0.0) if items else 0.0
        out.append(
            LectureProgress(
                lecture_id=lec.id,
                title=lec.title,
                attempts=len(items),
                best_score=max((a.score for a in items), default=None) if items else None,
                last_score=items[-1].score if items else None,
                mastery_pct=round(best * 100, 1),
            )
        )
    return out


@router.get("/users/{name}/attempts", response_model=list[AttemptHistory])
async def user_attempts(
    name: str,
    lecture_id: int | None = None,
    session: AsyncSession = Depends(get_session),
):
    """Full per-question history for review (newest first), optionally one lecture."""
    user = (await session.execute(select(User).where(User.name == name.strip()))).scalar_one_or_none()
    if user is None:
        raise HTTPException(404, "user not found")

    query = (
        select(Attempt, Lecture.title)
        .join(Lecture, Attempt.lecture_id == Lecture.id)
        .where(Attempt.user_id == user.id)
        .order_by(Attempt.created_at.desc())
    )
    if lecture_id is not None:
        query = query.where(Attempt.lecture_id == lecture_id)

    rows = (await session.execute(query)).all()
    return [
        AttemptHistory(
            id=a.id,
            lecture_id=a.lecture_id,
            lecture_title=title,
            score=a.score,
            total=a.total,
            details=a.details_json,
            created_at=a.created_at,
        )
        for a, title in rows
    ]
