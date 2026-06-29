# Single image for both API and worker. Worker needs ffmpeg + CUDA libs (provided
# by faster-whisper wheels + the host GPU via nvidia runtime).
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e . || pip install --no-cache-dir \
    fastapi "uvicorn[standard]" "sqlalchemy[asyncio]" asyncpg alembic \
    pydantic-settings python-multipart minio arq httpx faster-whisper

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
