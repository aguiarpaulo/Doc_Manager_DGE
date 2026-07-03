"""Access-scope rules: which obras a user may see, based on role + N:N assignment.

Administrador and Diretor see every obra. Engenheiro and Financeiro see only the
obras explicitly assigned to them. Every obra/document query must funnel through here.
"""

import uuid

from sqlalchemy import Select

from app.models.obra import Obra, user_obra
from app.models.user import Role, User

GLOBAL_ACCESS_ROLES = {Role.ADMINISTRADOR, Role.DIRETOR}


def has_global_access(user: User) -> bool:
    return user.role in GLOBAL_ACCESS_ROLES


def scope_obra_query(query: Select, user: User) -> Select:
    """Restrict an Obra select to the obras the user may access."""
    if has_global_access(user):
        return query
    return query.join(user_obra, user_obra.c.obra_id == Obra.id).where(
        user_obra.c.user_id == user.id
    )


def accessible_obra_ids(db, user: User) -> set[uuid.UUID]:
    """Set of obra ids the user may access."""
    from sqlalchemy import select

    if has_global_access(user):
        return {row for row in db.execute(select(Obra.id)).scalars().all()}
    return {
        row
        for row in db.execute(
            select(user_obra.c.obra_id).where(user_obra.c.user_id == user.id)
        ).scalars().all()
    }


def can_access_obra(db, user: User, obra_id: uuid.UUID) -> bool:
    if has_global_access(user):
        return db.get(Obra, obra_id) is not None
    return obra_id in accessible_obra_ids(db, user)
