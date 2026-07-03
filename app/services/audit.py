"""Audit recording helper. Audit rows are append-only; no update/delete is exposed."""

import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditAction, AuditLog


def record(
    db: Session,
    *,
    action: AuditAction,
    actor_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    detail: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        action=str(action),
        target_type=target_type,
        target_id=target_id,
        detail=detail,
    )
    db.add(entry)
    db.flush()
    return entry
