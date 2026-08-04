"""NODE-015 smoke: Streamlit UI drives the flows via api_client (API mocked).

The live end-to-end smoke against a running API+MinIO is a manual step; here we prove
the UI wiring: login authenticates via the client, and the dashboard lists/creates docs.
"""

import json
from pathlib import Path

import pytest
import requests
from streamlit.testing.v1 import AppTest

from streamlit_app import api_client

APP = str(Path(__file__).resolve().parent.parent / "streamlit_app" / "app.py")

OBRAS = [
    {"id": "11111111-1111-1111-1111-111111111111", "nome": "Obra 01"},
    {"id": "22222222-2222-2222-2222-222222222222", "nome": "Obra 02"},
]


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


def _dashboard(monkeypatch, **overrides) -> AppTest:
    """An authenticated dashboard with the HTTP layer stubbed; overrides win."""
    monkeypatch.setattr(api_client, "list_obras", lambda token: OBRAS)
    monkeypatch.setattr(api_client, "search_documents", lambda token, **kw: [])
    for name, value in overrides.items():
        monkeypatch.setattr(api_client, name, value)
    at = AppTest.from_file(APP, default_timeout=30)
    at.session_state["token"] = "tok"
    return at


def _submit(at: AppTest) -> AppTest:
    return next(b for b in at.button if b.label == "Criar e enviar").click().run()


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


def test_ui_dashboard_lists_documents(monkeypatch):
    sample = [
        {"id": "1", "nome": "contrato.pdf", "categoria": "contrato", "status": "enviado"},
        {"id": "2", "nome": "laudo.pdf", "categoria": "laudo", "status": "aprovado"},
    ]
    at = _dashboard(monkeypatch, search_documents=lambda token, **kw: sample).run()
    assert not at.exception
    rendered = " ".join(md.value for md in at.markdown)
    assert "contrato.pdf" in rendered
    assert "laudo.pdf" in rendered


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


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-q"])
