from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from app.schemas import UserIn, UserOut

router = APIRouter(prefix="/users", tags=["users"])


async def get_or_create_user(session: AsyncSession, name: str) -> User:
    name = name.strip()
    user = (await session.execute(select(User).where(User.name == name))).scalar_one_or_none()
    if user is None:
        user = User(name=name)
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


@router.post("", response_model=UserOut)
async def login(payload: UserIn, session: AsyncSession = Depends(get_session)):
    """No passwords — a unique name identifies the user."""
    return await get_or_create_user(session, payload.name)
