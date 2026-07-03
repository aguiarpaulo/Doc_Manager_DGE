"""NODE-010 contract: search by each criterion + combinations, scoped, empty-list on no match."""

from app.models.user import Role


def test_search_filters_by_each_criterion_and_combinations(
    client, make_user, make_obra, make_document, headers_for
):
    admin = make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    obra_a = make_obra("Obra A")
    obra_b = make_obra("Obra B")
    admin_h = headers_for("admin@example.com")

    from app.models.document import Category

    make_document(obra_a, admin, nome="contrato-2024.pdf", categoria=Category.CONTRATO)
    make_document(obra_a, admin, nome="laudo-solo.pdf", categoria=Category.LAUDO)
    make_document(obra_b, admin, nome="contrato-obra-b.pdf", categoria=Category.CONTRATO)

    # by nome
    r = client.get("/documents", headers=admin_h, params={"nome": "laudo"})
    assert [d["nome"] for d in r.json()] == ["laudo-solo.pdf"]
    # by categoria
    r = client.get("/documents", headers=admin_h, params={"categoria": "contrato"})
    assert len(r.json()) == 2
    # by obra
    r = client.get("/documents", headers=admin_h, params={"obra_id": str(obra_b.id)})
    assert len(r.json()) == 1
    # combination categoria + obra
    r = client.get(
        "/documents", headers=admin_h, params={"categoria": "contrato", "obra_id": str(obra_a.id)}
    )
    assert [d["nome"] for d in r.json()] == ["contrato-2024.pdf"]
    # by usuario (criado_por)
    r = client.get("/documents", headers=admin_h, params={"criado_por": str(admin.id)})
    assert len(r.json()) == 3


def test_search_never_returns_out_of_scope_documents(
    client, make_user, make_obra, make_document, headers_for
):
    admin = make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra_a = make_obra("Obra A", users=[eng])
    obra_b = make_obra("Obra B")  # engineer NOT assigned

    from app.models.document import Category

    make_document(obra_a, eng, nome="mine.pdf", categoria=Category.OUTROS)
    make_document(obra_b, admin, nome="secret.pdf", categoria=Category.CONTRATO)

    eng_h = headers_for("eng@example.com")
    # Even filtering explicitly by the out-of-scope obra returns nothing.
    r = client.get("/documents", headers=eng_h)
    assert {d["nome"] for d in r.json()} == {"mine.pdf"}
    r = client.get("/documents", headers=eng_h, params={"obra_id": str(obra_b.id)})
    assert r.json() == []


def test_search_with_no_results_returns_empty_list(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")
    r = client.get("/documents", headers=admin_h, params={"nome": "inexistente"})
    assert r.status_code == 200
    assert r.json() == []
