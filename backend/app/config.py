from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres
    database_url: str = "postgresql+asyncpg://lectures:lectures@localhost:5432/lectures"

    # Redis / arq
    redis_url: str = "redis://localhost:6379/0"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "lectures"
    minio_secure: bool = False
    minio_public_endpoint: str = "localhost:9000"
    # Set explicitly so presigned-URL generation never makes a (blocking)
    # GetBucketLocation call — the public endpoint may be unreachable from the
    # API pod (e.g. an external IP with no NAT hairpin), which would stall the
    # async event loop. MinIO's default region is us-east-1.
    minio_region: str = "us-east-1"

    # vLLM
    vllm_base_url: str = "http://192.168.1.116:30800/v1"
    vllm_model: str = "qwen3-14b-awq"

    # Whisper
    whisper_model: str = "large-v3"
    whisper_device: str = "cuda"
    whisper_compute_type: str = "float16"
    whisper_language: str = "ru"
    # Persisted cache so large-v3 isn't re-downloaded on every restart.
    whisper_download_root: str | None = None

    # Dev convenience: create tables on startup. Disable in prod (use Alembic).
    auto_create_tables: bool = True

    # Only these users (by login name) may upload lecture videos. Comma-separated.
    upload_allowed_users: str = "dft,li,Гоша"

    @property
    def upload_allowlist(self) -> set[str]:
        return {n.strip() for n in self.upload_allowed_users.split(",") if n.strip()}


settings = Settings()
