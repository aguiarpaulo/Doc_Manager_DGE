"""Password-reset token creation and consumption."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.security import hash_password


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_reset_token(db: Session, user: User) -> str:
    """Create a single-use, expiring reset token; returns the raw token to be e-mailed."""
    raw = secrets.token_urlsafe(32)
    settings = get_settings()
    token = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(raw),
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.reset_token_expire_minutes),
    )
    db.add(token)
    db.flush()
    return raw


def reset_password(db: Session, raw_token: str, new_password: str) -> bool:
    """Consume a valid token and set the new password. Returns False if the token is invalid."""
    token = db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash_token(raw_token))
    ).scalar_one_or_none()
    if token is None or token.used:
        return False

    expires_at = token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        return False

    user = db.get(User, token.user_id)
    if user is None:
        return False

    user.hashed_password = hash_password(new_password)
    token.used = True
    db.commit()
    return True
