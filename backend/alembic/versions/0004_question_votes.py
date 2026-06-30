"""question votes: 💀 / ❤️ reactions per question

Per-(quiz_set, question) reactions, one per user, aggregated across everyone
served that set.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "question_votes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("quiz_set_id", sa.Integer(), sa.ForeignKey("quiz_sets.id"), nullable=False),
        sa.Column("question_index", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reaction", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("quiz_set_id", "question_index", "user_id", name="uq_vote_per_user_question"),
    )
    op.create_index("ix_question_votes_quiz_set_id", "question_votes", ["quiz_set_id"])
    op.create_index("ix_question_votes_user_id", "question_votes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_question_votes_user_id", table_name="question_votes")
    op.drop_index("ix_question_votes_quiz_set_id", table_name="question_votes")
    op.drop_table("question_votes")
