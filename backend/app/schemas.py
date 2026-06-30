from datetime import datetime

from pydantic import BaseModel


# --- Users ---
class UserIn(BaseModel):
    name: str
    password: str


class UserStatus(BaseModel):
    """What the login form needs to know before asking for a password."""

    exists: bool        # is this name already registered?
    has_password: bool  # does it already have a password (vs. needs to set one)?


class UserOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class UserProgressSummary(BaseModel):
    """One row of the users-and-progress overview."""

    name: str
    attempts: int            # total attempts across all lectures
    lectures_started: int    # distinct lectures the user has attempted
    avg_mastery_pct: float   # mean best-mastery over the lectures they started
    created_at: datetime


# --- Topics ---
class TopicCreate(BaseModel):
    user_name: str  # creator's login name; must be on the upload allowlist
    name: str


class TopicOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


# --- Lectures ---
class LectureCreate(BaseModel):
    user_name: str   # uploader's login name; must be on the upload allowlist
    topic_id: int    # which topic the lecture belongs to
    title: str
    video_path: str  # MinIO key returned after the presigned upload


class LectureOut(BaseModel):
    id: int
    topic_id: int
    title: str
    status: str
    summary: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class PresignedUpload(BaseModel):
    upload_url: str
    object_key: str


class YoutubeIngest(BaseModel):
    user_name: str  # uploader's login name; must be on the upload allowlist
    topic_id: int   # which topic the lecture belongs to
    url: str        # YouTube watch/share URL; the worker downloads it server-side
    title: str | None = None  # optional; a real title is derived from the summary later


class YoutubeInfo(BaseModel):
    """Lightweight metadata so the uploader can confirm the right video first."""

    title: str
    duration: int | None = None  # seconds
    uploader: str | None = None


# --- Quiz ---
class Question(BaseModel):
    question: str
    options: list[str]
    correct_index: int


class Quiz(BaseModel):
    lecture_id: int
    quiz_set_id: int  # which set was served; echoed back when submitting the attempt
    # A lecture's sets form an ordered pool; version is this set's 1-based position
    # in it, total_versions the pool size. Drives the shareable URL /t/<lec>/<ver>.
    version: int
    total_versions: int
    questions: list[Question]
    cached: bool = False  # True = reused an existing set, False = generated now


class SharedQuiz(BaseModel):
    """A specific generation of a lecture's test — the shareable-link target.

    Identified in the URL by (lecture_id, version): version is the set's 1-based
    position among the lecture's sets ordered by creation, total_versions the
    number of generations available to switch between.
    """

    lecture_id: int
    lecture_title: str  # the set carries no title of its own; pull it from the lecture
    quiz_set_id: int
    version: int
    total_versions: int
    questions: list[Question]


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
