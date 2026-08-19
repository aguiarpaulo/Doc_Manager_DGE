"""A request for someone to sign a specific spot on a specific version of a document.

Two things in this model exist because of how PDFs actually work, and getting either
wrong puts a rubric somewhere the requester never pointed at.

**Coordinates are normalised, with the origin at the top-left.** They are stored as
fractions of the page (0..1) exactly as the person drew them on screen, because a
canvas measures from the top-left. A PDF measures from the *bottom*-left, so the flip
happens once, at stamping time — not here, and not in the browser.

**The page size in points is captured at marking time.** A PDF may mix page sizes in
one file; without knowing the page the requester was looking at, a fraction cannot be
turned back into a position, and the rubric lands somewhere else on exactly those
pages that differ.

The request is bound to `document_version_id`, never to the document alone: a new
version may repaginate, so a pending request from an older version can no longer be
honoured (NODE-031 cancels those).
"""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SignatureRequestStatus(enum.StrEnum):
    PENDENTE = "pendente"
    ASSINADA = "assinada"
    RECUSADA = "recusada"
    CANCELADA = "cancelada"


class SignatureRequest(Base):
    __tablename__ = "signature_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The exact version the area was marked on. Coordinates only mean something
    # against the pagination that was on screen at the time.
    document_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )

    signatario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    solicitante_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    # 1-based, as the reader counts pages.
    pagina: Mapped[int] = mapped_column(Integer, nullable=False)

    # Fractions of the page, origin top-left, as drawn.
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    largura: Mapped[float] = mapped_column(Float, nullable=False)
    altura: Mapped[float] = mapped_column(Float, nullable=False)

    # Size in points of the page the requester was looking at.
    page_width: Mapped[float] = mapped_column(Float, nullable=False)
    page_height: Mapped[float] = mapped_column(Float, nullable=False)

    status: Mapped[SignatureRequestStatus] = mapped_column(
        SAEnum(SignatureRequestStatus, name="signature_request_status"),
        default=SignatureRequestStatus.PENDENTE,
        nullable=False,
        index=True,
    )
    # Filled when refused or cancelled; the timeline shows it.
    motivo: Mapped[str | None] = mapped_column(String(500), nullable=True)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    encerrado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
