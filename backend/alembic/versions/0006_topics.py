"""topics: group lectures by subject

Adds a `topics` table and a `topic_id` on lectures. Existing lectures are
backfilled into a default topic so the column can be made NOT NULL.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

DEFAULT_TOPIC = "LLM инженер (гигаскул)"


def upgrade() -> None:
    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_topics_name", "topics", ["name"], unique=True)

    # Seed the default topic and move all existing lectures into it.
    op.execute(sa.text("INSERT INTO topics (name) VALUES (:n)").bindparams(n=DEFAULT_TOPIC))

    op.add_column("lectures", sa.Column("topic_id", sa.Integer(), nullable=True))
    op.execute(
        sa.text(
            "UPDATE lectures SET topic_id = (SELECT id FROM topics WHERE name = :n) "
            "WHERE topic_id IS NULL"
        ).bindparams(n=DEFAULT_TOPIC)
    )
    op.alter_column("lectures", "topic_id", nullable=False)
    op.create_foreign_key(
        "fk_lectures_topic_id", "lectures", "topics", ["topic_id"], ["id"]
    )
    op.create_index("ix_lectures_topic_id", "lectures", ["topic_id"])


def downgrade() -> None:
    op.drop_index("ix_lectures_topic_id", table_name="lectures")
    op.drop_constraint("fk_lectures_topic_id", "lectures", type_="foreignkey")
    op.drop_column("lectures", "topic_id")
    op.drop_index("ix_topics_name", table_name="topics")
    op.drop_table("topics")
