"""Notification of a signature request.

The configuration test here is the reason this file exists as much as the delivery
ones. The deployment target chosen in GAP-003 is a Google Workspace SMTP relay
authenticated by **IP allowlist**, which means there is no `GED_SMTP_USER`. The
sender address then falls back to that empty user, every message goes out with a
blank `From`, and the relay refuses it — a failure that would otherwise appear only
in a log, one undelivered e-mail at a time, long after the deploy.
"""

import smtplib

import pytest

from app.config import Settings
from app.models.user import Role
from app.services.email import (
    ConsoleEmailSender,
    SMTPEmailSender,
    get_email_sender,
    reset_email_sender,
    signature_link,
    validate_email_config,
)
from tests.conftest import make_pdf

PDF = make_pdf(texto="contrato")
AREA = {
    "pagina": 1,
    "x": 0.1,
    "y": 0.7,
    "largura": 0.3,
    "altura": 0.08,
    "page_width": 595.0,
    "page_height": 842.0,
}


def _cenario(client, make_user, make_obra, make_document, headers_for):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(nome="Residencial Aurora", users=[autor, assinante])
    documento = make_document(obra, autor, nome="Contrato principal")
    ana = headers_for("ana@example.com")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("contrato.pdf", PDF, "application/pdf")},
        headers=ana,
    )
    return autor, assinante, obra, documento, ana


# --- entrega ----------------------------------------------------------------------


def test_creating_a_request_sends_exactly_one_email_to_the_signatory(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    _, assinante, _, documento, ana = _cenario(
        client, make_user, make_obra, make_document, headers_for
    )

    resposta = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinante.id), **AREA},
        headers=ana,
    )

    assert resposta.status_code == 201
    assert len(email_sender.signature_requests) == 1
    assert email_sender.signature_requests[0].to_email == assinante.email


def test_the_email_carries_document_obra_requester_and_link(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    _, assinante, _, documento, ana = _cenario(
        client, make_user, make_obra, make_document, headers_for
    )

    client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinante.id), **AREA},
        headers=ana,
    )

    enviado = email_sender.signature_requests[0]
    assert enviado.documento == "Contrato principal"
    assert enviado.obra == "Residencial Aurora"
    assert enviado.solicitante == "ana"
    # The link points at the SPA's signing route for this document.
    assert str(documento.id) in enviado.link
    assert enviado.link.endswith("/assinar")


def test_no_email_is_sent_when_the_request_is_refused(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    autor, _, _, documento, _ = _cenario(
        client, make_user, make_obra, make_document, headers_for
    )

    # Bruno is in the obra but did not create the document, so he may not request.
    recusada = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(autor.id), **AREA},
        headers=headers_for("bruno@example.com"),
    )

    assert recusada.status_code == 403
    # A refused request must not notify anyone.
    assert email_sender.signature_requests == []


def test_smtp_failure_does_not_undo_the_request(
    client, db_session, make_user, make_obra, make_document, headers_for, monkeypatch
):
    from app.models.signature_request import SignatureRequest

    _, assinante, _, documento, ana = _cenario(
        client, make_user, make_obra, make_document, headers_for
    )

    # A real SMTP sender pointed at a server that refuses the connection.
    sender = SMTPEmailSender(
        host="127.0.0.1",
        port=1,
        user="",
        password="",
        from_addr="ged@example.com",
        starttls=False,
        reset_url_base="https://ged.example.com/redefinir-senha",
    )
    from app.services.email import get_email_sender as real_getter

    client.app.dependency_overrides[real_getter] = lambda: sender

    resposta = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinante.id), **AREA},
        headers=ana,
    )

    # The pending signature is visible in the app either way: losing the e-mail is
    # recoverable, losing the request would not be.
    assert resposta.status_code == 201
    db_session.expire_all()
    assert db_session.query(SignatureRequest).count() == 1


def test_smtp_errors_are_swallowed_and_logged_not_raised():
    sender = SMTPEmailSender(
        host="127.0.0.1",
        port=1,
        user="",
        password="",
        from_addr="ged@example.com",
        starttls=False,
        reset_url_base="https://ged.example.com/redefinir-senha",
    )

    # Must not raise: this runs after the caller's work is already committed.
    sender.send_signature_request(
        "bruno@example.com",
        documento="Contrato",
        obra="Aurora",
        solicitante="ana",
        link="https://ged.example.com/documentos/1/assinar",
    )


def test_in_memory_sender_captures_without_any_external_service(email_sender):
    email_sender.send_signature_request(
        "bruno@example.com",
        documento="Contrato",
        obra="Aurora",
        solicitante="ana",
        link="https://ged.example.com/documentos/1/assinar",
    )

    assert len(email_sender.signature_requests) == 1
    assert email_sender.signature_requests[0].obra == "Aurora"


# --- configuração ------------------------------------------------------------------


def test_startup_refuses_smtp_host_without_a_sender_address():
    """The IP-allowlist relay trap: no SMTP user means no fallback for From."""
    settings = Settings(
        smtp_host="smtp-relay.gmail.com",
        smtp_user="",
        smtp_from="",
        app_url_base="https://ged.example.com",
    )

    with pytest.raises(RuntimeError, match="GED_SMTP_FROM"):
        validate_email_config(settings)


def test_startup_accepts_smtp_host_with_an_explicit_sender():
    settings = Settings(
        smtp_host="smtp-relay.gmail.com",
        smtp_user="",
        smtp_from="ged@example.com",
        app_url_base="https://ged.example.com",
    )

    validate_email_config(settings)


def test_startup_still_accepts_a_sender_derived_from_the_smtp_user():
    # Password-authenticated SMTP keeps working: the user doubles as the sender.
    settings = Settings(
        smtp_host="smtp.example.com",
        smtp_user="ged@example.com",
        smtp_from="",
        app_url_base="https://ged.example.com",
    )

    validate_email_config(settings)


def test_startup_refuses_smtp_host_without_a_public_base_url():
    settings = Settings(
        smtp_host="smtp-relay.gmail.com",
        smtp_from="ged@example.com",
        app_url_base="",
    )

    with pytest.raises(RuntimeError, match="GED_APP_URL_BASE"):
        validate_email_config(settings)


def test_without_smtp_host_nothing_is_required_and_dev_keeps_working():
    settings = Settings(smtp_host="", smtp_from="", app_url_base="")

    # Development must not need any of it.
    validate_email_config(settings)


def test_console_sender_is_the_development_path(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("GED_SMTP_HOST", "")
    get_settings.cache_clear()
    reset_email_sender()
    try:
        assert isinstance(get_email_sender(), ConsoleEmailSender)
    finally:
        get_settings.cache_clear()
        reset_email_sender()


def test_smtp_sender_is_selected_once_a_host_is_configured(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("GED_SMTP_HOST", "smtp-relay.gmail.com")
    monkeypatch.setenv("GED_SMTP_FROM", "ged@example.com")
    monkeypatch.setenv("GED_APP_URL_BASE", "https://ged.example.com")
    get_settings.cache_clear()
    reset_email_sender()
    try:
        sender = get_email_sender()
        assert isinstance(sender, SMTPEmailSender)
        # The From must be the explicit address, not the empty user.
        assert sender.from_addr == "ged@example.com"
    finally:
        get_settings.cache_clear()
        reset_email_sender()


def test_login_is_skipped_when_there_are_no_credentials():
    """An IP-allowlisted relay has none, and calling login() would fail."""
    import inspect

    fonte = inspect.getsource(SMTPEmailSender._send)
    assert "if self.user and self.password" in fonte
    assert smtplib is not None


# --- link --------------------------------------------------------------------------


def test_signature_link_is_built_from_the_single_public_base():
    settings = Settings(app_url_base="https://ged.example.com")

    link = signature_link("abc-123", settings=settings)

    assert link == "https://ged.example.com/documentos/abc-123/assinar"


def test_signature_link_tolerates_a_trailing_slash_in_the_base():
    settings = Settings(app_url_base="https://ged.example.com/")

    assert signature_link("abc", settings=settings).count("//") == 1
