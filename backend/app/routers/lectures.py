import uuid

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import Lecture
from app.schemas import LectureCreate, LectureOut, PresignedUpload
from app import storage

router = APIRouter(prefix="/lectures", tags=["lectures"])


@router.get("/upload-url", response_model=PresignedUpload)
async def get_upload_url(filename: str):
    """Browser uploads the video straight to MinIO via this URL."""
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    object_key = f"videos/{uuid.uuid4().hex}.{ext}"
    return PresignedUpload(upload_url=storage.presigned_put(object_key), object_key=object_key)


@router.post("", response_model=LectureOut)
async def create_lecture(payload: LectureCreate, session: AsyncSession = Depends(get_session)):
    """Register an uploaded video and enqueue processing."""
    lecture = Lecture(title=payload.title, video_path=payload.video_path, status="pending")
    session.add(lecture)
    await session.commit()
    await session.refresh(lecture)

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("process_video", lecture.id, payload.video_path)
    return lecture


@router.get("", response_model=list[LectureOut])
async def list_lectures(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Lecture).order_by(Lecture.created_at.desc()))).scalars().all()
    return rows


@router.get("/{lecture_id}", response_model=LectureOut)
async def get_lecture(lecture_id: int, session: AsyncSession = Depends(get_session)):
    lecture = await session.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "lecture not found")
    return lecture
