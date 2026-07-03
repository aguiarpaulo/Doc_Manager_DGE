"""Document version response schema."""

import uuid

from pydantic import BaseModel, ConfigDict


class DocumentVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    version: int
    tamanho: int
    tipo: str
    hash: str
