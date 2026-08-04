"""First-administrator bootstrap: a fresh database must become usable without manual SQL.

`POST /users` requires an already-authenticated administrator, so without this a brand
new deployment has no way to create its first login.
"""

import pytest
from sqlalchemy import func, select

from app.models.user import Role, User
from app.services.bootstrap import ensure_first_admin

ADMIN_EMAIL = "chefe@example.com"
ADMIN_PASSWORD = "primeiro-admin-forte"


def _login(client, email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_bootstrapped_admin_can_log_in_and_create_other_users(client, db_session):
    ensure_first_admin(db_session, ADMIN_EMAIL, ADMIN_PASSWORD)

    login = _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert login.status_code == 200

    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    created = client.post(
        "/users",
        headers=headers,
        json={"email": "engenheiro@example.com", "password": "pw123456", "role": "engenheiro"},
    )

    assert created.status_code == 201


def test_repeated_bootstrap_does_not_add_a_second_administrator(client, db_session):
    ensure_first_admin(db_session, ADMIN_EMAIL, ADMIN_PASSWORD)
    ensure_first_admin(db_session, ADMIN_EMAIL, ADMIN_PASSWORD)

    login = _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert login.status_code == 200

    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    users = client.get("/users", headers=headers).json()
    admins = [u for u in users if u["role"] == "administrador"]

    assert len(admins) == 1


def test_bootstrap_does_not_change_the_password_of_an_existing_administrator(
    client, db_session, make_user
):
    make_user(email=ADMIN_EMAIL, password="senha-original", role=Role.ADMINISTRADOR)

    ensure_first_admin(db_session, ADMIN_EMAIL, "senha-nova-do-invasor")

    assert _login(client, ADMIN_EMAIL, "senha-original").status_code == 200
    assert _login(client, ADMIN_EMAIL, "senha-nova-do-invasor").status_code == 401


def test_bootstrap_stands_down_when_any_administrator_already_exists(client, db_session, make_user):
    make_user(email="outro-admin@example.com", password="senha-original", role=Role.ADMINISTRADOR)

    ensure_first_admin(db_session, ADMIN_EMAIL, ADMIN_PASSWORD)

    assert _login(client, ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 401


def test_bootstrap_creates_nothing_when_credentials_are_not_configured(db_session):
    ensure_first_admin(db_session, None, None)

    assert db_session.execute(select(func.count()).select_from(User)).scalar_one() == 0


def test_bootstrap_refuses_an_email_the_login_endpoint_would_reject(db_session):
    """Otherwise startup succeeds and leaves an administrator nobody can authenticate as."""
    with pytest.raises(ValueError):
        ensure_first_admin(db_session, "admin@dge.local", ADMIN_PASSWORD)

    assert db_session.execute(select(func.count()).select_from(User)).scalar_one() == 0


def test_bootstrap_refuses_a_password_too_weak_for_a_privileged_account(client, db_session):
    with pytest.raises(ValueError):
        ensure_first_admin(db_session, ADMIN_EMAIL, "1234")

    assert _login(client, ADMIN_EMAIL, "1234").status_code == 401
