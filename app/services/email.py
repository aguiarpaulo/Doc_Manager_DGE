"""Email delivery abstraction.

The API depends on the `EmailSender` protocol; `get_email_sender` picks the concrete
implementation from config. With `GED_SMTP_HOST` set, `SMTPEmailSender` sends real
e-mails; otherwise `ConsoleEmailSender` logs them for dev. Tests swap in
`InMemoryEmailSender` via dependency override.

`validate_email_config` runs at application start-up and is the reason a misconfigured
deployment fails loudly instead of sending mail nobody receives.
"""

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol
from urllib.parse import urlencode

from app.config import Settings, get_settings
from app.logging import get_logger


class EmailSender(Protocol):
    def send_password_reset(self, to_email: str, token: str) -> None: ...

    def send_signature_request(
        self,
        to_email: str,
        *,
        documento: str,
        obra: str,
        solicitante: str,
        link: str,
    ) -> None: ...

    def send_signature_cancelled(
        self, to_email: str, *, documento: str, motivo: str
    ) -> None: ...

    def send_signature_declined(
        self, to_email: str, *, documento: str, signatario: str, motivo: str
    ) -> None: ...


@dataclass
class SentEmail:
    to_email: str
    token: str


@dataclass
class SentSignatureDeclined:
    to_email: str
    documento: str
    signatario: str
    motivo: str


@dataclass
class SentSignatureCancelled:
    to_email: str
    documento: str
    motivo: str


@dataclass
class SentSignatureRequest:
    to_email: str
    documento: str
    obra: str
    solicitante: str
    link: str


class InMemoryEmailSender:
    """Test double: captures e-mails instead of sending them."""

    def __init__(self) -> None:
        self.sent: list[SentEmail] = []
        self.signature_requests: list[SentSignatureRequest] = []
        self.signature_cancellations: list[SentSignatureCancelled] = []
        self.signature_declines: list[SentSignatureDeclined] = []

    def send_password_reset(self, to_email: str, token: str) -> None:
        self.sent.append(SentEmail(to_email=to_email, token=token))

    def send_signature_request(
        self, to_email: str, *, documento: str, obra: str, solicitante: str, link: str
    ) -> None:
        self.signature_requests.append(
            SentSignatureRequest(
                to_email=to_email,
                documento=documento,
                obra=obra,
                solicitante=solicitante,
                link=link,
            )
        )


    def send_signature_cancelled(
        self, to_email: str, *, documento: str, motivo: str
    ) -> None:
        self.signature_cancellations.append(
            SentSignatureCancelled(to_email=to_email, documento=documento, motivo=motivo)
        )


    def send_signature_declined(
        self, to_email: str, *, documento: str, signatario: str, motivo: str
    ) -> None:
        self.signature_declines.append(
            SentSignatureDeclined(
                to_email=to_email,
                documento=documento,
                signatario=signatario,
                motivo=motivo,
            )
        )


class ConsoleEmailSender:
    """Dev fallback: logs via structlog (no SMTP configured)."""

    def send_password_reset(self, to_email: str, token: str) -> None:
        get_logger("email").info("password_reset_requested", to_email=to_email, token=token)

    def send_signature_request(
        self, to_email: str, *, documento: str, obra: str, solicitante: str, link: str
    ) -> None:
        get_logger("email").info(
            "signature_requested",
            to_email=to_email,
            documento=documento,
            obra=obra,
            solicitante=solicitante,
            link=link,
        )


    def send_signature_cancelled(
        self, to_email: str, *, documento: str, motivo: str
    ) -> None:
        get_logger("email").info(
            "signature_cancelled", to_email=to_email, documento=documento, motivo=motivo
        )


    def send_signature_declined(
        self, to_email: str, *, documento: str, signatario: str, motivo: str
    ) -> None:
        get_logger("email").info(
            "signature_declined",
            to_email=to_email,
            documento=documento,
            signatario=signatario,
            motivo=motivo,
        )


class SMTPEmailSender:
    """Sends e-mails through a generic SMTP server (any provider)."""

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

    def _send(self, message: EmailMessage, *, evento: str, to_email: str) -> None:
        # System boundary: SMTP errors are swallowed so a delivery failure can never
        # take down the operation that triggered the e-mail. The caller's work is
        # already committed; losing the notification is recoverable, losing the
        # request would not be.
        try:
            with smtplib.SMTP(self.host, self.port) as server:
                if self.starttls:
                    server.starttls()
                # Left conditional on purpose: an SMTP relay authenticated by IP
                # allowlist (the Google Workspace path) has no credentials at all.
                if self.user and self.password:
                    server.login(self.user, self.password)
                server.send_message(message)
        except (OSError, smtplib.SMTPException):
            get_logger("email").exception(evento, to_email=to_email)

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
        self._send(
            self._build_message(to_email, token),
            evento="password_reset_send_failed",
            to_email=to_email,
        )

    def send_signature_request(
        self, to_email: str, *, documento: str, obra: str, solicitante: str, link: str
    ) -> None:
        message = EmailMessage()
        message["Subject"] = f"Assinatura solicitada: {documento}"
        message["From"] = self.from_addr
        message["To"] = to_email
        message.set_content(
            f"{solicitante} solicitou a sua assinatura em um documento do GED DGE.\n\n"
            f"Documento: {documento}\n"
            f"Obra: {obra}\n\n"
            f"Para assinar, acesse:\n{link}\n\n"
            "Será necessário entrar com o seu usuário e confirmar a senha no momento "
            "da assinatura."
        )
        self._send(message, evento="signature_request_send_failed", to_email=to_email)


    def send_signature_cancelled(
        self, to_email: str, *, documento: str, motivo: str
    ) -> None:
        message = EmailMessage()
        message["Subject"] = f"Assinatura cancelada: {documento}"
        message["From"] = self.from_addr
        message["To"] = to_email
        message.set_content(
            "Uma solicitação de assinatura dirigida a você foi cancelada.\n\n"
            f"Documento: {documento}\n"
            f"Motivo: {motivo}\n\n"
            "Nenhuma ação é necessária. Se uma nova assinatura for preciso, você "
            "receberá outra solicitação."
        )
        self._send(message, evento="signature_cancelled_send_failed", to_email=to_email)


    def send_signature_declined(
        self, to_email: str, *, documento: str, signatario: str, motivo: str
    ) -> None:
        message = EmailMessage()
        message["Subject"] = f"Assinatura recusada: {documento}"
        message["From"] = self.from_addr
        message["To"] = to_email
        message.set_content(
            f"{signatario} recusou assinar um documento que você enviou para "
            "assinatura no GED DGE.\n\n"
            f"Documento: {documento}\n"
            f"Motivo informado: {motivo}\n\n"
            "A solicitação foi encerrada. Se o documento for corrigido, será "
            "preciso solicitar a assinatura novamente."
        )
        self._send(message, evento="signature_declined_send_failed", to_email=to_email)


def validate_email_config(settings: Settings | None = None) -> None:
    """Fail start-up on a configuration that would send mail nobody receives.

    With an SMTP relay authenticated by IP allowlist — the Google Workspace path
    chosen in GAP-003 — there is no `GED_SMTP_USER`. The sender address then falls
    back to that empty user and every message goes out with a blank `From`, which the
    relay rejects. That failure would otherwise appear only in a log, one e-mail at a
    time, long after the deploy.
    """
    settings = settings or get_settings()
    if settings.smtp_host and not (settings.smtp_from or settings.smtp_user):
        raise RuntimeError(
            "GED_SMTP_HOST está definido mas não há remetente: defina GED_SMTP_FROM. "
            "Sem ele, o cabeçalho From sai em branco e o servidor recusa a mensagem."
        )
    if settings.smtp_host and not settings.app_url_base:
        raise RuntimeError(
            "GED_SMTP_HOST está definido mas GED_APP_URL_BASE não: sem ela os "
            "e-mails sairiam com links quebrados."
        )


def signature_link(document_id: str, *, settings: Settings | None = None) -> str:
    """Deep link to the SPA's signing screen for a document.

    Built from a single public base so the reset link and this one can never drift
    apart, and so a sub-path deployment stays correct.
    """
    settings = settings or get_settings()
    base = (settings.app_url_base or "").rstrip("/")
    return f"{base}/documentos/{document_id}/assinar"


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
                reset_url_base=settings.reset_url_base
                or f"{(settings.app_url_base or '').rstrip('/')}/redefinir-senha",
            )
        else:
            _sender = ConsoleEmailSender()
    return _sender


def reset_email_sender() -> None:
    """Drop the cached sender so a test can re-select it from changed settings."""
    global _sender
    _sender = None
