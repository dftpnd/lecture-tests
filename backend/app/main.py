from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine
from app.routers import attempts, lectures, quiz, users
from app.storage import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience: create tables + bucket on startup. Use Alembic in prod.
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


@app.get("/health")
async def health():
    return {"status": "ok"}
