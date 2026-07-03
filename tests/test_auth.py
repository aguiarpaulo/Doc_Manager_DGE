"""NODE-002 contract: login (access+refresh), no email leak, bcrypt, refresh cycle."""

from app.models.user import User
from app.security import ACCESS_TOKEN, REFRESH_TOKEN, decode_token

EMAIL = "ana@example.com"
PASSWORD = "correct-horse"


def _login(client, email=EMAIL, password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_valid_returns_access_and_refresh(client, make_user):
    make_user(email=EMAIL, password=PASSWORD)
    resp = _login(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert decode_token(body["access_token"], ACCESS_TOKEN)["type"] == ACCESS_TOKEN
    assert decode_token(body["refresh_token"], REFRESH_TOKEN)["type"] == REFRESH_TOKEN


def test_login_wrong_password_is_401_without_leaking(client, make_user):
    make_user(email=EMAIL, password=PASSWORD)
    resp = _login(client, password="wrong")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Credenciais inválidas"


def test_login_unknown_email_same_response_as_wrong_password(client):
    resp = _login(client, email="ghost@example.com", password="whatever")
    assert resp.status_code == 401
    # Identical message to the wrong-password case: does not reveal the e-mail is unknown.
    assert resp.json()["detail"] == "Credenciais inválidas"


def test_password_is_stored_as_bcrypt_hash(client, make_user, db_session):
    make_user(email=EMAIL, password=PASSWORD)
    stored = db_session.query(User).filter_by(email=EMAIL).one()
    assert stored.hashed_password != PASSWORD
    assert stored.hashed_password.startswith("$2b$")  # bcrypt hash prefix


def test_refresh_valid_returns_new_access_token(client, make_user):
    make_user(email=EMAIL, password=PASSWORD)
    tokens = _login(client).json()
    resp = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200
    new_access = resp.json()["access_token"]
    assert decode_token(new_access, ACCESS_TOKEN)["type"] == ACCESS_TOKEN


def test_refresh_with_invalid_token_is_401(client):
    resp = client.post("/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert resp.status_code == 401


def test_refresh_rejects_access_token_used_as_refresh(client, make_user):
    make_user(email=EMAIL, password=PASSWORD)
    tokens = _login(client).json()
    # Passing an access token to the refresh endpoint must be rejected (wrong type).
    resp = client.post("/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert resp.status_code == 401
