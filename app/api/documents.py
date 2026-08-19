"""Document metadata endpoints (creation and retrieval)."""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_admin
from app.models.audit import AuditAction, AuditLog
from app.models.document import Category, Document, DocumentStatus
from app.models.document_version import DocumentVersion
from app.models.obra import Obra
from app.models.user import Role, User
from app.schemas.audit import AuditLogRead
from app.schemas.document import DocumentCreate, DocumentRead
from app.schemas.document_version import DocumentVersionRead
from app.schemas.signature_request import (
    AppliedSignatureRead,
    CancelRequest,
    DeclineRequest,
    SignatureRequestCreate,
    SignatureRequestRead,
    SignRequest,
)
from app.scope import accessible_obra_ids, can_access_obra, has_global_access
from app.services import approval, audit, pdf_stamp, signature_requests, signing
from app.services.email import EmailSender, get_email_sender, signature_link
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
    stmt = (
        select(Document)
        .join(Obra, Obra.id == Document.obra_id)
        .where(Document.is_deleted.is_(False), Obra.is_deleted.is_(False))
    )

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
    email_sender: EmailSender = Depends(get_email_sender),
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
    # First upload and a re-upload are different steps to the reader, so they are
    # different actions rather than one action with a version in the detail.
    audit.record(
        db,
        action=(
            AuditAction.UPLOAD if version.version == 1 else AuditAction.NEW_VERSION
        ),
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"v{version.version}",
    )

    # A new version repaginates the file, so any area marked on the previous one
    # stops meaning what it meant. Signatures already applied are untouched.
    canceladas = signature_requests.cancel_pending_for_new_version(
        db, document=document, nova_versao=version.version
    )
    for pendente in canceladas:
        audit.record(
            db,
            action=AuditAction.SIGNATURE_CANCELLED,
            actor_id=current_user.id,
            target_type="document",
            target_id=document.id,
            detail=pendente.motivo or "",
        )
    db.commit()

    # Notified after the commit: a mail failure must not undo the upload.
    for pendente in canceladas:
        signatario = db.get(User, pendente.signatario_id)
        if signatario is not None:
            email_sender.send_signature_cancelled(
                signatario.email,
                documento=document.nome,
                motivo=pendente.motivo or "",
            )
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

    # Signatures are drawn onto a *copy*, generated now. The stored object and its
    # SHA-256 are never touched, so the document's integrity record keeps meaning
    # what it meant while still being deliverable with the rubrics visible.
    colocacoes = _placements_for_version(db, storage, document, doc_version)
    if colocacoes:
        data = pdf_stamp.stamp_pdf(data, colocacoes, documento=document.nome)

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


def _placements_for_version(
    db: Session,
    storage: ObjectStorage,
    document: Document,
    doc_version: DocumentVersion,
) -> list[pdf_stamp.SignaturePlacement]:
    """Signatures applied to this exact version, with their marked areas."""
    if doc_version.tipo != "application/pdf":
        return []

    from app.models.signature_applied import AppliedSignature
    from app.models.signature_request import SignatureRequest

    linhas = db.execute(
        select(AppliedSignature, SignatureRequest)
        .join(SignatureRequest, SignatureRequest.id == AppliedSignature.signature_request_id)
        .where(AppliedSignature.document_version_id == doc_version.id)
        .order_by(AppliedSignature.assinado_em)
    ).all()

    colocacoes: list[pdf_stamp.SignaturePlacement] = []
    for assinatura, pedido in linhas:
        colocacoes.append(
            pdf_stamp.SignaturePlacement(
                pagina=pedido.pagina,
                x=pedido.x,
                y=pedido.y,
                largura=pedido.largura,
                altura=pedido.altura,
                # The snapshot taken when signing, not the signer's current rubric.
                rubrica=storage.get_object(assinatura.rubrica_object_key),
                signatario=assinatura.signatario_nome,
                assinado_em=assinatura.assinado_em,
                versao=doc_version.version,
            )
        )
    return colocacoes


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
) -> list[AuditLogRead]:
    document = get_visible_document(db, current_user, document_id)
    stmt = (
        select(AuditLog)
        .where(AuditLog.target_type == "document", AuditLog.target_id == document.id)
        .order_by(AuditLog.created_at.asc(), AuditLog.id.asc())
    )
    registros = list(db.execute(stmt).scalars().all())

    # Resolve the actor names in one query instead of one per row.
    ids = {r.actor_id for r in registros if r.actor_id is not None}
    nomes: dict[uuid.UUID, str] = {}
    if ids:
        nomes = {
            uid: nome
            for uid, nome in db.execute(
                select(User.id, User.username).where(User.id.in_(ids))
            ).all()
        }

    return [
        AuditLogRead(
            id=r.id,
            actor_id=r.actor_id,
            actor_nome=nomes.get(r.actor_id) if r.actor_id else None,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            detail=r.detail,
            created_at=r.created_at,
        )
        for r in registros
    ]


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
    # This transition left no trace at all before NODE-032: a step in the document's
    # life that the timeline simply could not show.
    audit.record(
        db,
        action=AuditAction.REVIEW,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"v{document.current_version}",
    )
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


@router.post(
    "/{document_id}/signature-requests",
    response_model=SignatureRequestRead,
    status_code=status.HTTP_201_CREATED,
)
def create_signature_request(
    document_id: uuid.UUID,
    payload: SignatureRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
    email_sender: EmailSender = Depends(get_email_sender),
) -> SignatureRequestRead:
    """Mark an area on the current version for a specific person to sign.

    The signatory is looked up here rather than trusted from the payload, so a
    non-existent id is a 404 and one outside the obra is a 403 — decided by
    `app/scope.py`, not by a rule re-derived at this layer.
    """
    document = get_visible_document(db, current_user, document_id)

    signatario = db.get(User, payload.signatario_id)
    if signatario is None or not signatario.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signatário não encontrado"
        )

    request = signature_requests.create_request(
        db,
        storage,
        document=document,
        solicitante=current_user,
        signatario=signatario,
        pagina=payload.pagina,
        x=payload.x,
        y=payload.y,
        largura=payload.largura,
        altura=payload.altura,
        page_width=payload.page_width,
        page_height=payload.page_height,
    )
    audit.record(
        db,
        action=AuditAction.SIGNATURE_REQUESTED,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"pagina {request.pagina} para {signatario.username}",
    )
    db.commit()

    # Notification comes after the request is committed, and its failure never
    # undoes it: the pending signature is visible in the app either way, so losing
    # an e-mail is recoverable while losing the request would not be.
    obra = db.get(Obra, document.obra_id)
    email_sender.send_signature_request(
        signatario.email,
        documento=document.nome,
        obra=obra.nome if obra is not None else "",
        solicitante=current_user.username,
        link=signature_link(str(document.id)),
    )
    return SignatureRequestRead.model_validate(request)


@router.get(
    "/{document_id}/signature-requests", response_model=list[SignatureRequestRead]
)
def list_signature_requests(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SignatureRequestRead]:
    """Requests on a document the caller can already see."""
    document = get_visible_document(db, current_user, document_id)
    return [
        SignatureRequestRead.model_validate(request)
        for request in signature_requests.list_for_document(db, document)
    ]


@router.post(
    "/{document_id}/signature-requests/{request_id}/sign",
    response_model=AppliedSignatureRead,
    status_code=status.HTTP_201_CREATED,
)
def sign_signature_request(
    document_id: uuid.UUID,
    request_id: uuid.UUID,
    payload: SignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
) -> AppliedSignatureRead:
    """Sign, confirming with the caller's own password."""
    document = get_visible_document(db, current_user, document_id)
    request = signature_requests.get_request(db, request_id)
    if request.document_id != document.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada."
        )

    assinatura = signing.sign(
        db, storage, request=request, user=current_user, password=payload.password
    )
    audit.record(
        db,
        action=AuditAction.SIGNED,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"assinado por {current_user.username}",
    )
    db.commit()
    return AppliedSignatureRead.model_validate(assinatura)


@router.get("/{document_id}/signatures", response_model=list[AppliedSignatureRead])
def list_applied_signatures(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AppliedSignatureRead]:
    document = get_visible_document(db, current_user, document_id)
    return [
        AppliedSignatureRead.model_validate(a)
        for a in signing.list_for_document(db, document.id)
    ]


@router.post(
    "/{document_id}/signature-requests/{request_id}/decline",
    response_model=SignatureRequestRead,
)
def decline_signature_request(
    document_id: uuid.UUID,
    request_id: uuid.UUID,
    payload: DeclineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SignatureRequestRead:
    """Refuse to sign, stating why."""
    document = get_visible_document(db, current_user, document_id)
    request = signature_requests.get_request(db, request_id)
    if request.document_id != document.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada."
        )

    request = signing.decline(
        db, request=request, user=current_user, motivo=payload.motivo
    )
    audit.record(
        db,
        action=AuditAction.SIGNATURE_DECLINED,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"recusado por {current_user.username}: {request.motivo}",
    )
    db.commit()
    return SignatureRequestRead.model_validate(request)


@router.post(
    "/{document_id}/signature-requests/{request_id}/cancel",
    response_model=SignatureRequestRead,
)
def cancel_signature_request(
    document_id: uuid.UUID,
    request_id: uuid.UUID,
    payload: CancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SignatureRequestRead:
    """Withdraw a request. Not available to the signatory — they refuse instead."""
    document = get_visible_document(db, current_user, document_id)
    request = signature_requests.get_request(db, request_id)
    if request.document_id != document.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada."
        )

    request = signing.cancel(
        db, request=request, user=current_user, motivo=payload.motivo
    )
    audit.record(
        db,
        action=AuditAction.SIGNATURE_CANCELLED,
        actor_id=current_user.id,
        target_type="document",
        target_id=document.id,
        detail=f"cancelado por {current_user.username}",
    )
    db.commit()
    return SignatureRequestRead.model_validate(request)
