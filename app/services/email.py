"""Email delivery abstraction.

GAP-001: the concrete SMTP provider for production is not yet decided. Until then the
API depends on this protocol; `ConsoleEmailSender` logs the reset token for dev, and
tests swap in `InMemoryEmailSender`. Wiring a real SMTP sender only touches `get_email_sender`.
"""

from dataclasses import dataclass
from typing import Protocol

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
    """Dev fallback: logs the reset token via structlog (no SMTP configured — GAP-001)."""

    def send_password_reset(self, to_email: str, token: str) -> None:
        get_logger("email").info("password_reset_requested", to_email=to_email, token=token)


_sender: ConsoleEmailSender | None = None


def get_email_sender() -> EmailSender:
    global _sender
    if _sender is None:
        _sender = ConsoleEmailSender()
    return _sender
