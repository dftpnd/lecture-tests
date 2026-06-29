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

    # vLLM
    vllm_base_url: str = "http://192.168.1.116:30800/v1"
    vllm_model: str = "qwen3-14b-awq"

    # Whisper
    whisper_model: str = "large-v3"
    whisper_device: str = "cuda"
    whisper_compute_type: str = "float16"
    whisper_language: str = "ru"


settings = Settings()
