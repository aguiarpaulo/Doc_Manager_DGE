"""NODE-015 smoke: Streamlit UI drives the flows via api_client (API mocked).

The live end-to-end smoke against a running API+MinIO is a manual step; here we prove
the UI wiring: login authenticates via the client, and the dashboard lists/creates docs.
"""

import json
from pathlib import Path

import pytest
import requests
import streamlit as st
from streamlit.testing.v1 import AppTest

from streamlit_app import api_client

APP = str(Path(__file__).resolve().parent.parent / "streamlit_app" / "app.py")

OBRAS = [
    {"id": "11111111-1111-1111-1111-111111111111", "nome": "Obra 01"},
    {"id": "22222222-2222-2222-2222-222222222222", "nome": "Obra 02"},
]

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c636000000200010005fe02fe0000000049454e44ae426082"
)


def _document(nome: str, criado_em: str, **overrides) -> dict:
    doc = {
        "id": f"doc-{nome}",
        "nome": nome,
        "obra_id": OBRAS[0]["id"],
        "categoria": "outros",
        "status": "enviado",
        "criado_por": "user-1",
        "criado_em": criado_em,
        "current_version": 1,
    }
    doc.update(overrides)
    return doc


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _http_error(status_code: int, payload) -> requests.HTTPError:
    """A real requests.HTTPError carrying a real Response, as the API would produce."""
    response = requests.Response()
    response.status_code = status_code
    response._content = json.dumps(payload).encode()
    response.headers["Content-Type"] = "application/json"
    return requests.HTTPError(f"{status_code} Client Error", response=response)


USERS = [
    {"id": "user-1", "email": "ana@example.com", "role": "engenheiro", "is_active": True},
    {"id": "user-2", "email": "bruno@example.com", "role": "financeiro", "is_active": True},
]


def _dashboard(monkeypatch, role: str = "engenheiro", **overrides) -> AppTest:
    """An authenticated dashboard with the HTTP layer stubbed; overrides win."""
    monkeypatch.setattr(
        api_client, "me", lambda token: {"id": "me", "email": "eu@example.com", "role": role}
    )
    monkeypatch.setattr(api_client, "list_users", lambda token: USERS)
    monkeypatch.setattr(api_client, "create_obra", lambda token, nome, descricao: {"id": "o-9"})
    monkeypatch.setattr(
        api_client, "create_user", lambda token, email, password, role: {"id": "u-9"}
    )
    monkeypatch.setattr(api_client, "grant_obra_access", lambda token, obra_id, user_id: None)
    monkeypatch.setattr(api_client, "list_obras", lambda token: OBRAS)
    monkeypatch.setattr(api_client, "search_documents", lambda token, **kw: [])
    monkeypatch.setattr(api_client, "download_version", lambda token, doc, ver: (PNG, "image/png"))
    for name, value in overrides.items():
        monkeypatch.setattr(api_client, name, value)
    # The viewer caches downloads; without this the cache would leak across tests.
    st.cache_data.clear()
    at = AppTest.from_file(APP, default_timeout=30)
    at.session_state["token"] = "tok"
    return at


def _submit(at: AppTest) -> AppTest:
    return next(b for b in at.button if b.label == "Criar e enviar").click().run()


def _document_labels(at: AppTest) -> list[str]:
    """Labels of the buttons that make up the SEI-style document tree."""
    return [button.label for button in at.button if (button.key or "").startswith("doc_")]


def _open_document(at: AppTest, label: str) -> AppTest:
    return next(b for b in at.button if b.label == label).click().run()


def test_api_client_login_posts_credentials_and_returns_tokens(monkeypatch):
    captured = {}

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        return _FakeResponse({"access_token": "abc", "refresh_token": "ref"})

    monkeypatch.setattr(api_client.requests, "post", fake_post)
    tokens = api_client.login("ana@example.com", "pw")
    assert tokens["access_token"] == "abc"
    assert captured["url"].endswith("/auth/login")
    assert captured["json"]["email"] == "ana@example.com"


def test_api_client_search_documents_sends_scope_filters(monkeypatch):
    captured = {}

    def fake_get(url, headers, params, timeout):
        captured["url"] = url
        captured["params"] = params
        return _FakeResponse([{"nome": "a.pdf"}])

    monkeypatch.setattr(api_client.requests, "get", fake_get)
    docs = api_client.search_documents("tok", nome="a", categoria="")
    assert docs == [{"nome": "a.pdf"}]
    # Empty filters are dropped.
    assert captured["params"] == {"nome": "a"}


def test_ui_shows_login_when_unauthenticated():
    at = AppTest.from_file(APP).run()
    assert not at.exception
    labels = [b.label for b in at.button]
    assert "Entrar" in labels


def test_ui_login_authenticates_against_api(monkeypatch):
    monkeypatch.setattr(
        api_client, "login", lambda email, password, mfa=None: {"access_token": "tok"}
    )
    monkeypatch.setattr(api_client, "search_documents", lambda token, **kw: [])
    monkeypatch.setattr(api_client, "list_obras", lambda token: OBRAS)
    at = AppTest.from_file(APP, default_timeout=30).run()
    at.text_input(key="email").set_value("ana@example.com")
    at.text_input(key="password").set_value("pw")
    at.button(key="login_btn").click().run()
    assert not at.exception
    assert at.session_state["token"] == "tok"


def test_ui_lists_only_the_documents_of_the_obra_being_viewed(monkeypatch):
    filtros = {}

    def fake_search(token, **kw):
        filtros.update(kw)
        return [_document("contrato.pdf", "2026-01-15T09:00:00Z")]

    at = _dashboard(monkeypatch, search_documents=fake_search).run()
    at.selectbox(key="tree_obra").set_value(OBRAS[1]["id"])
    at = at.run()

    assert not at.exception
    assert filtros["obra_id"] == OBRAS[1]["id"]
    assert _document_labels(at) == ["1. contrato.pdf"]


def test_ui_offers_obra_names_not_raw_ids(monkeypatch):
    at = _dashboard(monkeypatch).run()
    assert not at.exception
    assert at.selectbox(key="new_obra").options == ["Obra 01", "Obra 02"]


def test_ui_sends_obra_id_of_the_obra_the_user_picked(monkeypatch):
    captured = {}

    def fake_create(token, nome, obra_id, categoria):
        captured["obra_id"] = obra_id
        return {"id": "doc-1", "nome": nome}

    at = _dashboard(monkeypatch, create_document=fake_create).run()
    at.text_input(key="new_nome").set_value("teste01")
    obra_widget = at.selectbox(key="new_obra")
    obra_widget.set_value(OBRAS[obra_widget.options.index("Obra 02")]["id"])
    at = _submit(at)

    assert not at.exception
    assert captured["obra_id"] == "22222222-2222-2222-2222-222222222222"


def test_ui_tells_the_user_when_no_obra_is_available(monkeypatch):
    at = _dashboard(monkeypatch, list_obras=lambda token: []).run()
    assert not at.exception
    assert all(widget.key != "new_obra" for widget in at.selectbox)
    assert any("obra" in warning.value.lower() for warning in at.warning)


def test_ui_shows_api_message_when_document_creation_is_rejected(monkeypatch):
    def rejecting_create(token, nome, obra_id, categoria):
        raise _http_error(404, {"detail": "Obra não encontrada"})

    at = _dashboard(monkeypatch, create_document=rejecting_create).run()
    at.text_input(key="new_nome").set_value("teste01")
    at = _submit(at)

    assert not at.exception
    assert any("Obra não encontrada" in error.value for error in at.error)


def test_ui_shows_api_message_when_document_search_fails(monkeypatch):
    def failing_search(token, **filters):
        raise _http_error(401, {"detail": "Token expirado"})

    at = _dashboard(monkeypatch, search_documents=failing_search).run()

    assert not at.exception
    assert any("Token expirado" in error.value for error in at.error)


def test_error_message_reports_the_api_detail():
    message = api_client.error_message(_http_error(404, {"detail": "Obra não encontrada"}))
    assert "Obra não encontrada" in message


def test_error_message_reports_which_field_failed_validation():
    validation_body = {
        "detail": [
            {
                "type": "uuid_parsing",
                "loc": ["body", "obra_id"],
                "msg": "Input should be a valid UUID, invalid character: found `o` at 1",
                "input": "obra_test_01",
            }
        ]
    }
    message = api_client.error_message(_http_error(422, validation_body))
    assert "obra_id" in message
    assert "UUID" in message


def test_error_message_survives_an_unexpected_detail_shape():
    message = api_client.error_message(_http_error(400, {"detail": ["campo inválido"]}))
    assert "campo inválido" in message


def test_error_message_falls_back_when_body_is_not_json():
    response = requests.Response()
    response.status_code = 502
    response._content = b"<html>Bad Gateway</html>"
    message = api_client.error_message(requests.HTTPError("502", response=response))
    assert message.strip()


def test_ui_separates_upload_and_consultation_in_tabs(monkeypatch):
    at = _dashboard(monkeypatch).run()
    assert not at.exception
    assert [tab.label for tab in at.tabs] == ["Enviar documento", "Documentos"]


def test_ui_lists_documents_in_upload_order(monkeypatch):
    # A API devolve fora de ordem; a arvore do SEI e por ordem de inclusao.
    fora_de_ordem = [
        _document("laudo.pdf", "2026-03-02T10:00:00Z"),
        _document("contrato.pdf", "2026-01-15T09:00:00Z"),
        _document("nota.pdf", "2026-02-20T14:30:00Z"),
    ]
    at = _dashboard(monkeypatch, search_documents=lambda token, **kw: fora_de_ordem).run()

    assert not at.exception
    assert _document_labels(at) == ["1. contrato.pdf", "2. nota.pdf", "3. laudo.pdf"]


def test_ui_opening_a_document_fetches_that_documents_content(monkeypatch):
    documentos = [
        _document("contrato.pdf", "2026-01-15T09:00:00Z"),
        _document("laudo.pdf", "2026-03-02T10:00:00Z", current_version=3),
    ]
    pedidos = []

    def fake_download(token, document_id, version):
        pedidos.append((document_id, version))
        return PNG, "image/png"

    at = _dashboard(
        monkeypatch,
        search_documents=lambda token, **kw: documentos,
        download_version=fake_download,
    ).run()
    at = _open_document(at, "2. laudo.pdf")

    assert not at.exception
    assert pedidos == [("doc-laudo.pdf", 3)]


def test_ui_does_not_download_a_document_that_has_no_file(monkeypatch):
    sem_arquivo = [_document("rascunho.pdf", "2026-01-15T09:00:00Z", current_version=0)]

    def fake_download(token, document_id, version):
        raise AssertionError("nao deve baixar um documento sem versao")

    at = _dashboard(
        monkeypatch,
        search_documents=lambda token, **kw: sem_arquivo,
        download_version=fake_download,
    ).run()
    at = _open_document(at, "1. rascunho.pdf")

    assert not at.exception
    assert any("arquivo" in warning.value.lower() for warning in at.warning)


def test_ui_shows_api_message_when_the_content_cannot_be_downloaded(monkeypatch):
    documentos = [_document("contrato.pdf", "2026-01-15T09:00:00Z")]

    def failing_download(token, document_id, version):
        raise _http_error(404, {"detail": "Versão não encontrada"})

    at = _dashboard(
        monkeypatch,
        search_documents=lambda token, **kw: documentos,
        download_version=failing_download,
    ).run()
    at = _open_document(at, "1. contrato.pdf")

    assert not at.exception
    assert any("Versão não encontrada" in error.value for error in at.error)


def test_ui_asks_the_user_to_pick_a_document_before_showing_content(monkeypatch):
    documentos = [_document("contrato.pdf", "2026-01-15T09:00:00Z")]
    at = _dashboard(monkeypatch, search_documents=lambda token, **kw: documentos).run()

    assert not at.exception
    rendered = " ".join(info.value.lower() for info in at.info)
    assert "selecione" in rendered


def test_download_version_returns_the_bytes_and_type_the_api_sent(monkeypatch):
    response = requests.Response()
    response.status_code = 200
    response._content = PNG
    response.headers["Content-Type"] = "image/png"
    monkeypatch.setattr(api_client.requests, "get", lambda url, headers, timeout: response)

    content, content_type = api_client.download_version("tok", "doc-1", 2)

    assert content == PNG
    assert content_type == "image/png"


def test_ui_gives_the_administrator_an_administration_tab(monkeypatch):
    at = _dashboard(monkeypatch, role="administrador").run()
    assert not at.exception
    assert [tab.label for tab in at.tabs] == [
        "Enviar documento",
        "Documentos",
        "Administração",
    ]


@pytest.mark.parametrize("role", ["engenheiro", "financeiro", "diretor"])
def test_ui_hides_the_administration_tab_from_everyone_else(monkeypatch, role):
    at = _dashboard(monkeypatch, role=role).run()
    assert not at.exception
    assert [tab.label for tab in at.tabs] == ["Enviar documento", "Documentos"]


def test_ui_registers_a_new_obra_with_the_name_and_description_typed(monkeypatch):
    recebido = {}

    def fake_create_obra(token, nome, descricao):
        recebido.update(nome=nome, descricao=descricao)
        return {"id": "o-9", "nome": nome}

    at = _dashboard(monkeypatch, role="administrador", create_obra=fake_create_obra).run()
    at.text_input(key="admin_obra_nome").set_value("Obra 06")
    at.text_input(key="admin_obra_descricao").set_value("ponte norte")
    at = next(b for b in at.button if b.label == "Cadastrar obra").click().run()

    assert not at.exception
    assert recebido == {"nome": "Obra 06", "descricao": "ponte norte"}


def test_ui_registers_a_new_user_with_the_role_chosen(monkeypatch):
    recebido = {}

    def fake_create_user(token, email, password, role):
        recebido.update(email=email, password=password, role=role)
        return {"id": "u-9", "email": email}

    at = _dashboard(monkeypatch, role="administrador", create_user=fake_create_user).run()
    at.text_input(key="admin_user_email").set_value("novo@example.com")
    at.text_input(key="admin_user_senha").set_value("SenhaForte@123")
    at.selectbox(key="admin_user_role").set_value("financeiro")
    at = next(b for b in at.button if b.label == "Cadastrar usuário").click().run()

    assert not at.exception
    assert recebido == {
        "email": "novo@example.com",
        "password": "SenhaForte@123",
        "role": "financeiro",
    }


def test_ui_grants_the_chosen_user_access_to_the_chosen_obra(monkeypatch):
    concedidos = []

    def fake_grant(token, obra_id, user_id):
        concedidos.append((obra_id, user_id))

    at = _dashboard(monkeypatch, role="administrador", grant_obra_access=fake_grant).run()
    at.selectbox(key="admin_grant_obra").set_value(OBRAS[1]["id"])
    at.selectbox(key="admin_grant_user").set_value(USERS[1]["id"])
    at = next(b for b in at.button if b.label == "Conceder acesso").click().run()

    assert not at.exception
    assert concedidos == [(OBRAS[1]["id"], USERS[1]["id"])]


def test_ui_shows_the_api_message_when_the_email_is_already_registered(monkeypatch):
    def rejecting_create_user(token, email, password, role):
        raise _http_error(409, {"detail": "E-mail já cadastrado"})

    at = _dashboard(monkeypatch, role="administrador", create_user=rejecting_create_user).run()
    at.text_input(key="admin_user_email").set_value("repetido@example.com")
    at.text_input(key="admin_user_senha").set_value("SenhaForte@123")
    at = next(b for b in at.button if b.label == "Cadastrar usuário").click().run()

    assert not at.exception
    assert any("E-mail já cadastrado" in error.value for error in at.error)


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-q"])
