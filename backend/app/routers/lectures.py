import re
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
from app.schemas import LectureCreate, LectureOut, PresignedUpload, YoutubeIngest, YoutubeInfo
from app import storage

router = APIRouter(prefix="/lectures", tags=["lectures"])

# Cheap host check only — the real validation (reachable, public, downloadable)
# happens in the worker, which surfaces failures via the lecture's status/error.
_YOUTUBE_URL = re.compile(
    r"^https?://(www\.|m\.)?(youtube\.com/(watch\?|live/|shorts/)|youtu\.be/)", re.IGNORECASE
)


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


def _fetch_youtube_info(url: str) -> dict:
    """Read-only metadata lookup (no download). Blocking — call in a threadpool."""
    import yt_dlp

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 15,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "title": info.get("title") or "",
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
    }


@router.get("/youtube/info", response_model=YoutubeInfo)
async def youtube_info(url: str, user_name: str):
    """Preview a YouTube URL (title/duration) so the uploader confirms before ingesting."""
    require_uploader(user_name)
    url = url.strip()
    if not _YOUTUBE_URL.match(url):
        raise HTTPException(422, "ожидается ссылка на видео YouTube")
    try:
        return await run_in_threadpool(_fetch_youtube_info, url)
    except Exception as exc:  # noqa: BLE001 — surface a readable error to the form
        raise HTTPException(400, f"не удалось прочитать видео: {exc}")


@router.post("/youtube", response_model=LectureOut)
async def ingest_youtube(payload: YoutubeIngest, session: AsyncSession = Depends(get_session)):
    """Register a lecture from a YouTube URL; the worker downloads it server-side."""
    require_uploader(payload.user_name)
    url = payload.url.strip()
    if not _YOUTUBE_URL.match(url):
        raise HTTPException(422, "ожидается ссылка на видео YouTube")
    if await session.get(Topic, payload.topic_id) is None:
        raise HTTPException(404, "тема не найдена")

    title = (payload.title or "").strip() or "Видео с YouTube"
    lecture = Lecture(topic_id=payload.topic_id, title=title, status="pending")
    session.add(lecture)
    await session.commit()
    await session.refresh(lecture)

    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("process_video", lecture.id, source_url=url)
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
