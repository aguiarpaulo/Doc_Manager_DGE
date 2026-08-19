"""Audit log response schema."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    # Resolved for display. The timeline must keep naming who acted even when the
    # reader has no way to look a user id up.
    actor_nome: str | None = None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    detail: str | None
    created_at: datetime
