"""TOTP-based multi-factor authentication helpers."""

import pyotp

ISSUER = "GED DGE"


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, account_email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_email, issuer_name=ISSUER)


def verify_code(secret: str, code: str | None) -> bool:
    if not code:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)
