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


def _login(client, email, password="pw123456"):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_reactivating_a_user_gives_their_login_back(client, auth_headers, make_user):
    admin = auth_headers(role=Role.ADMINISTRADOR)
    target = make_user(email="alvo@example.com", password="pw123456", role=Role.FINANCEIRO)
    client.patch(f"/users/{target.id}", headers=admin, json={"is_active": False})
    assert _login(client, "alvo@example.com").status_code == 401

    client.patch(f"/users/{target.id}", headers=admin, json={"is_active": True})

    assert _login(client, "alvo@example.com").status_code == 200


def test_changing_a_users_role_changes_what_they_may_do(client, auth_headers, make_user):
    admin = auth_headers(role=Role.ADMINISTRADOR)
    target = make_user(email="eng@example.com", password="pw123456", role=Role.ENGENHEIRO)
    eng_token = _login(client, "eng@example.com").json()["access_token"]
    eng_h = {"Authorization": f"Bearer {eng_token}"}
    assert client.post("/obras", headers=eng_h, json={"nome": "Obra X"}).status_code == 403

    client.patch(f"/users/{target.id}", headers=admin, json={"role": "administrador"})

    assert client.post("/obras", headers=eng_h, json={"nome": "Obra X"}).status_code == 201


def test_administrator_cannot_deactivate_their_own_account(client, make_user, headers_for):
    """Otherwise one click locks the system's own administrator out of it."""
    admin = make_user(email="admin@example.com", password="pw123456", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com", "pw123456")

    resp = client.patch(f"/users/{admin.id}", headers=admin_h, json={"is_active": False})

    assert resp.status_code == 403
    assert _login(client, "admin@example.com").status_code == 200


def test_administrator_cannot_strip_their_own_administrator_role(client, make_user, headers_for):
    """Self-demotion is the one path that can leave the system with zero administrators."""
    admin = make_user(email="admin@example.com", password="pw123456", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com", "pw123456")

    resp = client.patch(f"/users/{admin.id}", headers=admin_h, json={"role": "engenheiro"})

    assert resp.status_code == 403
    assert client.post("/obras", headers=admin_h, json={"nome": "Obra X"}).status_code == 201


def test_an_administrator_may_still_deactivate_a_different_administrator(
    client, make_user, headers_for
):
    """The self-guard must not become a blanket ban on administering other admins."""
    make_user(email="admin@example.com", password="pw123456", role=Role.ADMINISTRADOR)
    other = make_user(email="admin2@example.com", password="pw123456", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com", "pw123456")

    resp = client.patch(f"/users/{other.id}", headers=admin_h, json={"is_active": False})

    assert resp.status_code == 200
    assert _login(client, "admin2@example.com").status_code == 401
