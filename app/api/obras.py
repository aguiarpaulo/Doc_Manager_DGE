"""Obra endpoints: admin-managed CRUD, scoped reads, and user<->obra assignment."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_admin
from app.models.audit import AuditAction, AuditLog
from app.models.document import Document, DocumentStatus
from app.models.obra import Obra
from app.models.user import Role, User
from app.schemas.obra import ObraActivity, ObraCreate, ObraRead, ObraSummary, ObraUpdate
from app.schemas.user import UserRead
from app.scope import can_access_obra, scope_obra_query

# Dashboard summaries surface at most this many obras (the busiest ones), never
# a scroll of everything — production tops out at 10 obras per install.
MAX_SUMMARY_OBRAS = 10

# Viewing/reading a document is not an update: it must never surface as an
# obra's "latest activity".
ACTIVITY_EXCLUDED_ACTIONS = [AuditAction.DOWNLOAD.value, AuditAction.LOGIN.value]

router = APIRouter(prefix="/obras", tags=["obras"])


def _get_obra_or_404(db: Session, obra_id: uuid.UUID) -> Obra:
    obra = db.get(Obra, obra_id)
    if obra is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obra não encontrada")
    return obra


@router.post("", response_model=ObraRead, status_code=status.HTTP_201_CREATED)
def create_obra(
    payload: ObraCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Obra:
    obra = Obra(nome=payload.nome, descricao=payload.descricao)
    db.add(obra)
    db.commit()
    db.refresh(obra)
    return obra


@router.patch("/{obra_id}", response_model=ObraRead)
def update_obra(
    obra_id: uuid.UUID,
    payload: ObraUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Obra:
    obra = _get_obra_or_404(db, obra_id)
    if payload.nome is not None:
        obra.nome = payload.nome
    if payload.descricao is not None:
        obra.descricao = payload.descricao
    db.commit()
    db.refresh(obra)
    return obra


@router.get("", response_model=list[ObraRead])
def list_obras(
    arquivadas: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Obra]:
    if arquivadas:
        # Archived obras are out of scope for everyone, so reaching them to restore one
        # is an administrative act, not a scoped read.
        if current_user.role is not Role.ADMINISTRADOR:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissão insuficiente para esta ação",
            )
        return list(db.execute(select(Obra).where(Obra.is_deleted.is_(True))).scalars().all())
    query = scope_obra_query(select(Obra), current_user)
    return list(db.execute(query).scalars().all())


@router.get("/summary", response_model=list[ObraSummary])
def obras_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ObraSummary]:
    """Dashboard aggregate: per accessible obra, document counts and latest activity.

    Registered before `GET /{obra_id}` on purpose — reversing the order would make
    FastAPI try to parse "summary" as a UUID and 422 before this handler ever runs.
    """
    obras = list(db.execute(scope_obra_query(select(Obra), current_user)).scalars().all())
    if not obras:
        return []
    obra_ids = [obra.id for obra in obras]

    by_status: dict[uuid.UUID, dict[str, int]] = {
        obra.id: dict.fromkeys((s.value for s in DocumentStatus), 0) for obra in obras
    }
    totals: dict[uuid.UUID, int] = dict.fromkeys(obra_ids, 0)
    for obra_id, doc_status, count in db.execute(
        select(Document.obra_id, Document.status, func.count())
        .where(Document.obra_id.in_(obra_ids), Document.is_deleted.is_(False))
        .group_by(Document.obra_id, Document.status)
    ).all():
        by_status[obra_id][doc_status.value] = count
        totals[obra_id] += count

    # One row per obra: the most recent document event, computed in SQL so this
    # stays a single round trip regardless of how many documents an obra has.
    ranked = (
        select(
            AuditLog.actor_id,
            AuditLog.action,
            AuditLog.created_at,
            Document.obra_id.label("obra_id"),
            Document.id.label("document_id"),
            Document.nome.label("document_nome"),
            func.row_number()
            .over(partition_by=Document.obra_id, order_by=AuditLog.created_at.desc())
            .label("rn"),
        )
        .select_from(AuditLog)
        .join(Document, AuditLog.target_id == Document.id)
        .where(
            AuditLog.target_type == "document",
            Document.obra_id.in_(obra_ids),
            # No is_deleted filter here on purpose: a document's own DELETE audit
            # row is written in the same transaction that sets is_deleted, so
            # filtering deleted documents out would erase the delete event itself
            # from history the instant it becomes true — hiding the one action
            # most worth surfacing. Counts (above) still exclude deleted documents;
            # only "what happened" ignores it.
            AuditLog.action.notin_(ACTIVITY_EXCLUDED_ACTIONS),
        )
        .subquery()
    )
    latest_rows = db.execute(select(ranked).where(ranked.c.rn == 1)).all()

    # Resolve actor names in one query instead of one per row.
    actor_ids = {row.actor_id for row in latest_rows if row.actor_id is not None}
    actor_names: dict[uuid.UUID, str] = {}
    if actor_ids:
        actor_names = dict(
            db.execute(select(User.id, User.username).where(User.id.in_(actor_ids))).all()
        )

    latest_by_obra: dict[uuid.UUID, ObraActivity] = {
        row.obra_id: ObraActivity(
            action=row.action,
            actor_nome=actor_names.get(row.actor_id) if row.actor_id else None,
            document_id=row.document_id,
            document_nome=row.document_nome,
            created_at=row.created_at,
        )
        for row in latest_rows
    }

    summaries = [
        ObraSummary(
            obra=ObraRead.model_validate(obra),
            total_documents=totals[obra.id],
            by_status=by_status[obra.id],
            latest_activity=latest_by_obra.get(obra.id),
        )
        for obra in obras
    ]

    # Most recently active first; obras with no activity at all sort last and are
    # the first to be dropped once there are more than MAX_SUMMARY_OBRAS. SQLite
    # (tests) returns naive datetimes even for a timezone-aware column, while
    # Postgres (production) returns aware ones — normalize before comparing so
    # sorting never raises on a naive/aware mismatch.
    epoch = datetime.min.replace(tzinfo=UTC)

    def _sort_key(summary: ObraSummary) -> datetime:
        if summary.latest_activity is None:
            return epoch
        created_at = summary.latest_activity.created_at
        return created_at if created_at.tzinfo is not None else created_at.replace(tzinfo=UTC)

    summaries.sort(key=_sort_key, reverse=True)
    return summaries[:MAX_SUMMARY_OBRAS]


@router.delete("/{obra_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_obra(
    obra_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    """Archive the obra. Its documents, files and assignments are all left in place."""
    obra = _get_obra_or_404(db, obra_id)
    obra.is_deleted = True
    db.commit()


@router.post("/{obra_id}/restore", response_model=ObraRead)
def restore_obra(
    obra_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Obra:
    obra = _get_obra_or_404(db, obra_id)
    obra.is_deleted = False
    db.commit()
    db.refresh(obra)
    return obra


@router.get("/{obra_id}", response_model=ObraRead)
def get_obra(
    obra_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Obra:
    # Out-of-scope obras are indistinguishable from non-existent ones (404, no leak).
    if not can_access_obra(db, current_user, obra_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obra não encontrada")
    return _get_obra_or_404(db, obra_id)


@router.put("/{obra_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def assign_user(
    obra_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    obra = _get_obra_or_404(db, obra_id)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    if user not in obra.users:
        obra.users.append(user)
        db.commit()


@router.delete("/{obra_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_user(
    obra_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    obra = _get_obra_or_404(db, obra_id)
    user = db.get(User, user_id)
    if user is not None and user in obra.users:
        obra.users.remove(user)
        db.commit()


@router.get("/{obra_id}/users", response_model=list[UserRead])
def list_obra_users(
    obra_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[User]:
    """Quem pode alcançar esta obra — os candidatos a signatário.

    Existe porque `GET /users` é admin-only e o autor de um documento (que pode ser
    um engenheiro) precisa escolher a quem pedir assinatura. Só é possível ler a
    lista de uma obra que o próprio chamador alcança, e a resposta é exatamente o
    conjunto que `app/scope.py` considera com acesso: os atribuídos, mais os papéis
    de acesso global.
    """
    if not can_access_obra(db, current_user, obra_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obra não encontrada")

    obra = db.get(Obra, obra_id)
    if obra is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obra não encontrada")

    atribuidos = {u.id: u for u in obra.users if u.is_active}
    globais = db.execute(
        select(User).where(
            User.is_active.is_(True),
            User.role.in_([Role.ADMINISTRADOR, Role.DIRETOR]),
        )
    ).scalars()
    for usuario in globais:
        atribuidos.setdefault(usuario.id, usuario)

    return sorted(atribuidos.values(), key=lambda u: u.username)
