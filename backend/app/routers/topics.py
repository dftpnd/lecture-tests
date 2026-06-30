from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Topic
from app.routers.lectures import require_uploader
from app.schemas import TopicCreate, TopicOut

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("", response_model=list[TopicOut])
async def list_topics(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Topic).order_by(Topic.name))).scalars().all()
    return rows


@router.post("", response_model=TopicOut)
async def create_topic(payload: TopicCreate, session: AsyncSession = Depends(get_session)):
    """Create a topic (or return the existing one with the same name)."""
    require_uploader(payload.user_name)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "название темы не может быть пустым")

    existing = (
        await session.execute(select(Topic).where(Topic.name == name))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    topic = Topic(name=name)
    session.add(topic)
    await session.commit()
    await session.refresh(topic)
    return topic
