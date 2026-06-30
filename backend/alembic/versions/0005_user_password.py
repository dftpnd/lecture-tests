"""user passwords: add nullable password_hash

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable: existing users keep NULL until they set a password on next login.
    op.add_column("users", sa.Column("password_hash", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_hash")
