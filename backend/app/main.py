from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, engine
from app.routers import attempts, lectures, quiz, users, votes
from app.storage import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience only — prod runs Alembic migrations (auto_create_tables=false).
    if settings.auto_create_tables:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    ensure_bucket()
    yield


app = FastAPI(title="Lecture → Tests", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(lectures.router)
app.include_router(quiz.router)
app.include_router(attempts.router)
app.include_router(votes.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
