"""NODE-005 contract: document metadata create/read, category validation, initial status."""

from app.models.user import Role


def test_create_document_persists_fields_and_links_obra(client, make_user, make_obra, headers_for):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    headers = headers_for("eng@example.com")

    resp = client.post(
        "/documents",
        headers=headers,
        json={"nome": "contrato.pdf", "obra_id": str(obra.id), "categoria": "contrato"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["nome"] == "contrato.pdf"
    assert body["obra_id"] == str(obra.id)
    assert body["categoria"] == "contrato"

    # Round-trips via GET.
    fetched = client.get(f"/documents/{body['id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


def test_invalid_category_is_rejected(client, make_user, make_obra, headers_for):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    headers = headers_for("eng@example.com")

    resp = client.post(
        "/documents",
        headers=headers,
        json={"nome": "x.pdf", "obra_id": str(obra.id), "categoria": "planilha"},
    )
    assert resp.status_code == 422


def test_document_starts_enviado_and_creator_is_current_user(
    client, make_user, make_obra, headers_for
):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    headers = headers_for("eng@example.com")

    resp = client.post(
        "/documents",
        headers=headers,
        json={"nome": "laudo.pdf", "obra_id": str(obra.id), "categoria": "laudo"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "enviado"
    assert body["criado_por"] == str(eng.id)
    assert body["current_version"] == 0


def test_cannot_create_document_in_inaccessible_obra(client, make_user, make_obra, headers_for):
    make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    other_obra = make_obra("Obra B")  # engineer is NOT assigned
    headers = headers_for("eng@example.com")

    resp = client.post(
        "/documents",
        headers=headers,
        json={"nome": "x.pdf", "obra_id": str(other_obra.id), "categoria": "outros"},
    )
    assert resp.status_code == 404
