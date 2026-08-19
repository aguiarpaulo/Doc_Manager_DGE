"""The act of signing.

Confirming with the signer's own password is what makes the act non-repudiable. An
open session on an unlocked machine can click a button; it cannot supply a password
the person never typed. That was the decision taken at intake, and it is enforced
here rather than in the router, so no future endpoint can bypass it by accident.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.signature_applied import AppliedSignature
from app.models.signature_request import SignatureRequest, SignatureRequestStatus
from app.models.user import User
from app.security import verify_password
from app.services.signatures import get_signature
from app.storage import ObjectStorage
from app.utils_time import now_utc


def _snapshot_key(request_id: uuid.UUID) -> str:
    # Its own prefix, keyed by the request: the profile rubric may later be replaced
    # or deleted, and this copy must survive both untouched.
    return f"assinaturas/{request_id}/rubrica.png"


def sign(
    db: Session,
    storage: ObjectStorage,
    *,
    request: SignatureRequest,
    user: User,
    password: str,
) -> AppliedSignature:
    # Who: only the person the request names. Not the requester, not an
    # administrator — a signature is personal.
    if request.signatario_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente o signatário indicado pode assinar esta solicitação.",
        )

    if request.status is not SignatureRequestStatus.PENDENTE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Esta solicitação já está {request.status.value}.",
        )

    # What makes the act non-repudiable.
    if not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Senha incorreta."
        )

    perfil = get_signature(db, user)
    if perfil is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registre a sua rubrica antes de assinar.",
        )

    # The snapshot: copy the bytes now, so the signature never depends on the
    # profile rubric still existing or still being the same.
    dados = storage.get_object(perfil.object_key)
    chave = _snapshot_key(request.id)
    storage.put_object(chave, dados, perfil.tipo)

    assinatura = AppliedSignature(
        signature_request_id=request.id,
        document_id=request.document_id,
        document_version_id=request.document_version_id,
        signatario_id=user.id,
        signatario_nome=user.username,
        rubrica_object_key=chave,
        rubrica_tipo=perfil.tipo,
        rubrica_tamanho=perfil.tamanho,
        rubrica_hash=perfil.hash,
    )
    db.add(assinatura)

    request.status = SignatureRequestStatus.ASSINADA
    request.encerrado_em = now_utc()

    # Note what is deliberately absent: nothing touches document.status. Signing and
    # approval are different questions, and a signature must not silently move a
    # document through the approval state machine.

    db.commit()
    db.refresh(assinatura)
    return assinatura


def list_for_document(db: Session, document_id: uuid.UUID) -> list[AppliedSignature]:
    from sqlalchemy import select

    return list(
        db.execute(
            select(AppliedSignature)
            .where(AppliedSignature.document_id == document_id)
            .order_by(AppliedSignature.assinado_em)
        )
        .scalars()
        .all()
    )


def _ensure_still_open(request: SignatureRequest) -> None:
    """A request that already reached an end state cannot change again."""
    if request.status is not SignatureRequestStatus.PENDENTE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Esta solicitação já está {request.status.value}.",
        )


def decline(
    db: Session, *, request: SignatureRequest, user: User, motivo: str
) -> SignatureRequest:
    """Refuse to sign, saying why.

    Only the named signatory may refuse: refusing is a statement about the document,
    and putting words in someone else's mouth is exactly what this flow must not
    allow. The justification is required because a refusal without a reason leaves
    the requester with nothing to act on.
    """
    if request.signatario_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente o signatário indicado pode recusar esta solicitação.",
        )
    _ensure_still_open(request)

    if not motivo.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe o motivo da recusa.",
        )

    request.status = SignatureRequestStatus.RECUSADA
    request.motivo = motivo.strip()
    request.encerrado_em = now_utc()
    db.commit()
    db.refresh(request)
    return request


def cancel(
    db: Session,
    *,
    request: SignatureRequest,
    user: User,
    motivo: str | None = None,
) -> SignatureRequest:
    """Withdraw a request that should not have been made.

    Allowed to whoever asked for it, and to an administrator. Explicitly *not* to
    the signatory: cancelling one's own pending signature would be a silent way to
    dodge it, and refusing — which leaves a reason on the record — is the honest
    path.
    """
    from app.models.user import Role

    permitido = request.solicitante_id == user.id or user.role is Role.ADMINISTRADOR
    if not permitido:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Apenas quem solicitou a assinatura ou um administrador podem "
                "cancelar. Se você é o signatário, recuse informando o motivo."
            ),
        )
    _ensure_still_open(request)

    request.status = SignatureRequestStatus.CANCELADA
    request.motivo = (motivo or "").strip() or None
    request.encerrado_em = now_utc()
    db.commit()
    db.refresh(request)
    return request
