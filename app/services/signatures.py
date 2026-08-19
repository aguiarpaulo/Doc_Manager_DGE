"""Storage and validation of a user's registered rubric.

Two rules shape this module, both from the privacy decision recorded as GAP-004:

1. The rubric image is personal data, so it never leaves the server except to its own
   owner or embedded in a stamped PDF. There is no code path here that reads someone
   else's rubric, and none that produces a self-authenticating URL.
2. The rubric a user can change or delete is the *profile* one. Signatures already
   applied to documents keep their own copy, so exercising the right to delete never
   rewrites history.
"""

import hashlib
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.signature import UserSignature
from app.models.user import User
from app.storage import ObjectStorage

# A drawn rubric is a small transparent PNG. Accepting only PNG keeps the stamping
# path in phase 2 free of format branching.
ALLOWED_SIGNATURE_TYPES = {"image/png"}
MAX_SIGNATURE_SIZE = 1 * 1024 * 1024  # 1 MB: a canvas drawing is a few KB.


def _object_key(user_id: uuid.UUID, signature_id: uuid.UUID) -> str:
    # Prefix keeps rubrics apart from documents in the same bucket; the signature id
    # in the key means replacing a rubric writes a new object instead of overwriting
    # one that a stamped PDF might still be reading.
    return f"rubricas/{user_id}/{signature_id}.png"


def validate_signature_upload(data: bytes, content_type: str) -> None:
    if content_type not in ALLOWED_SIGNATURE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A rubrica precisa ser uma imagem PNG.",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A rubrica enviada está vazia.",
        )
    if len(data) > MAX_SIGNATURE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A rubrica excede o tamanho máximo de 1 MB.",
        )


def get_signature(db: Session, user: User) -> UserSignature | None:
    """The caller's own rubric. Takes a `User`, never an id from the request."""
    return db.execute(
        select(UserSignature).where(UserSignature.user_id == user.id)
    ).scalar_one_or_none()


def store_signature(
    db: Session,
    storage: ObjectStorage,
    user: User,
    *,
    data: bytes,
    content_type: str,
) -> UserSignature:
    """Register or replace the caller's rubric."""
    validate_signature_upload(data, content_type)

    existing = get_signature(db, user)
    signature_id = uuid.uuid4()
    key = _object_key(user.id, signature_id)
    storage.put_object(key, data, content_type)

    if existing is None:
        signature = UserSignature(
            id=signature_id,
            user_id=user.id,
            object_key=key,
            tipo=content_type,
            tamanho=len(data),
            hash=hashlib.sha256(data).hexdigest(),
        )
        db.add(signature)
    else:
        previous_key = existing.object_key
        existing.object_key = key
        existing.tipo = content_type
        existing.tamanho = len(data)
        existing.hash = hashlib.sha256(data).hexdigest()
        signature = existing
        # The replaced object is dropped only after the new one is safely written.
        storage.delete_object(previous_key)

    db.commit()
    db.refresh(signature)
    return signature


def read_signature_bytes(
    db: Session, storage: ObjectStorage, user: User
) -> tuple[bytes, str]:
    signature = get_signature(db, user)
    if signature is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma rubrica registrada."
        )
    return storage.get_object(signature.object_key), signature.tipo


def delete_signature(db: Session, storage: ObjectStorage, user: User) -> None:
    """Withdraw the profile rubric. Past signatures keep their own snapshot."""
    signature = get_signature(db, user)
    if signature is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma rubrica registrada."
        )
    storage.delete_object(signature.object_key)
    db.delete(signature)
    db.commit()


def has_signature(db: Session, user: User) -> bool:
    return (
        db.execute(
            select(UserSignature.id).where(UserSignature.user_id == user.id).limit(1)
        ).first()
        is not None
    )
