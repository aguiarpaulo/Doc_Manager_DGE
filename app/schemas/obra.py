"""Obra request/response schemas."""

import uuid

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
