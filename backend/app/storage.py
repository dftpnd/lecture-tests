from datetime import timedelta

from minio import Minio

from app.config import settings

# Internal client (cluster/network-internal endpoint) for server-side ops.
_client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
    region=settings.minio_region,
)

# Public client: generates presigned URLs reachable from the browser. region is
# pinned so presigning stays purely local — the public endpoint may not be
# reachable from here (external IP, no hairpin), and a GetBucketLocation lookup
# would block the event loop.
_public_client = Minio(
    settings.minio_public_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
    region=settings.minio_region,
)


def ensure_bucket() -> None:
    if not _client.bucket_exists(settings.minio_bucket):
        _client.make_bucket(settings.minio_bucket)


def presigned_put(object_key: str, expires_minutes: int = 60) -> str:
    """URL the browser PUTs the video to directly (bypassing the API)."""
    return _public_client.presigned_put_object(
        settings.minio_bucket, object_key, expires=timedelta(minutes=expires_minutes)
    )


def presigned_get(object_key: str, expires_minutes: int = 60) -> str:
    return _public_client.presigned_get_object(
        settings.minio_bucket, object_key, expires=timedelta(minutes=expires_minutes)
    )


def download(object_key: str, file_path: str) -> None:
    _client.fget_object(settings.minio_bucket, object_key, file_path)


def upload(object_key: str, file_path: str, content_type: str = "application/octet-stream") -> None:
    _client.fput_object(settings.minio_bucket, object_key, file_path, content_type=content_type)


def upload_stream(object_key: str, data, content_type: str = "application/octet-stream") -> None:
    """Stream a file-like object of unknown length into MinIO (multipart).

    Blocking; call via run_in_threadpool from async code so the event loop
    isn't stalled for the duration of the upload.
    """
    _client.put_object(
        settings.minio_bucket,
        object_key,
        data,
        length=-1,
        content_type=content_type,
        part_size=10 * 1024 * 1024,
    )
