"""NODE-004 contract: admin-managed obras, N:N assignment, and role-based scope."""

from app.models.user import Role


def _make_obra(client, headers, nome="Obra A"):
    return client.post("/obras", headers=headers, json={"nome": nome})


def test_admin_creates_and_edits_obra(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    headers = headers_for("admin@example.com")
    created = _make_obra(client, headers, "Obra A")
    assert created.status_code == 201
    obra_id = created.json()["id"]

    edited = client.patch(f"/obras/{obra_id}", headers=headers, json={"nome": "Obra A2"})
    assert edited.status_code == 200
    assert edited.json()["nome"] == "Obra A2"


def test_non_admin_cannot_create_or_edit_obra(client, make_user, headers_for):
    make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    headers = headers_for("eng@example.com")
    resp = _make_obra(client, headers, "Obra A")
    assert resp.status_code == 403


def test_admin_assigns_and_unassigns_obra_to_user(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    admin_h = headers_for("admin@example.com")
    obra_id = _make_obra(client, admin_h, "Obra A").json()["id"]

    assign = client.put(f"/obras/{obra_id}/users/{eng.id}", headers=admin_h)
    assert assign.status_code == 204

    eng_h = headers_for("eng@example.com")
    # After assignment the engineer sees the obra.
    assert client.get(f"/obras/{obra_id}", headers=eng_h).status_code == 200
    assert len(client.get("/obras", headers=eng_h).json()) == 1

    unassign = client.delete(f"/obras/{obra_id}/users/{eng.id}", headers=admin_h)
    assert unassign.status_code == 204
    # After removal the obra is out of scope again (404, no leak).
    assert client.get(f"/obras/{obra_id}", headers=eng_h).status_code == 404
    assert client.get("/obras", headers=eng_h).json() == []


def test_engenheiro_and_financeiro_only_see_assigned_obras(client, make_user, headers_for):
    admin = make_user(email="admin@example.com", role=Role.ADMINISTRADOR)  # noqa: F841
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    fin = make_user(email="fin@example.com", role=Role.FINANCEIRO)
    admin_h = headers_for("admin@example.com")

    obra_a = _make_obra(client, admin_h, "Obra A").json()["id"]
    obra_b = _make_obra(client, admin_h, "Obra B").json()["id"]

    client.put(f"/obras/{obra_a}/users/{eng.id}", headers=admin_h)
    client.put(f"/obras/{obra_b}/users/{fin.id}", headers=admin_h)

    eng_h = headers_for("eng@example.com")
    fin_h = headers_for("fin@example.com")

    # Engineer sees only Obra A; accessing Obra B is out of scope -> 404.
    eng_obras = {o["id"] for o in client.get("/obras", headers=eng_h).json()}
    assert eng_obras == {obra_a}
    assert client.get(f"/obras/{obra_b}", headers=eng_h).status_code == 404

    # Financeiro sees only Obra B.
    fin_obras = {o["id"] for o in client.get("/obras", headers=fin_h).json()}
    assert fin_obras == {obra_b}
    assert client.get(f"/obras/{obra_a}", headers=fin_h).status_code == 404


def test_diretor_and_admin_see_all_obras_without_assignment(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    make_user(email="dir@example.com", role=Role.DIRETOR)
    admin_h = headers_for("admin@example.com")

    obra_a = _make_obra(client, admin_h, "Obra A").json()["id"]
    obra_b = _make_obra(client, admin_h, "Obra B").json()["id"]

    dir_h = headers_for("dir@example.com")
    dir_obras = {o["id"] for o in client.get("/obras", headers=dir_h).json()}
    # Diretor has no assignment yet still sees every obra.
    assert dir_obras == {obra_a, obra_b}
    assert client.get(f"/obras/{obra_a}", headers=dir_h).status_code == 200

    admin_obras = {o["id"] for o in client.get("/obras", headers=admin_h).json()}
    assert admin_obras == {obra_a, obra_b}
