"""NODE-013 contract: enable MFA generates secret, login denied without/accepted with code."""

import pyotp

from app.models.user import Role


def _login_headers(client, email, password="s3cret-pass"):
    token = client.post("/auth/login", json={"email": email, "password": password}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


def test_enable_mfa_generates_secret(client, make_user):
    make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    headers = _login_headers(client, "ana@example.com")
    resp = client.post("/auth/mfa/enable", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["secret"]
    assert body["otpauth_uri"].startswith("otpauth://totp/")


def test_login_denied_without_valid_code_when_mfa_enabled(client, make_user):
    make_user(email="ana@example.com", password="pw-123456", role=Role.ENGENHEIRO)
    headers = _login_headers(client, "ana@example.com", "pw-123456")
    client.post("/auth/mfa/enable", headers=headers)

    # Password correct but no MFA code -> denied.
    no_code = client.post("/auth/login", json={"email": "ana@example.com", "password": "pw-123456"})
    assert no_code.status_code == 401
    # Wrong code -> denied.
    bad = client.post(
        "/auth/login",
        json={"email": "ana@example.com", "password": "pw-123456", "mfa_code": "000000"},
    )
    assert bad.status_code == 401


def test_login_accepted_with_valid_code_when_mfa_enabled(client, make_user):
    make_user(email="ana@example.com", password="pw-123456", role=Role.ENGENHEIRO)
    headers = _login_headers(client, "ana@example.com", "pw-123456")
    secret = client.post("/auth/mfa/enable", headers=headers).json()["secret"]

    code = pyotp.TOTP(secret).now()
    ok = client.post(
        "/auth/login",
        json={"email": "ana@example.com", "password": "pw-123456", "mfa_code": code},
    )
    assert ok.status_code == 200
    assert ok.json()["access_token"]
