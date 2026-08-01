"""Creation of the initial administrator.

`POST /users` is admin-only, so a brand new database has no way to produce its first
login. This runs at container startup and seeds one administrator from configuration.
"""

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import Role, User
from app.security import hash_password

MIN_PASSWORD_LENGTH = 12

# Same rule the login endpoint applies, so a seeded admin can always authenticate.
_email_adapter = TypeAdapter(EmailStr)


def ensure_first_admin(db: Session, email: str | None, password: str | None) -> bool:
    """Create an administrator when the system has none.

    Returns True when a user was created. Never touches an existing administrator, so
    it is safe to run on every restart.
    """
    if not email or not password:
        return False

    already_administered = db.execute(
        select(User.id).where(User.role == Role.ADMINISTRADOR).limit(1)
    ).first()
    if already_administered is not None:
        return False

    try:
        _email_adapter.validate_python(email)
    except ValidationError as exc:
        raise ValueError(f"e-mail inválido para o administrador inicial: {email}") from exc

    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"a senha do administrador inicial precisa de ao menos {MIN_PASSWORD_LENGTH} caracteres"
        )

    db.add(User(email=email, hashed_password=hash_password(password), role=Role.ADMINISTRADOR))
    db.commit()
    return True
