"""SQLAlchemy models. Import model modules here so Alembic autogenerate sees them."""

from app.db import Base
from app.models.audit import AuditAction, AuditLog
from app.models.document import Category, Document, DocumentStatus
from app.models.document_version import DocumentVersion
from app.models.obra import Obra, user_obra
from app.models.password_reset import PasswordResetToken
from app.models.signature import UserSignature
from app.models.signature_applied import AppliedSignature
from app.models.signature_request import SignatureRequest, SignatureRequestStatus
from app.models.user import Role, User

__all__ = [
    "AppliedSignature",
    "AuditAction",
    "AuditLog",
    "Base",
    "Category",
    "Document",
    "DocumentStatus",
    "DocumentVersion",
    "Obra",
    "PasswordResetToken",
    "Role",
    "SignatureRequest",
    "SignatureRequestStatus",
    "User",
    "UserSignature",
    "user_obra",
]
