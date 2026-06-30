from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    # NULL = registered before passwords existed; set on next login (migration).
    password_hash: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attempts: Mapped[list["Attempt"]] = relationship(back_populates="user")


class Topic(Base):
    """A subject a lecture belongs to (e.g. a course). Lectures are grouped by it."""

    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lectures: Mapped[list["Lecture"]] = relationship(back_populates="topic")


class Lecture(Base):
    __tablename__ = "lectures"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    # pending -> [downloading ->] extracting -> transcribing -> structuring -> done | failed
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    video_path: Mapped[str | None] = mapped_column(String(500))       # MinIO object key
    transcript_path: Mapped[str | None] = mapped_column(String(500))  # MinIO object key
    summary: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    topic: Mapped[Topic] = relationship(back_populates="lectures")
    attempts: Mapped[list["Attempt"]] = relationship(back_populates="lecture")
    quiz_sets: Mapped[list["QuizSet"]] = relationship(back_populates="lecture")


class QuizSet(Base):
    """One generated set of questions for a lecture.

    Lectures hold a growing pool of sets. Each user is served a set they haven't
    attempted yet; when a user has exhausted the whole pool, a new set is
    generated and appended (and becomes available to everyone else too).
    """

    __tablename__ = "quiz_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    lecture_id: Mapped[int] = mapped_column(ForeignKey("lectures.id"), index=True)
    # list of {question, options, correct_index}
    questions_json: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lecture: Mapped[Lecture] = relationship(back_populates="quiz_sets")
    attempts: Mapped[list["Attempt"]] = relationship(back_populates="quiz_set")


class QuestionVote(Base):
    """One user's reaction (💀 / ❤️) to one question of a quiz set.

    A question is identified by (quiz_set_id, question_index). Sets are shared
    across users, so the counts aggregate everyone who was served that set.
    One reaction per user per question — re-voting changes or clears it.
    """

    __tablename__ = "question_votes"
    __table_args__ = (
        UniqueConstraint("quiz_set_id", "question_index", "user_id", name="uq_vote_per_user_question"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_set_id: Mapped[int] = mapped_column(ForeignKey("quiz_sets.id"), index=True)
    question_index: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reaction: Mapped[str] = mapped_column(String(10))  # "skull" | "heart"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    lecture_id: Mapped[int] = mapped_column(ForeignKey("lectures.id"), index=True)
    # Which set this attempt was taken on (nullable: pre-pool attempts predate it).
    quiz_set_id: Mapped[int | None] = mapped_column(ForeignKey("quiz_sets.id"), index=True)
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    # per-question breakdown: [{question, options, user_answer, correct, is_correct}, ...]
    details_json: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="attempts")
    lecture: Mapped[Lecture] = relationship(back_populates="attempts")
    quiz_set: Mapped["QuizSet | None"] = relationship(back_populates="attempts")
