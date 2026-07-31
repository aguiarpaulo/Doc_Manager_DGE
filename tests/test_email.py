"""GAP-001: SMTPEmailSender delivers real reset emails and is selected by config.

smtplib is the system boundary, so it is mocked — no real SMTP server is contacted.
"""

import smtplib
from unittest.mock import patch

import app.services.email as email_module
from app.config import Settings
from app.services.email import ConsoleEmailSender, SMTPEmailSender, get_email_sender


def _make_sender(**overrides):
    kwargs = {
        "host": "smtp.example.com",
        "port": 587,
        "user": "mailer@example.com",
        "password": "secret",
        "from_addr": "no-reply@ged.example.com",
        "starttls": True,
        "reset_url_base": "https://ged.example.com/reset-password",
    }
    kwargs.update(overrides)
    return SMTPEmailSender(**kwargs)


@patch("app.services.email.smtplib.SMTP")
def test_sends_reset_email_with_clickable_link(mock_smtp):
    sender = _make_sender()

    sender.send_password_reset("ana@example.com", "raw-token-abc")

    server = mock_smtp.return_value.__enter__.return_value
    server.starttls.assert_called_once()
    server.login.assert_called_once_with("mailer@example.com", "secret")
    server.send_message.assert_called_once()

    message = server.send_message.call_args.args[0]
    assert message["To"] == "ana@example.com"
    assert message["From"] == "no-reply@ged.example.com"
    assert "https://ged.example.com/reset-password?token=raw-token-abc" in message.get_content()


@patch("app.services.email.smtplib.SMTP")
def test_starttls_disabled_is_not_negotiated(mock_smtp):
    sender = _make_sender(starttls=False)

    sender.send_password_reset("ana@example.com", "tok")

    server = mock_smtp.return_value.__enter__.return_value
    server.starttls.assert_not_called()
    server.send_message.assert_called_once()


@patch("app.services.email.smtplib.SMTP")
def test_anonymous_relay_skips_login(mock_smtp):
    sender = _make_sender(user="", password="")

    sender.send_password_reset("ana@example.com", "tok")

    server = mock_smtp.return_value.__enter__.return_value
    server.login.assert_not_called()
    server.send_message.assert_called_once()


@patch("app.services.email.smtplib.SMTP")
def test_smtp_failure_does_not_propagate(mock_smtp):
    server = mock_smtp.return_value.__enter__.return_value
    server.send_message.side_effect = smtplib.SMTPException("boom")
    sender = _make_sender()

    # Must swallow: a raised error would 500 only for real emails, revealing they exist.
    sender.send_password_reset("ana@example.com", "tok")


def test_smtp_sender_selected_when_host_configured(monkeypatch):
    email_module._sender = None
    monkeypatch.setattr(
        email_module, "get_settings", lambda: Settings(smtp_host="smtp.example.com")
    )

    assert isinstance(get_email_sender(), SMTPEmailSender)

    email_module._sender = None


def test_console_sender_selected_without_host(monkeypatch):
    email_module._sender = None
    monkeypatch.setattr(email_module, "get_settings", lambda: Settings(smtp_host=""))

    assert isinstance(get_email_sender(), ConsoleEmailSender)

    email_module._sender = None
