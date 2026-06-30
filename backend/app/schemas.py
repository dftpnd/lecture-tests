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
    user_name: str   # uploader's login name; must be on the upload allowlist
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
    quiz_set_id: int  # which set was served; echoed back when submitting the attempt
    questions: list[Question]
    cached: bool = False  # True = reused an existing set, False = generated now


# --- Question votes ---
Reaction = str  # "skull" | "heart"


class VoteIn(BaseModel):
    user_name: str
    reaction: Reaction  # "skull" | "heart"


class QuestionVotes(BaseModel):
    """Aggregate reactions for one question, plus the caller's own choice."""

    question_index: int
    skull: int
    heart: int
    mine: Reaction | None = None  # caller's reaction, or None


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
    quiz_set_id: int | None = None  # the set this attempt was taken on
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


class AttemptHistory(BaseModel):
    """A past attempt with its full per-question breakdown for review."""

    id: int
    lecture_id: int
    lecture_title: str
    score: int
    total: int
    details: list[AnswerDetail]
    created_at: datetime
