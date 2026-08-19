"""add applied_signatures

`rubrica_object_key` points at a copy of the rubric written when the signature was
made, never at the signer's profile rubric. That is what lets the owner change or
withdraw their rubric without rewriting what a past signature showed.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

import sqlalchemy as sa
from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "applied_signatures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("signature_request_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("signatario_id", sa.Uuid(), nullable=False),
        sa.Column("signatario_nome", sa.String(length=32), nullable=False),
        sa.Column("assinado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rubrica_object_key", sa.String(length=500), nullable=False),
        sa.Column("rubrica_tipo", sa.String(length=100), nullable=False),
        sa.Column("rubrica_tamanho", sa.Integer(), nullable=False),
        sa.Column("rubrica_hash", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(
            ["signature_request_id"], ["signature_requests.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["signatario_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    # One signature per request: signing twice is not a thing.
    op.create_index(
        "ix_applied_signatures_request",
        "applied_signatures",
        ["signature_request_id"],
        unique=True,
    )
    op.create_index("ix_applied_signatures_document", "applied_signatures", ["document_id"])
    op.create_index(
        "ix_applied_signatures_version", "applied_signatures", ["document_version_id"]
    )
    op.create_index(
        "ix_applied_signatures_signatario", "applied_signatures", ["signatario_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_applied_signatures_signatario", table_name="applied_signatures")
    op.drop_index("ix_applied_signatures_version", table_name="applied_signatures")
    op.drop_index("ix_applied_signatures_document", table_name="applied_signatures")
    op.drop_index("ix_applied_signatures_request", table_name="applied_signatures")
    op.drop_table("applied_signatures")
