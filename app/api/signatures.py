"""Endpoints for the caller's own rubric.

**No route here takes a user id.** That is the whole design: reading or writing
someone else's rubric is not forbidden by a permission check that could be got wrong
later — it is unreachable, because there is no path that expresses it. An
administrator hitting these endpoints acts on their *own* rubric like anyone else.

The image is streamed back through the API, never handed out as a self-authenticating
URL, so every read passes an authorization decision.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.document import Document
from app.models.user import User
from app.schemas.signature_request import SignatureRequestRead
from app.security import verify_password
from app.services import signature_requests, signatures
from app.storage import ObjectStorage, get_storage

router = APIRouter(prefix="/me", tags=["rubrica"])


class SignatureRead(BaseModel):
    """Metadata only. The image itself comes from the download endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    tamanho: int
    hash: str
    atualizado_em: datetime


@router.put("/signature", response_model=SignatureRead)
def upload_signature(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
) -> signatures.UserSignature:
    """Register or replace the caller's own rubric."""
    data = file.file.read()
    return signatures.store_signature(
        db,
        storage,
        current_user,
        data=data,
        content_type=file.content_type or "application/octet-stream",
    )


@router.get("/signature")
def download_signature(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
) -> Response:
    """Return the caller's own rubric image."""
    data, content_type = signatures.read_signature_bytes(db, storage, current_user)
    # Never cached by a shared proxy: this is personal data.
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, no-store"},
    )


class RemoveSignatureRequest(BaseModel):
    """Password confirmation for withdrawing the rubric.

    Sent as the body of a DELETE. RFC 9110 says a client SHOULD NOT generate
    content in a DELETE, and some intermediaries drop it — but the only proxy in
    front of this API is our own Caddy, which forwards bodies for every method.
    If that ever changes, moving this to a POST is a local change.
    """

    password: str = Field(min_length=1)


@router.delete("/signature", status_code=status.HTTP_204_NO_CONTENT)
def remove_signature(
    payload: RemoveSignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
) -> None:
    """Withdraw the caller's own rubric, confirming with their own password.

    The password requirement mirrors the act of signing: an open session on an
    unlocked machine can click a button, but cannot supply a password the person
    never typed. Withdrawing a rubric is not reversible — the image is gone — so
    the same bar applies.

    Signatures already applied are untouched: each keeps its own snapshot copy,
    which is what makes exercising this right compatible with the audit trail.
    """
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Senha incorreta."
        )
    signatures.delete_signature(db, storage, current_user)


class PendingSignature(BaseModel):
    """Uma pendência do próprio usuário, com o mínimo para chegar ao documento."""

    solicitacao: SignatureRequestRead
    documento_nome: str


@router.get("/signature-requests", response_model=list[PendingSignature])
def list_my_pending_signatures(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PendingSignature]:
    """O que espera a assinatura de quem chama.

    Como o resto deste router, o caminho não recebe id de usuário: ler a fila de
    outra pessoa não é proibido por uma checagem, é inexprimível.
    """
    pendentes = signature_requests.list_pending_for_user(db, current_user)

    resultado: list[PendingSignature] = []
    for pendente in pendentes:
        documento = db.get(Document, pendente.document_id)
        # Documento excluído deixa de aparecer na fila: não há o que assinar.
        if documento is None or documento.is_deleted:
            continue
        resultado.append(
            PendingSignature(
                solicitacao=SignatureRequestRead.model_validate(pendente),
                documento_nome=documento.nome,
            )
        )
    return resultado
