"""arq GPU worker: ffmpeg -> faster-whisper -> vLLM structuring -> persist.

Runs with concurrency=1 because a single GPU is shared (time-slicing) with vLLM.
"""

import glob
import os
import tempfile

from arq.connections import RedisSettings
from sqlalchemy import update

from app.config import settings
from app.db import SessionLocal
from app.models import Lecture
from app.storage import download, upload
from app.vllm_client import generate_title, summarize

# faster-whisper is heavy; import lazily so the API image need not load CUDA.
_whisper_model = None


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel

        _whisper_model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
            download_root=settings.whisper_download_root or None,
        )
    return _whisper_model


async def _set_status(lecture_id: int, status: str, **fields) -> None:
    async with SessionLocal() as s:
        await s.execute(
            update(Lecture).where(Lecture.id == lecture_id).values(status=status, **fields)
        )
        await s.commit()


def _extract_audio(video_path: str, audio_path: str) -> None:
    # 16kHz mono wav — what Whisper expects.
    os.system(
        f'ffmpeg -y -i "{video_path}" -ac 1 -ar 16000 -vn "{audio_path}" '
        f">/dev/null 2>&1"
    )


def _transcribe(audio_path: str) -> str:
    model = _get_whisper()
    segments, _ = model.transcribe(audio_path, language=settings.whisper_language)
    return "\n".join(seg.text.strip() for seg in segments)


def _download_youtube(url: str, out_dir: str) -> str:
    """Download just the audio track of a YouTube video into out_dir.

    We only ever need the audio (Whisper transcribes it) and never store the
    video, so grabbing bestaudio keeps the download small. Returns the path to
    the downloaded media file. Needs ffmpeg (already in the worker image).
    """
    import yt_dlp

    out_tmpl = os.path.join(out_dir, "source.%(ext)s")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out_tmpl,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    files = glob.glob(os.path.join(out_dir, "source.*"))
    if not files:
        raise RuntimeError("не удалось скачать видео с YouTube")
    return files[0]


async def process_video(
    ctx: dict, lecture_id: int, video_key: str | None = None, source_url: str | None = None
) -> None:
    """Full pipeline for one lecture, sourced from MinIO (upload) or YouTube (URL)."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            audio_path = os.path.join(tmp, "audio.wav")
            transcript_path = os.path.join(tmp, "transcript.txt")

            if source_url:
                await _set_status(lecture_id, "downloading")
                media_path = _download_youtube(source_url, tmp)
            else:
                media_path = os.path.join(tmp, "video.mp4")
                download(video_key, media_path)

            await _set_status(lecture_id, "extracting")
            _extract_audio(media_path, audio_path)

            await _set_status(lecture_id, "transcribing")
            transcript = _transcribe(audio_path)
            with open(transcript_path, "w", encoding="utf-8") as f:
                f.write(transcript)
            transcript_key = f"transcripts/{lecture_id}.txt"
            upload(transcript_key, transcript_path, content_type="text/plain")

            await _set_status(lecture_id, "structuring", transcript_path=transcript_key)
            summary = await summarize(transcript)
            # Derive a short topic title from the summary so lectures/tests get
            # meaningful names instead of the uploaded filename.
            title = await generate_title(summary)

            done_fields = {"summary": summary}
            if title:
                done_fields["title"] = title
            await _set_status(lecture_id, "done", **done_fields)
    except Exception as exc:  # noqa: BLE001 — surface failure to the UI
        await _set_status(lecture_id, "failed", error=str(exc))
        raise


class WorkerSettings:
    functions = [process_video]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 1  # one GPU job at a time
    # Transcription of a long lecture far exceeds arq's 300s default, which would
    # cancel + retry the job forever. Allow up to 3h per job, retry at most twice.
    job_timeout = 10800
    max_tries = 2
