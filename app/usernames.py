"""Login-name rules, shared by the API schemas and the first-admin bootstrap.

The login credential is a username, not an e-mail: the e-mail is still stored, but only
so password-reset has somewhere to send to. Keeping the rule here means the seeded
administrator can never be created with a name the API would refuse.
"""

import re
from typing import Annotated

from pydantic import AfterValidator

MIN_LENGTH = 3
MAX_LENGTH = 32

# Lower-case letters, digits, dot, hyphen and underscore; must start alphanumeric.
_PATTERN = re.compile(rf"[a-z0-9][a-z0-9._-]{{{MIN_LENGTH - 1},{MAX_LENGTH - 1}}}")

RULE = (
    f"o usuário deve ter de {MIN_LENGTH} a {MAX_LENGTH} caracteres, sem espaços, "
    "usando apenas letras, números, ponto, hífen e sublinhado"
)


def normalize_username(value: str) -> str:
    """Trim, lower-case and validate. Raises ValueError with the rule when it does not fit."""
    candidate = value.strip().lower()
    if not _PATTERN.fullmatch(candidate):
        raise ValueError(RULE)
    return candidate


def login_key(value: str) -> str:
    """Loosely normalise a typed login for lookup.

    Deliberately never raises: a malformed login must fail as 'wrong credentials',
    not as a validation error that reveals the naming rule to an anonymous caller.
    """
    return value.strip().lower()


Username = Annotated[str, AfterValidator(normalize_username)]
