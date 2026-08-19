"""add user_signatures

Registered rubric of a user. Only metadata lives here; the PNG goes to the same
object storage as the documents, under a `rubricas/` prefix.

`ondelete="CASCADE"` on user_id is safe and deliberate even though users are never
hard-deleted: it means that if a user row ever were removed, no orphan metadata would
be left pointing at an object nobody can reach.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

import sqlalchemy as sa
from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_signatures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("object_key", sa.String(length=500), nullable=False),
        sa.Column("tipo", sa.String(length=100), nullable=False),
        sa.Column("tamanho", sa.Integer(), nullable=False),
        sa.Column("hash", sa.String(length=64), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # One rubric per user: re-registering replaces it rather than adding a second.
    op.create_index(
        "ix_user_signatures_user_id", "user_signatures", ["user_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_user_signatures_user_id", table_name="user_signatures")
    op.drop_table("user_signatures")
