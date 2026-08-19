"""Signature request schemas.

The area is expressed in fractions of the page with the origin at the top-left —
the way the person drew it. Pydantic bounds keep an out-of-range value from ever
reaching the database, where it would only surface later as a rubric off the page.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.signature_request import SignatureRequestStatus


class SignatureRequestCreate(BaseModel):
    signatario_id: uuid.UUID
    # 1-based, as the reader counts pages.
    pagina: int = Field(ge=1)

    # Origin top-left, fractions of the page.
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    largura: float = Field(gt=0, le=1)
    altura: float = Field(gt=0, le=1)

    # Size in points of the page that was on screen. Required because a PDF may mix
    # page sizes, and without it a fraction cannot be turned back into a position.
    page_width: float = Field(gt=0)
    page_height: float = Field(gt=0)


class SignatureRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    document_version_id: uuid.UUID
    signatario_id: uuid.UUID
    solicitante_id: uuid.UUID
    pagina: int
    x: float
    y: float
    largura: float
    altura: float
    page_width: float
    page_height: float
    status: SignatureRequestStatus
    motivo: str | None
    criado_em: datetime
    encerrado_em: datetime | None


class SignRequest(BaseModel):
    """Password confirmation. Never logged, never persisted."""

    password: str = Field(min_length=1)


class AppliedSignatureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    signature_request_id: uuid.UUID
    document_id: uuid.UUID
    document_version_id: uuid.UUID
    signatario_id: uuid.UUID
    signatario_nome: str
    assinado_em: datetime


class DeclineRequest(BaseModel):
    """A refusal always carries a reason; the requester needs something to act on."""

    motivo: str = Field(min_length=1, max_length=500)


class CancelRequest(BaseModel):
    motivo: str | None = Field(default=None, max_length=500)
