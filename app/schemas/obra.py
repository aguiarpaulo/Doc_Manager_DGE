"""Obra request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ObraCreate(BaseModel):
    nome: str
    descricao: str | None = None


class ObraUpdate(BaseModel):
    nome: str | None = None
    descricao: str | None = None


class ObraRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    descricao: str | None = None
    is_deleted: bool


class ObraActivity(BaseModel):
    """The single most recent document-lifecycle event for an obra's dashboard card."""

    action: str
    actor_nome: str | None
    document_id: uuid.UUID
    document_nome: str
    created_at: datetime


class ObraSummary(BaseModel):
    """Dashboard-ready aggregate: one obra's document counts plus its latest activity."""

    obra: ObraRead
    total_documents: int
    by_status: dict[str, int]
    latest_activity: ObraActivity | None
