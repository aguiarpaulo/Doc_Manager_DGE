"""Document metadata endpoints (creation and retrieval)."""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_admin
from app.models.audit import AuditAction, AuditLog
from app.models.document import Category, Document, DocumentStatus
from app.models.document_version import DocumentVersion
from app.models.user import Role, User
from app.schemas.audit import AuditLogRead
from app.schemas.document import DocumentCreate, DocumentRead
from app.schemas.document_version import DocumentVersionRead
from app.scope import accessible_obra_ids, can_access_obra, has_global_access
from app.services import approval, audit
from app.services.uploads import store_new_version
from app.storage import ObjectStorage, get_storage

APPROVER_ROLES = {Role.ADMINISTRADOR, Role.DIRETOR}

router = APIRouter(prefix="/documents", tags=["documents"])


def get_visible_document(db: Session, current_user: User, document_id: uuid.UUID) -> Document:
    """Fetch a non-deleted document the user may access, else 404."""
    document = db.get(Document, document_id)
    if document is None or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )
    if not can_access_obra(db, current_user, document.obra_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )
    return document


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    # The creator must have access to the target obra (existence hidden if not).
    if not can_access_obra(db, current_user, payload.obra_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obra não encontrada")

    document = Document(
        nome=payload.nome,
        obra_id=payload.obra_id,
        categoria=payload.categoria,
        criado_por=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get("", response_model=list[DocumentRead])
def search_documents(
    nome: str | None = None,
    categoria: Category | None = None,
    obra_id: uuid.UUID | None = None,
    status_filter: DocumentStatus | None = Query(default=None, alias="status"),
    criado_por: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Document]:
    stmt = select(Document).where(Document.is_deleted.is_(False))

    # Scope: non-global users only ever see documents in their assigned obras.
    if not has_global_access(current_user):
        allowed = accessible_obra_ids(db, current_user)
        if not allowed:
            return []
        stmt = stmt.where(Document.obra_id.in_(allowed))

    if nome is not None:
        stmt = stmt.where(Document.nome.ilike(f"%{nome}%"))
    if categoria is not None:
        stmt = stmt.where(Document.categoria == categoria)
    if obra_id is not None:
        stmt = stmt.where(Document.obra_id == obra_id)
    if status_filter is not None:
        stmt = stmt.where(Document.status == status_filter)
    if criado_por is not None:
        stmt = stmt.where(Document.criado_por == criado_por)

    return list(db.execute(stmt).scalars().all())


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    return get_visible_document(db, current_user, document_id)


@router.post(
    "/{document_id}/versions",
    response_model=DocumentVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def upload_version(
    document_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
) -> DocumentVersionRead:
    document = get_visible_document(db, current_user, document_id)
    data = file.file.read()
    version = store_new_version(
        db,
        storage,
        document,
        data=data,
        content_type=file.content_type or "application/octet-stream",
        filename=file.filename or "arquivo",
        user=current_user,
    )
    audit.record(
        db,
        action=AuditAction.UPLOAD,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"v{version.version}",
    )
    db.commit()
    return DocumentVersionRead.model_validate(version)


@router.get("/{document_id}/versions/{version}/download")
def download_version(
    document_id: uuid.UUID,
    version: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
) -> Response:
    document = get_visible_document(db, current_user, document_id)
    doc_version = db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.version == version,
        )
    ).scalar_one_or_none()
    if doc_version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versão não encontrada")

    data = storage.get_object(doc_version.object_key)
    audit.record(
        db,
        action=AuditAction.DOWNLOAD,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"v{version}",
    )
    db.commit()
    return Response(content=data, media_type=doc_version.tipo)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    document = db.get(Document, document_id)
    if document is None or document.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )
    # Soft-delete only: the row and its stored versions/objects are retained.
    document.is_deleted = True
    audit.record(
        db,
        action=AuditAction.DELETE,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
    )
    db.commit()


@router.get("/{document_id}/history", response_model=list[AuditLogRead])
def document_history(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AuditLog]:
    document = get_visible_document(db, current_user, document_id)
    stmt = (
        select(AuditLog)
        .where(AuditLog.target_type == "document", AuditLog.target_id == document.id)
        .order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
    )
    return list(db.execute(stmt).scalars().all())


def _require_approver(user: User) -> None:
    if user.role not in APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas Administrador e Diretor podem mover o fluxo de aprovação",
        )


@router.post("/{document_id}/review", response_model=DocumentRead)
def start_review(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    _require_approver(current_user)
    document = get_visible_document(db, current_user, document_id)
    approval.start_review(document)
    db.commit()
    db.refresh(document)
    return document


@router.post("/{document_id}/approve", response_model=DocumentRead)
def approve_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    _require_approver(current_user)
    document = get_visible_document(db, current_user, document_id)
    if document.criado_por == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é permitido aprovar um documento que você mesmo enviou",
        )
    approval.approve(document)
    audit.record(
        db,
        action=AuditAction.APPROVE,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"v{document.approved_version}",
    )
    db.commit()
    db.refresh(document)
    return document


@router.post("/{document_id}/reject", response_model=DocumentRead)
def reject_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    _require_approver(current_user)
    document = get_visible_document(db, current_user, document_id)
    approval.reject(document)
    audit.record(
        db,
        action=AuditAction.REJECT,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
    )
    db.commit()
    db.refresh(document)
    return document
