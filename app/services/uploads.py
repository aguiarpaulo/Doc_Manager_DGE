"""Upload/versioning service: validates files, stores them, records version metadata."""

import hashlib

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.models.user import User
from app.services.approval import reset_for_new_version
from app.storage import ObjectStorage

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/png", "image/jpeg"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _validate(content_type: str, size: int) -> None:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de arquivo não permitido (aceitos: PDF, PNG, JPEG)",
        )
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Arquivo excede o limite de 50MB",
        )


def _is_duplicate_in_obra(db: Session, obra_id, file_hash: str) -> bool:
    stmt = (
        select(DocumentVersion.id)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(Document.obra_id == obra_id, DocumentVersion.hash == file_hash)
        .limit(1)
    )
    return db.execute(stmt).first() is not None


def store_new_version(
    db: Session,
    storage: ObjectStorage,
    document: Document,
    *,
    data: bytes,
    content_type: str,
    filename: str,
    user: User,
) -> DocumentVersion:
    """Validate, deduplicate, store the file, and record a new version.

    The version number increments from the document's current version. The status
    transition on re-upload is handled by the approval/versioning layer.
    """
    size = len(data)
    _validate(content_type, size)

    file_hash = hashlib.sha256(data).hexdigest()
    if _is_duplicate_in_obra(db, document.obra_id, file_hash):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Arquivo idêntico já existe nesta obra (hash duplicado)",
        )

    next_version = document.current_version + 1
    object_key = f"{document.obra_id}/{document.id}/v{next_version}/{filename}"
    storage.put_object(object_key, data, content_type)

    version = DocumentVersion(
        document_id=document.id,
        version=next_version,
        object_key=object_key,
        tamanho=size,
        tipo=content_type,
        hash=file_hash,
        criado_por=user.id,
    )
    db.add(version)
    document.current_version = next_version
    reset_for_new_version(document)
    db.commit()
    db.refresh(version)
    return version
