"""Creating and reading signature requests.

Authorization here is deliberately split in two, because the two questions are
different and conflating them is how a scope leak happens:

* **Who may ask** — the document's creator, an administrador or a diretor.
* **Who may be asked** — only someone who can already reach the document's obra.
  That check goes through `app/scope.py`, the same funnel every other obra query
  uses, rather than re-deriving the rule here.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.models.signature_request import SignatureRequest, SignatureRequestStatus
from app.models.user import Role, User
from app.scope import can_access_obra

# Only a PDF can carry a positioned rubric: the viewer that lets someone draw the
# area renders PDFs, and the stamp is drawn in PDF coordinates.
SIGNABLE_CONTENT_TYPES = {"application/pdf"}


def _current_version(db: Session, document: Document) -> DocumentVersion:
    version = db.execute(
        select(DocumentVersion)
        .where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.version == document.current_version,
        )
        .limit(1)
    ).scalar_one_or_none()
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O documento ainda não tem um arquivo enviado.",
        )
    return version


def ensure_may_request(db: Session, document: Document, user: User) -> None:
    """Who may ask for a signature on this document."""
    if user.role in {Role.ADMINISTRADOR, Role.DIRETOR}:
        return
    if document.criado_por == user.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Apenas o autor do documento, um diretor ou um administrador "
            "podem solicitar assinatura."
        ),
    )


def ensure_signatory_may_see_document(db: Session, document: Document, signatario: User) -> None:
    """Who may be asked: only someone already inside the document's obra."""
    if not can_access_obra(db, signatario, document.obra_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="O signatário indicado não tem acesso à obra deste documento.",
        )


def ensure_document_is_signable(version: DocumentVersion) -> None:
    if version.tipo not in SIGNABLE_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Só é possível marcar área de assinatura em PDF.",
        )


def validate_area(x: float, y: float, largura: float, altura: float) -> None:
    """The rectangle must sit inside the page, in fractions of it."""
    if largura <= 0 or altura <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A área de assinatura precisa ter largura e altura maiores que zero.",
        )
    if x < 0 or y < 0 or x + largura > 1 or y + altura > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A área de assinatura precisa estar inteiramente dentro da página.",
        )


def ensure_page_exists(storage, version: DocumentVersion, pagina: int) -> None:
    """Refuse an area on a page the document does not have.

    Left open at NODE-027 because reading the page count needs a PDF library, which
    only arrived with the stamping node. Marking page 99 of a three-page document
    would otherwise be accepted and simply never render.
    """
    from app.services.pdf_stamp import UnreadablePdf, page_count

    try:
        total = page_count(storage.get_object(version.object_key))
    except UnreadablePdf as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível ler o PDF deste documento para marcar a área.",
        ) from exc
    if pagina > total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"O documento tem {total} página(s); a página {pagina} não existe.",
        )


def create_request(
    db: Session,
    storage,
    *,
    document: Document,
    solicitante: User,
    signatario: User,
    pagina: int,
    x: float,
    y: float,
    largura: float,
    altura: float,
    page_width: float,
    page_height: float,
) -> SignatureRequest:
    ensure_may_request(db, document, solicitante)

    version = _current_version(db, document)
    ensure_document_is_signable(version)
    ensure_signatory_may_see_document(db, document, signatario)

    if pagina < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Página inválida."
        )
    if page_width <= 0 or page_height <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="As dimensões da página precisam ser positivas.",
        )
    validate_area(x, y, largura, altura)
    ensure_page_exists(storage, version, pagina)

    # An already-pending request for the same person on the same version would be a
    # duplicate ask, not a second signature.
    existing = db.execute(
        select(SignatureRequest.id).where(
            SignatureRequest.document_version_id == version.id,
            SignatureRequest.signatario_id == signatario.id,
            SignatureRequest.status == SignatureRequestStatus.PENDENTE,
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma solicitação pendente para este signatário nesta versão.",
        )

    request = SignatureRequest(
        document_id=document.id,
        document_version_id=version.id,
        signatario_id=signatario.id,
        solicitante_id=solicitante.id,
        pagina=pagina,
        x=x,
        y=y,
        largura=largura,
        altura=altura,
        page_width=page_width,
        page_height=page_height,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def list_for_document(db: Session, document: Document) -> list[SignatureRequest]:
    return list(
        db.execute(
            select(SignatureRequest)
            .where(SignatureRequest.document_id == document.id)
            .order_by(SignatureRequest.criado_em)
        )
        .scalars()
        .all()
    )


def list_pending_for_user(db: Session, user: User) -> list[SignatureRequest]:
    """Only the caller's own pending requests — never another person's queue."""
    return list(
        db.execute(
            select(SignatureRequest)
            .where(
                SignatureRequest.signatario_id == user.id,
                SignatureRequest.status == SignatureRequestStatus.PENDENTE,
            )
            .order_by(SignatureRequest.criado_em)
        )
        .scalars()
        .all()
    )


def get_request(db: Session, request_id: uuid.UUID) -> SignatureRequest:
    request = db.get(SignatureRequest, request_id)
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada."
        )
    return request


def cancel_pending_for_new_version(
    db: Session,
    *,
    document: Document,
    nova_versao: int,
) -> list[SignatureRequest]:
    """Cancel every pending request when a new version arrives.

    Coordinates were drawn against a specific pagination. A new upload may repaginate
    the file, so a request marked on the previous version can no longer be honoured —
    honouring it would put a rubric somewhere nobody pointed at, on a page the
    signatory never saw.

    Signatures already applied are untouched: they remain bound to the version they
    were made on, which is exactly what they attest to.
    """
    from app.utils_time import now_utc

    pendentes = list(
        db.execute(
            select(SignatureRequest).where(
                SignatureRequest.document_id == document.id,
                SignatureRequest.status == SignatureRequestStatus.PENDENTE,
            )
        )
        .scalars()
        .all()
    )

    motivo = f"Nova versão (v{nova_versao}) enviada; a marcação anterior deixou de valer."
    for pendente in pendentes:
        pendente.status = SignatureRequestStatus.CANCELADA
        pendente.motivo = motivo
        pendente.encerrado_em = now_utc()

    return pendentes
