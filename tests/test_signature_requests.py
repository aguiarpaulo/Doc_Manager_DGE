"""Marking where someone must sign.

Two invariants drive most of these tests, and both come from how PDFs work:

* coordinates are fractions of the page with the origin at the **top-left**, stored
  exactly as drawn — the flip to the PDF's bottom-left origin belongs to stamping;
* the page size in points is captured when the area is marked, because one PDF may
  mix page sizes and a fraction alone cannot be turned back into a position.
"""

import uuid

from app.models.audit import AuditAction, AuditLog
from app.models.signature_request import SignatureRequest, SignatureRequestStatus
from app.models.user import Role
from tests.conftest import make_pdf

PDF = make_pdf(paginas=3, texto="documento de teste")

# A4 in points: what a real viewer reports for a standard page.
A4 = {"page_width": 595.0, "page_height": 842.0}
AREA = {"pagina": 2, "x": 0.1, "y": 0.7, "largura": 0.3, "altura": 0.08, **A4}


def _upload_pdf(client, headers, document_id, data: bytes = PDF):
    return client.post(
        f"/documents/{document_id}/versions",
        files={"file": ("contrato.pdf", data, "application/pdf")},
        headers=headers,
    )


def _pedir(client, headers, document_id, signatario_id, **overrides):
    corpo = {"signatario_id": str(signatario_id), **AREA, **overrides}
    return client.post(
        f"/documents/{document_id}/signature-requests", json=corpo, headers=headers
    )


# --- vínculo com a versão e coordenadas ------------------------------------------


def test_request_binds_to_the_current_version_and_stores_the_area_as_drawn(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    resposta = _pedir(client, ana, documento.id, assinante.id)

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["pagina"] == 2
    # Fractions of the page, origin top-left, exactly as sent.
    assert corpo["x"] == 0.1
    assert corpo["y"] == 0.7
    assert corpo["largura"] == 0.3
    assert corpo["altura"] == 0.08
    assert corpo["status"] == "pendente"

    db_session.expire_all()
    pedido = db_session.query(SignatureRequest).one()
    versao = pedido.document_version_id
    # Bound to the version that was on screen, not merely to the document.
    assert versao is not None
    assert pedido.document_id == documento.id


def test_page_size_in_points_is_recorded_with_the_request(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    # A landscape page in the same file would have different dimensions; without
    # storing them the rubric lands somewhere else on exactly those pages.
    corpo = _pedir(
        client, ana, documento.id, assinante.id, page_width=842.0, page_height=595.0
    ).json()

    assert corpo["page_width"] == 842.0
    assert corpo["page_height"] == 595.0


def test_area_outside_the_page_is_rejected(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    # Starts inside but runs off the right edge.
    fora = _pedir(client, ana, documento.id, assinante.id, x=0.9, largura=0.3)
    assert fora.status_code in (400, 422)

    # Negative origin.
    negativa = _pedir(client, ana, documento.id, assinante.id, x=-0.1)
    assert negativa.status_code in (400, 422)

    # Zero-sized rectangle is not an area.
    vazia = _pedir(client, ana, documento.id, assinante.id, largura=0)
    assert vazia.status_code in (400, 422)


def test_page_number_is_one_based(client, make_user, make_obra, make_document, headers_for):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    assert _pedir(client, ana, documento.id, assinante.id, pagina=0).status_code in (400, 422)
    assert _pedir(client, ana, documento.id, assinante.id, pagina=1).status_code == 201


# --- escopo de obra ---------------------------------------------------------------


def test_signatory_outside_the_obra_is_refused(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    # Assigned to no obra: the scope funnel must refuse them as a signatory.
    forasteiro = make_user(email="carlos@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    resposta = _pedir(client, ana, documento.id, forasteiro.id)

    assert resposta.status_code == 403
    assert "acesso à obra" in resposta.json()["detail"]


def test_a_diretor_may_be_asked_because_the_role_has_global_scope(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    diretor = make_user(email="dora@example.com", role=Role.DIRETOR)
    obra = make_obra(users=[autor])  # diretor não está atribuído
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    # Scope comes from app/scope.py, where diretor has global access — the rule is
    # not re-derived here.
    assert _pedir(client, ana, documento.id, diretor.id).status_code == 201


def test_unknown_or_inactive_signatory_is_not_found(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    inativo = make_user(email="bruno@example.com", role=Role.ENGENHEIRO, is_active=False)
    obra = make_obra(users=[autor, inativo])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    assert _pedir(client, ana, documento.id, uuid.uuid4()).status_code == 404
    assert _pedir(client, ana, documento.id, inativo.id).status_code == 404


# --- tipo de arquivo --------------------------------------------------------------


def test_non_pdf_document_cannot_receive_a_positioned_request(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor, nome="planilha.xlsx")
    ana = headers_for("ana@example.com")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("planilha.xlsx", b"dados", "image/png")},
        headers=ana,
    )

    resposta = _pedir(client, ana, documento.id, assinante.id)

    assert resposta.status_code == 400
    assert "PDF" in resposta.json()["detail"]


def test_document_without_a_file_cannot_receive_a_request(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")

    # Metadata exists but no version was uploaded yet.
    assert _pedir(client, ana, documento.id, assinante.id).status_code == 409


# --- múltiplos signatários, sem ordem --------------------------------------------


def test_several_signatories_on_one_document_without_any_ordering(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    b = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    c = make_user(email="carla@example.com", role=Role.ENGENHEIRO)
    d = make_user(email="diego@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, b, c, d])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    for pessoa, pagina in ((b, 1), (c, 2), (d, 3)):
        assert _pedir(client, ana, documento.id, pessoa.id, pagina=pagina).status_code == 201

    db_session.expire_all()
    pedidos = db_session.query(SignatureRequest).all()
    assert len(pedidos) == 3
    # All pending at once: nothing waits for a predecessor.
    assert {p.status for p in pedidos} == {SignatureRequestStatus.PENDENTE}
    # And no column expresses an order.
    assert not any(hasattr(p, campo) for p in pedidos for campo in ("ordem", "sequencia"))


def test_a_second_pending_request_for_the_same_person_is_a_conflict(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    assert _pedir(client, ana, documento.id, assinante.id).status_code == 201
    # Asking the same person again on the same version is a duplicate ask, not a
    # second signature.
    assert _pedir(client, ana, documento.id, assinante.id).status_code == 409


# --- quem pode solicitar ----------------------------------------------------------


def test_the_document_author_may_request(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    assert _pedir(client, ana, documento.id, assinante.id).status_code == 201


def test_administrador_and_diretor_may_request_on_someone_elses_document(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    admin = make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    diretor = make_user(email="dora@example.com", role=Role.DIRETOR)
    obra = make_obra(users=[autor, assinante, admin, diretor])
    documento = make_document(obra, autor)
    _upload_pdf(client, headers_for("ana@example.com"), documento.id)

    assert (
        _pedir(client, headers_for("admin@example.com"), documento.id, assinante.id).status_code
        == 201
    )
    assert (
        _pedir(
            client, headers_for("dora@example.com"), documento.id, admin.id
        ).status_code
        == 201
    )


def test_a_colleague_who_did_not_create_the_document_may_not_request(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    colega = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, colega])
    documento = make_document(obra, autor)
    _upload_pdf(client, headers_for("ana@example.com"), documento.id)

    resposta = _pedir(client, headers_for("bruno@example.com"), documento.id, autor.id)

    assert resposta.status_code == 403


def test_someone_outside_the_obra_cannot_even_see_the_document(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    # Assigned to no obra, so the document must not even appear to exist for them.
    make_user(email="carlos@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)
    _upload_pdf(client, headers_for("ana@example.com"), documento.id)

    # 404 rather than 403: existence is hidden outside the scope.
    assert (
        _pedir(client, headers_for("carlos@example.com"), documento.id, autor.id).status_code
        == 404
    )


# --- leitura e auditoria ----------------------------------------------------------


def test_requests_are_listed_for_a_document_the_caller_can_see(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)
    _pedir(client, ana, documento.id, assinante.id)

    lista = client.get(f"/documents/{documento.id}/signature-requests", headers=ana)

    assert lista.status_code == 200
    assert len(lista.json()) == 1
    assert lista.json()[0]["signatario_id"] == str(assinante.id)


def test_creating_a_request_is_recorded_in_the_audit_trail(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    _pedir(client, ana, documento.id, assinante.id)

    db_session.expire_all()
    acoes = [log.action for log in db_session.query(AuditLog).all()]
    assert AuditAction.SIGNATURE_REQUESTED.value in acoes


# --- candidatos a signatario -----------------------------------------------------


def test_anyone_in_the_obra_can_list_who_may_sign(
    client, make_user, make_obra, headers_for
):
    """`GET /users` e admin-only, entao o autor engenheiro precisa desta rota."""
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    colega = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    make_user(email="forasteiro@example.com", role=Role.ENGENHEIRO)
    diretor = make_user(email="dora@example.com", role=Role.DIRETOR)
    obra = make_obra(users=[autor, colega])

    resposta = client.get(f"/obras/{obra.id}/users", headers=headers_for("ana@example.com"))

    assert resposta.status_code == 200
    nomes = {u["username"] for u in resposta.json()}
    assert {"ana", "bruno"} <= nomes
    # Papel com acesso global entra mesmo sem atribuicao.
    assert diretor.username in nomes
    # Quem nao alcanca a obra nao aparece.
    assert "forasteiro" not in nomes


def test_listing_candidates_of_an_obra_you_cannot_reach_is_404(
    client, make_user, make_obra, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    make_user(email="forasteiro@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])

    resposta = client.get(
        f"/obras/{obra.id}/users", headers=headers_for("forasteiro@example.com")
    )

    assert resposta.status_code == 404


def test_inactive_users_are_not_offered_as_signatories(
    client, make_user, make_obra, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    inativo = make_user(email="bruno@example.com", role=Role.ENGENHEIRO, is_active=False)
    obra = make_obra(users=[autor, inativo])

    resposta = client.get(f"/obras/{obra.id}/users", headers=headers_for("ana@example.com"))

    # Pedir assinatura a alguem inativo daria 404 na criacao; nao oferecer e melhor.
    assert "bruno" not in {u["username"] for u in resposta.json()}


# --- fila do proprio usuario -----------------------------------------------------


def test_my_pending_queue_only_shows_my_own(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    bruno = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    carla = make_user(email="carla@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, bruno, carla])
    documento = make_document(obra, autor, nome="Contrato principal")
    ana = headers_for("ana@example.com")
    _upload_pdf(client, ana, documento.id)

    _pedir(client, ana, documento.id, bruno.id, pagina=1)
    _pedir(client, ana, documento.id, carla.id, pagina=2)

    fila_bruno = client.get("/me/signature-requests", headers=headers_for("bruno@example.com"))

    assert fila_bruno.status_code == 200
    assert len(fila_bruno.json()) == 1
    assert fila_bruno.json()[0]["solicitacao"]["signatario_id"] == str(bruno.id)
    assert fila_bruno.json()[0]["documento_nome"] == "Contrato principal"


def test_the_queue_path_takes_no_user_id(client):
    """Ler a fila de outra pessoa e inexprimivel, nao apenas proibido.

    Inspeciona o schema OpenAPI, nao `app.routes`: nesta versao do FastAPI os
    routers incluidos aparecem como objetos sem `.path`.
    """
    caminhos = set(client.app.openapi()["paths"])
    fila = {c for c in caminhos if c.startswith("/me") and "signature-requests" in c}

    assert fila == {"/me/signature-requests"}
    assert all("{user_id}" not in c for c in fila)
    # Nenhuma outra rota permite pedir a fila de alguem.
    assert not any("signature-requests" in c and "{user_id}" in c for c in caminhos)


def test_an_encerrada_request_leaves_the_queue(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    bruno = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, bruno])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    h_bruno = headers_for("bruno@example.com")
    _upload_pdf(client, ana, documento.id)
    pedido = _pedir(client, ana, documento.id, bruno.id).json()

    assert len(client.get("/me/signature-requests", headers=h_bruno).json()) == 1

    client.post(
        f"/documents/{documento.id}/signature-requests/{pedido['id']}/decline",
        json={"motivo": "documento incorreto"},
        headers=h_bruno,
    )

    assert client.get("/me/signature-requests", headers=h_bruno).json() == []


def test_the_queue_requires_authentication(client):
    assert client.get("/me/signature-requests").status_code in (401, 403)
