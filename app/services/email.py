"""Email delivery abstraction.

The API depends on the `EmailSender` protocol; `get_email_sender` picks the concrete
implementation from config. With `GED_SMTP_HOST` set, `SMTPEmailSender` sends real reset
e-mails; otherwise `ConsoleEmailSender` logs the token for dev. Tests swap in
`InMemoryEmailSender` via dependency override.
"""

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol
from urllib.parse import urlencode

from app.config import get_settings
from app.logging import get_logger


class EmailSender(Protocol):
    def send_password_reset(self, to_email: str, token: str) -> None: ...


@dataclass
class SentEmail:
    to_email: str
    token: str


class InMemoryEmailSender:
    """Test double: captures reset emails instead of sending them."""

    def __init__(self) -> None:
        self.sent: list[SentEmail] = []

    def send_password_reset(self, to_email: str, token: str) -> None:
        self.sent.append(SentEmail(to_email=to_email, token=token))


class ConsoleEmailSender:
    """Dev fallback: logs the reset token via structlog (no SMTP configured)."""

    def send_password_reset(self, to_email: str, token: str) -> None:
        get_logger("email").info("password_reset_requested", to_email=to_email, token=token)


class SMTPEmailSender:
    """Sends password-reset e-mails through a generic SMTP server (any provider)."""

    def __init__(
        self,
        host: str,
        port: int,
        user: str,
        password: str,
        from_addr: str,
        starttls: bool,
        reset_url_base: str,
    ) -> None:
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.from_addr = from_addr
        self.starttls = starttls
        self.reset_url_base = reset_url_base

    def _build_message(self, to_email: str, token: str) -> EmailMessage:
        reset_url = f"{self.reset_url_base}?{urlencode({'token': token})}"
        message = EmailMessage()
        message["Subject"] = "Redefinição de senha — GED DGE"
        message["From"] = self.from_addr
        message["To"] = to_email
        message.set_content(
            "Recebemos um pedido para redefinir a sua senha no GED DGE.\n\n"
            f"Para continuar, acesse o link abaixo:\n{reset_url}\n\n"
            "O link expira em 60 minutos. Se você não fez este pedido, ignore este e-mail."
        )
        return message

    def send_password_reset(self, to_email: str, token: str) -> None:
        message = self._build_message(to_email, token)
        # System boundary: swallow SMTP errors so a delivery failure can't 500 the
        # forgot-password endpoint and thereby reveal which e-mails are registered.
        try:
            with smtplib.SMTP(self.host, self.port) as server:
                if self.starttls:
                    server.starttls()
                if self.user and self.password:
                    server.login(self.user, self.password)
                server.send_message(message)
        except (OSError, smtplib.SMTPException):
            get_logger("email").exception("password_reset_send_failed", to_email=to_email)


_sender: EmailSender | None = None


def get_email_sender() -> EmailSender:
    global _sender
    if _sender is None:
        settings = get_settings()
        if settings.smtp_host:
            _sender = SMTPEmailSender(
                host=settings.smtp_host,
                port=settings.smtp_port,
                user=settings.smtp_user,
                password=settings.smtp_password,
                from_addr=settings.smtp_from or settings.smtp_user,
                starttls=settings.smtp_starttls,
                reset_url_base=settings.reset_url_base,
            )
        else:
            _sender = ConsoleEmailSender()
    return _sender
