import uuid

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import Lecture, Topic
from app.schemas import LectureCreate, LectureOut, PresignedUpload
from app import storage

router = APIRouter(prefix="/lectures", tags=["lectures"])


def require_uploader(user_name: str) -> str:
    """Only allow-listed users may upload lectures (identity is the login name)."""
    name = user_name.strip()
    if name not in settings.upload_allowlist:
        raise HTTPException(403, "у этого пользователя нет прав на загрузку лекций")
    return name


@router.get("/upload-url", response_model=PresignedUpload)
async def get_upload_url(filename: str, user_name: str):
    """Browser uploads the video straight to MinIO via this URL."""
    require_uploader(user_name)
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    object_key = f"videos/{uuid.uuid4().hex}.{ext}"
    return PresignedUpload(upload_url=storage.presigned_put(object_key), object_key=object_key)


@router.post("", response_model=LectureOut)
async def create_lecture(payload: LectureCreate, session: AsyncSession = Depends(get_session)):
    """Register an uploaded video and enqueue processing."""
    require_uploader(payload.user_name)
    if await session.get(Topic, payload.topic_id) is None:
        raise HTTPException(404, "тема не найдена")
    lecture = Lecture(
        topic_id=payload.topic_id,
        title=payload.title,
        video_path=payload.video_path,
        status="pending",
    )
    session.add(lecture)
    await session.commit()
    await session.refresh(lecture)

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("process_video", lecture.id, payload.video_path)
    return lecture


@router.post("/upload", response_model=LectureOut)
async def upload_lecture(
    file: UploadFile = File(...),
    user_name: str = Form(...),
    topic_id: int = Form(...),
    title: str = Form(...),
    session: AsyncSession = Depends(get_session),
):
    """Receive the video through the API and stream it into MinIO server-side.

    Avoids exposing MinIO to the browser (no presigned URLs / public endpoint).
    The blocking upload runs in a threadpool so it never stalls the event loop.
    """
    require_uploader(user_name)
    if await session.get(Topic, topic_id) is None:
        raise HTTPException(404, "тема не найдена")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "mp4"
    object_key = f"videos/{uuid.uuid4().hex}.{ext}"
    await run_in_threadpool(
        storage.upload_stream, object_key, file.file, file.content_type or "application/octet-stream"
    )

    lecture = Lecture(topic_id=topic_id, title=title, video_path=object_key, status="pending")
    session.add(lecture)
    await session.commit()
    await session.refresh(lecture)

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("process_video", lecture.id, object_key)
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
