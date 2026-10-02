"""The server's `.env` only reaches the API through `services.api.environment`.

`docker-compose.yml` has no `env_file:` for the api service, so that block is a
whitelist: a variable set in `/opt/ged/.env` but not named there never reaches the
container, and the setting silently keeps its default. That is how SMTP shipped
unreachable in production — the API fell back to logging reset tokens instead of
e-mailing them, with no error anywhere.

These tests resolve the compose file the way Compose does and load the result into
the real `Settings`, so they assert what the running API would actually see.
"""

import os
import pathlib
import re

import yaml

from app.config import Settings

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
COMPOSE_PATH = REPO_ROOT / "docker-compose.yml"

# Settings deliberately left at their code default in production, each with why.
NOT_CONFIGURABLE_FROM_ENV_FILE = {
    "app_name": "display name, not deployment configuration",
    "jwt_algorithm": "changing it invalidates every issued token; not an operator knob",
    "access_token_expire_minutes": "security policy lives in code, reviewed with it",
    "refresh_token_expire_days": "security policy lives in code, reviewed with it",
    "reset_token_expire_minutes": "security policy lives in code, reviewed with it",
    "reset_url_base": "test-only override; production derives the reset link from GED_APP_URL_BASE",
}

# What a server `.env` must contain for `docker compose up` to start at all.
REQUIRED_ENV = {
    "POSTGRES_PASSWORD": "pg-secret",
    "GED_MINIO_ACCESS_KEY": "minio-user",
    "GED_MINIO_SECRET_KEY": "minio-secret",
    "GED_JWT_SECRET": "a-jwt-secret-long-enough-for-production-use",
}

_INTERPOLATION = re.compile(r"\$\{(?P<name>\w+)(?:(?P<op>:-|:\?)(?P<arg>[^}]*))?\}")


def _api_environment() -> dict[str, str]:
    compose = yaml.safe_load(COMPOSE_PATH.read_text(encoding="utf-8"))
    return compose["services"]["api"]["environment"]


def _resolve(template: str, env_file: dict[str, str]) -> str:
    """Compose's `${VAR}`, `${VAR:-default}` and `${VAR:?error}` interpolation."""

    def substitute(match: re.Match) -> str:
        name, op, arg = match["name"], match["op"], match["arg"]
        value = env_file.get(name, "")
        if value:
            return value
        if op == ":?":
            raise AssertionError(f"compose would refuse to start: {name} unset ({arg})")
        return arg if op == ":-" else ""

    resolved = _INTERPOLATION.sub(substitute, str(template))
    assert "$" not in resolved, f"unsupported compose interpolation in {template!r}"
    return resolved


def _settings_seen_by_api(env_file: dict[str, str], monkeypatch) -> Settings:
    for name in [k for k in os.environ if k.startswith("GED_")]:
        monkeypatch.delenv(name)
    for name, template in _api_environment().items():
        monkeypatch.setenv(name, _resolve(template, env_file))
    return Settings(_env_file=None)


def test_every_setting_can_be_configured_from_the_server_env_file():
    passed_through = set(_api_environment())

    unreachable = sorted(
        f"GED_{field.upper()}"
        for field in Settings.model_fields
        if field not in NOT_CONFIGURABLE_FROM_ENV_FILE
        and f"GED_{field.upper()}" not in passed_through
    )

    assert not unreachable, (
        f"{unreachable} are read by app/config.py but never reach the api container: "
        "add them to services.api.environment in docker-compose.yml, or to "
        "NOT_CONFIGURABLE_FROM_ENV_FILE with the reason they stay at their default"
    )


def test_smtp_defaults_parse_when_server_env_omits_email(monkeypatch):
    settings = _settings_seen_by_api(REQUIRED_ENV, monkeypatch)

    assert (settings.smtp_host, settings.smtp_port, settings.smtp_starttls) == (
        "",
        587,
        True,
    )


def test_gmail_configured_in_the_server_env_file_reaches_the_api(monkeypatch):
    gmail = {
        **REQUIRED_ENV,
        "GED_SMTP_HOST": "smtp.gmail.com",
        "GED_SMTP_PORT": "587",
        "GED_SMTP_STARTTLS": "true",
        "GED_SMTP_USER": "alguem@gmail.com",
        "GED_SMTP_PASSWORD": "abcdefghijklmnop",
        "GED_SMTP_FROM": "alguem@gmail.com",
        "GED_APP_URL_BASE": "https://ged.example.com",
    }

    settings = _settings_seen_by_api(gmail, monkeypatch)

    assert (
        settings.smtp_host,
        settings.smtp_port,
        settings.smtp_starttls,
        settings.smtp_user,
        settings.smtp_password,
        settings.smtp_from,
        settings.app_url_base,
    ) == (
        "smtp.gmail.com",
        587,
        True,
        "alguem@gmail.com",
        "abcdefghijklmnop",
        "alguem@gmail.com",
        "https://ged.example.com",
    )


def test_disabling_starttls_in_the_server_env_file_reaches_the_api(monkeypatch):
    settings = _settings_seen_by_api({**REQUIRED_ENV, "GED_SMTP_STARTTLS": "false"}, monkeypatch)

    assert settings.smtp_starttls is False
