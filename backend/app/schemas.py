from datetime import datetime

from pydantic import BaseModel


# --- Users ---
class UserIn(BaseModel):
    name: str


class UserOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


# --- Lectures ---
class LectureCreate(BaseModel):
    title: str
    video_path: str  # MinIO key returned after the presigned upload


class LectureOut(BaseModel):
    id: int
    title: str
    status: str
    summary: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class PresignedUpload(BaseModel):
    upload_url: str
    object_key: str


# --- Quiz ---
class Question(BaseModel):
    question: str
    options: list[str]
    correct_index: int


class Quiz(BaseModel):
    lecture_id: int
    questions: list[Question]


# --- Attempts ---
class AnswerDetail(BaseModel):
    question: str
    options: list[str]
    user_answer: int
    correct: int
    is_correct: bool


class AttemptIn(BaseModel):
    user_name: str
    lecture_id: int
    score: int
    total: int
    details: list[AnswerDetail]


class AttemptOut(BaseModel):
    id: int
    lecture_id: int
    score: int
    total: int
    created_at: datetime

    class Config:
        from_attributes = True


class LectureProgress(BaseModel):
    lecture_id: int
    title: str
    attempts: int
    best_score: int | None
    last_score: int | None
    mastery_pct: float
