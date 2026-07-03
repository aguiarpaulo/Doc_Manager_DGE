"""Authentication endpoints: login and token refresh."""

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.audit import AuditAction
from app.models.user import User
from app.schemas.auth import (
    AccessTokenResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.security import (
    REFRESH_TOKEN,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.services import audit, mfa, password_reset
from app.services.email import EmailSender, get_email_sender

GENERIC_RESET_MESSAGE = {
    "message": "Se o e-mail existir, enviaremos instruções de recuperação."
}

router = APIRouter(prefix="/auth", tags=["auth"])

INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas"
)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    # Generic failure for unknown email, wrong password, or inactive account:
    # never reveal whether the e-mail exists.
    if user is None or not user.is_active:
        raise INVALID_CREDENTIALS
    if not verify_password(payload.password, user.hashed_password):
        raise INVALID_CREDENTIALS

    if user.mfa_enabled and not mfa.verify_code(user.mfa_secret, payload.mfa_code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Código MFA inválido ou ausente"
        )

    audit.record(db, action=AuditAction.LOGIN, actor_id=user.id)
    db.commit()

    subject = str(user.id)
    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.post("/mfa/enable")
def enable_mfa(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    secret = mfa.generate_secret()
    current_user.mfa_secret = secret
    current_user.mfa_enabled = True
    db.commit()
    return {
        "secret": secret,
        "otpauth_uri": mfa.provisioning_uri(secret, current_user.email),
    }


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    email_sender: EmailSender = Depends(get_email_sender),
) -> dict[str, str]:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    # Always the same response: never reveal whether the e-mail is registered.
    if user is not None and user.is_active:
        raw_token = password_reset.create_reset_token(db, user)
        db.commit()
        email_sender.send_password_reset(user.email, raw_token)
    return GENERIC_RESET_MESSAGE


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    if not password_reset.reset_password(db, payload.token, payload.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Token inválido ou expirado"
        )
    return {"message": "Senha redefinida com sucesso."}


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(payload: RefreshRequest) -> AccessTokenResponse:
    try:
        claims = decode_token(payload.refresh_token, expected_type=REFRESH_TOKEN)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido"
        ) from exc
    return AccessTokenResponse(access_token=create_access_token(claims["sub"]))
