"""add signature_requests

Bound to `document_version_id`, not just to the document: coordinates only mean
something against the pagination that was on screen when the area was marked, so a
request cannot outlive the version it was drawn on.

Coordinates are fractions of the page with the origin at the top-left, as drawn on a
canvas. The flip to the PDF's bottom-left origin happens at stamping time.
`page_width`/`page_height` in points are captured here because one PDF may mix page
sizes, and without them a fraction cannot be turned back into a position.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""

import sqlalchemy as sa
from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None

# Rotulos em MAIUSCULA porque o SQLAlchemy persiste o **nome** do membro do enum,
# nao o valor: `SignatureRequestStatus.PENDENTE` chega ao banco como "PENDENTE".
# A migracao inicial ja segue essa convencao ('ADMINISTRADOR', 'ENVIADO'...), e
# divergir dela faria todo INSERT falhar no PostgreSQL.
#
# O tipo tambem NAO e criado explicitamente: `create_table` ja o cria, e chamar
# `.create()` antes resulta em "type already exists".
STATUS = sa.Enum(
    "PENDENTE",
    "ASSINADA",
    "RECUSADA",
    "CANCELADA",
    name="signature_request_status",
)


def upgrade() -> None:
    op.create_table(
        "signature_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("signatario_id", sa.Uuid(), nullable=False),
        sa.Column("solicitante_id", sa.Uuid(), nullable=False),
        sa.Column("pagina", sa.Integer(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("largura", sa.Float(), nullable=False),
        sa.Column("altura", sa.Float(), nullable=False),
        sa.Column("page_width", sa.Float(), nullable=False),
        sa.Column("page_height", sa.Float(), nullable=False),
        sa.Column("status", STATUS, nullable=False),
        sa.Column("motivo", sa.String(length=500), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("encerrado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["document_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["signatario_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["solicitante_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_signature_requests_document_id", "signature_requests", ["document_id"]
    )
    op.create_index(
        "ix_signature_requests_document_version_id",
        "signature_requests",
        ["document_version_id"],
    )
    op.create_index(
        "ix_signature_requests_signatario_id", "signature_requests", ["signatario_id"]
    )
    op.create_index("ix_signature_requests_status", "signature_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_signature_requests_status", table_name="signature_requests")
    op.drop_index("ix_signature_requests_signatario_id", table_name="signature_requests")
    op.drop_index(
        "ix_signature_requests_document_version_id", table_name="signature_requests"
    )
    op.drop_index("ix_signature_requests_document_id", table_name="signature_requests")
    op.drop_table("signature_requests")
    STATUS.drop(op.get_bind(), checkfirst=True)
