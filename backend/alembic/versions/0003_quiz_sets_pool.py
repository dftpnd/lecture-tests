"""quiz set pool: per-user one-shot sets

Replaces the single cached quiz on each lecture with a pool of quiz_sets, and
records which set every attempt used so a user is never re-served a set they've
already taken.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quiz_sets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lecture_id", sa.Integer(), sa.ForeignKey("lectures.id"), nullable=False),
        sa.Column("questions_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_quiz_sets_lecture_id", "quiz_sets", ["lecture_id"])

    op.add_column("attempts", sa.Column("quiz_set_id", sa.Integer(), sa.ForeignKey("quiz_sets.id"), nullable=True))
    op.create_index("ix_attempts_quiz_set_id", "attempts", ["quiz_set_id"])

    # Migrate each lecture's single cached set into the pool, then point existing
    # attempts at it so those users won't be re-served the set they already took.
    # (At this point there is at most one set per lecture, so the join is unambiguous.)
    op.execute(
        "INSERT INTO quiz_sets (lecture_id, questions_json) "
        "SELECT id, questions_json FROM lectures WHERE questions_json IS NOT NULL"
    )
    op.execute(
        "UPDATE attempts a SET quiz_set_id = qs.id "
        "FROM quiz_sets qs WHERE qs.lecture_id = a.lecture_id"
    )

    op.drop_column("lectures", "questions_json")


def downgrade() -> None:
    op.add_column("lectures", sa.Column("questions_json", sa.JSON(), nullable=True))
    # Restore the oldest set per lecture into the lecture column (best effort).
    op.execute(
        "UPDATE lectures l SET questions_json = qs.questions_json "
        "FROM ("
        "  SELECT DISTINCT ON (lecture_id) lecture_id, questions_json "
        "  FROM quiz_sets ORDER BY lecture_id, id"
        ") qs WHERE qs.lecture_id = l.id"
    )

    op.drop_index("ix_attempts_quiz_set_id", table_name="attempts")
    op.drop_column("attempts", "quiz_set_id")
    op.drop_index("ix_quiz_sets_lecture_id", table_name="quiz_sets")
    op.drop_table("quiz_sets")
