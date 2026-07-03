"""NODE-003 contract: admin-only user CRUD, invalid role rejected, deactivated cannot log in."""

from app.models.user import Role


def test_admin_creates_user_with_role(client, auth_headers):
    headers = auth_headers(role=Role.ADMINISTRADOR)
    resp = client.post(
        "/users",
        headers=headers,
        json={"email": "novo@example.com", "password": "pw123456", "role": "engenheiro"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "novo@example.com"
    assert body["role"] == "engenheiro"
    assert body["is_active"] is True


def test_non_admin_cannot_create_user(client, auth_headers):
    headers = auth_headers(role=Role.ENGENHEIRO)
    resp = client.post(
        "/users",
        headers=headers,
        json={"email": "novo@example.com", "password": "pw123456", "role": "engenheiro"},
    )
    assert resp.status_code == 403


def test_unauthenticated_cannot_create_user(client):
    resp = client.post(
        "/users",
        json={"email": "novo@example.com", "password": "pw123456", "role": "engenheiro"},
    )
    # No credentials at all -> 401 Unauthorized (vs 403 for an authenticated non-admin).
    assert resp.status_code == 401


def test_invalid_role_is_rejected_by_validation(client, auth_headers):
    headers = auth_headers(role=Role.ADMINISTRADOR)
    resp = client.post(
        "/users",
        headers=headers,
        json={"email": "novo@example.com", "password": "pw123456", "role": "presidente"},
    )
    assert resp.status_code == 422


def test_deactivated_user_cannot_authenticate(client, auth_headers, make_user):
    admin = auth_headers(role=Role.ADMINISTRADOR)
    target = make_user(email="alvo@example.com", password="pw123456", role=Role.FINANCEIRO)
    # Admin deactivates the user.
    patch = client.patch(f"/users/{target.id}", headers=admin, json={"is_active": False})
    assert patch.status_code == 200
    assert patch.json()["is_active"] is False
    # The deactivated user can no longer log in.
    login = client.post("/auth/login", json={"email": "alvo@example.com", "password": "pw123456"})
    assert login.status_code == 401
