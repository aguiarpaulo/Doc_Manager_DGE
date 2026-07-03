"""Obra endpoints: admin-managed CRUD, scoped reads, and user<->obra assignment."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_admin
from app.models.obra import Obra
from app.models.user import User
from app.schemas.obra import ObraCreate, ObraRead, ObraUpdate
from app.scope import can_access_obra, scope_obra_query

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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Obra]:
    query = scope_obra_query(select(Obra), current_user)
    return list(db.execute(query).scalars().all())


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
