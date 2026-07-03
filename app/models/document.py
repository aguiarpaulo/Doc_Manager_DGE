"""Document metadata model, category and status enumerations."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Category(enum.StrEnum):
    CONTRATO = "contrato"
    PROJETO = "projeto"
    NOTA_FISCAL = "nota_fiscal"
    LICENCA = "licenca"
    LAUDO = "laudo"
    OUTROS = "outros"


class DocumentStatus(enum.StrEnum):
    ENVIADO = "enviado"
    EM_ANALISE = "em_analise"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    nome: Mapped[str] = mapped_column(String(300), nullable=False)
    obra_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("obras.id", ondelete="CASCADE"), nullable=False, index=True
    )
    categoria: Mapped[Category] = mapped_column(SAEnum(Category, name="category"), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(DocumentStatus, name="document_status"),
        default=DocumentStatus.ENVIADO,
        nullable=False,
    )
    criado_por: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    current_version: Mapped[int] = mapped_column(default=0, nullable=False)
    approved_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
