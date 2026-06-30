from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Attempt, User
from app.schemas import UserIn, UserOut, UserProgressSummary, UserStatus
from app.security import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])


async def find_user_by_name(session: AsyncSession, name: str) -> User | None:
    """Look a user up by login name, ignoring case (and surrounding spaces)."""
    name = name.strip()
    return (
        await session.execute(select(User).where(func.lower(User.name) == name.lower()))
    ).scalar_one_or_none()


async def get_or_create_user(session: AsyncSession, name: str) -> User:
    """Used by post-login actions; the user already exists by then."""
    name = name.strip()
    user = await find_user_by_name(session, name)
    if user is None:
        user = User(name=name)
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


@router.get("/check", response_model=UserStatus)
async def check(name: str, session: AsyncSession = Depends(get_session)):
    """Tells the login form whether to register, prompt a password, or set one up."""
    user = await find_user_by_name(session, name)
    return UserStatus(exists=user is not None, has_password=bool(user and user.password_hash))


@router.post("", response_model=UserOut)
async def login(payload: UserIn, session: AsyncSession = Depends(get_session)):
    """Register a new user, set a password on first migration, or verify an existing one.

    The password-confirmation step lives in the UI; here we receive it once.
    """
    name = payload.name.strip()
    password = payload.password
    if not name or not password:
        raise HTTPException(status_code=422, detail="Имя и пароль обязательны")

    user = await find_user_by_name(session, name)

    if user is None:
        # New user — register with the chosen password.
        user = User(name=name, password_hash=hash_password(password))
        session.add(user)
    elif user.password_hash is None:
        # Existing user from before passwords — set one now (migration).
        user.password_hash = hash_password(password)
    elif not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль")

    await session.commit()
    await session.refresh(user)
    return user


@router.get("", response_model=list[UserProgressSummary])
async def list_users(session: AsyncSession = Depends(get_session)):
    """Everyone and their progress, ranked by average mastery (best first)."""
    users = (await session.execute(select(User))).scalars().all()
    attempts = (await session.execute(select(Attempt))).scalars().all()

    # best mastery per (user, lecture): max(score/total)
    best: dict[int, dict[int, float]] = {}
    counts: dict[int, int] = {}
    for a in attempts:
        counts[a.user_id] = counts.get(a.user_id, 0) + 1
        per_lec = best.setdefault(a.user_id, {})
        ratio = a.score / a.total if a.total else 0.0
        if ratio > per_lec.get(a.lecture_id, 0.0):
            per_lec[a.lecture_id] = ratio

    out: list[UserProgressSummary] = []
    for u in users:
        per_lec = best.get(u.id, {})
        avg = sum(per_lec.values()) / len(per_lec) if per_lec else 0.0
        out.append(
            UserProgressSummary(
                name=u.name,
                attempts=counts.get(u.id, 0),
                lectures_started=len(per_lec),
                avg_mastery_pct=round(avg * 100, 1),
                created_at=u.created_at,
            )
        )
    out.sort(key=lambda r: r.avg_mastery_pct, reverse=True)
    return out
