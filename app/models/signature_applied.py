"""A signature that actually happened.

The field that matters most here is `rubrica_object_key`. It points at a **copy** of
the signer's rubric, written at the moment of signing under its own prefix — not at
the rubric in their profile.

That copy is what lets two things be true at once, which the privacy decision in
GAP-004 requires: the owner of a rubric may change or withdraw it whenever they like,
and a signature applied months ago still shows exactly the mark that was made. If the
signature merely pointed at the profile rubric, exercising the right to delete would
silently rewrite history — or, worse, leave stamped PDFs pointing at nothing.

Nothing here can be updated by the API. A signature is a record of an event, and
events do not change.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AppliedSignature(Base):
    __tablename__ = "applied_signatures"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # One signature per request: signing twice is not a thing.
    signature_request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("signature_requests.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The version that was signed. A later version is a different document to the
    # reader, and this signature says nothing about it.
    document_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    signatario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    # Denormalised on purpose: the timeline must keep showing who signed even if the
    # user is later renamed.
    signatario_nome: Mapped[str] = mapped_column(String(32), nullable=False)

    assinado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Immutable copy of the rubric as it was at this moment.
    rubrica_object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    rubrica_tipo: Mapped[str] = mapped_column(String(100), nullable=False)
    rubrica_tamanho: Mapped[int] = mapped_column(Integer, nullable=False)
    rubrica_hash: Mapped[str] = mapped_column(String(64), nullable=False)
