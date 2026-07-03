"""NODE-015 smoke: Streamlit UI drives the flows via api_client (API mocked).

The live end-to-end smoke against a running API+MinIO is a manual step; here we prove
the UI wiring: login authenticates via the client, and the dashboard lists/creates docs.
"""

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from streamlit_app import api_client

APP = str(Path(__file__).resolve().parent.parent / "streamlit_app" / "app.py")


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


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
    at = AppTest.from_file(APP).run()
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
    monkeypatch.setattr(api_client, "search_documents", lambda token, **kw: sample)
    at = AppTest.from_file(APP)
    at.session_state["token"] = "tok"
    at.run()
    assert not at.exception
    rendered = " ".join(md.value for md in at.markdown)
    assert "contrato.pdf" in rendered
    assert "laudo.pdf" in rendered


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-q"])
