"""Registered handwritten rubric of a user (the "rubrica de perfil").

This is deliberately a table of its own rather than columns on `users`, because the
two have opposite lifecycles. A user is never hard-deleted — authorship and the audit
trail depend on the row surviving — but the rubric image *is* deletable: it is
personal data under the LGPD and its owner may withdraw it at any time. Deleting a row
here is therefore a normal operation, while deleting a user is not.

The image itself never lives in Postgres. It goes to the same MinIO bucket as the
documents under a `rubricas/` prefix, and only the metadata is stored here — the same
split the rest of the system already uses (file to object storage, metadata to the
database).

Crucially this is *not* what a signature is made of. When a document is signed, the
rubric is copied into the signature record as an immutable snapshot, so a later change
or deletion here can never alter what a past signature looked like.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UserSignature(Base):
    __tablename__ = "user_signatures"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # One rubric per user: re-registering replaces the previous one.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    tipo: Mapped[str] = mapped_column(String(100), nullable=False)
    tamanho: Mapped[int] = mapped_column(Integer, nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
