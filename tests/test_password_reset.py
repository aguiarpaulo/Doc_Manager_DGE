"""NODE-012 contract: single-use expiring token, no email leak, bcrypt + invalidation."""

from datetime import UTC, datetime, timedelta

from app.models.password_reset import PasswordResetToken
from app.models.user import Role, User


def test_request_generates_single_use_token_without_leaking(
    client, db_session, email_sender, make_user
):
    make_user(email="ana@example.com", role=Role.ENGENHEIRO)

    known = client.post("/auth/forgot-password", json={"email": "ana@example.com"})
    unknown = client.post("/auth/forgot-password", json={"email": "ghost@example.com"})
    # Identical, non-committal response either way.
    assert known.status_code == 200
    assert unknown.json() == known.json()

    tokens = db_session.query(PasswordResetToken).all()
    assert len(tokens) == 1  # only for the real user
    assert tokens[0].used is False
    assert tokens[0].expires_at is not None
    # A reset email was captured for the known user only.
    assert [m.to_email for m in email_sender.sent] == ["ana@example.com"]


def test_valid_token_resets_and_used_or_expired_rejected(
    client, db_session, email_sender, make_user
):
    make_user(email="ana@example.com", password="old-pass", role=Role.ENGENHEIRO)
    client.post("/auth/forgot-password", json={"email": "ana@example.com"})
    raw_token = email_sender.sent[-1].token

    ok = client.post(
        "/auth/reset-password", json={"token": raw_token, "new_password": "new-pass-123"}
    )
    assert ok.status_code == 200
    # New password works.
    assert client.post(
        "/auth/login", json={"email": "ana@example.com", "password": "new-pass-123"}
    ).status_code == 200
    # Reusing the same (now used) token is rejected.
    assert client.post(
        "/auth/reset-password", json={"token": raw_token, "new_password": "another"}
    ).status_code == 400


def test_expired_token_is_rejected(client, db_session, email_sender, make_user):
    make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    client.post("/auth/forgot-password", json={"email": "ana@example.com"})
    raw_token = email_sender.sent[-1].token

    token_row = db_session.query(PasswordResetToken).one()
    token_row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()

    resp = client.post(
        "/auth/reset-password", json={"token": raw_token, "new_password": "whatever-123"}
    )
    assert resp.status_code == 400


def test_new_password_is_bcrypt_and_token_invalidated(
    client, db_session, email_sender, make_user
):
    make_user(email="ana@example.com", password="old-pass", role=Role.ENGENHEIRO)
    client.post("/auth/forgot-password", json={"email": "ana@example.com"})
    raw_token = email_sender.sent[-1].token

    client.post("/auth/reset-password", json={"token": raw_token, "new_password": "brand-new-1"})

    user = db_session.query(User).filter_by(email="ana@example.com").one()
    assert user.hashed_password.startswith("$2b$")  # bcrypt
    token_row = db_session.query(PasswordResetToken).one()
    assert token_row.used is True
    # Old password no longer works.
    assert client.post(
        "/auth/login", json={"email": "ana@example.com", "password": "old-pass"}
    ).status_code == 401
