"""Document request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.document import Category, DocumentStatus


class DocumentCreate(BaseModel):
    nome: str
    obra_id: uuid.UUID
    categoria: Category


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    obra_id: uuid.UUID
    categoria: Category
    status: DocumentStatus
    criado_por: uuid.UUID
    criado_em: datetime
    current_version: int
