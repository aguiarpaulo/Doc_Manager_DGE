"""Scaffold-level tests: the app boots and logging is structured."""

import json

import structlog

from app.logging import configure_logging, get_logger


def test_app_boots_and_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_logging_is_structured(capsys):
    configure_logging()
    logger = get_logger("test")
    logger.info("scaffold_event", answer=42)
    captured = capsys.readouterr()
    line = captured.out.strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["event"] == "scaffold_event"
    assert payload["answer"] == 42
    assert payload["level"] == "info"


def test_structlog_is_configured():
    configure_logging()
    assert structlog.is_configured()
