"""NODE-014 contract: health ok when deps up, unhealthy when one is down, structured logs."""

import json

from app.logging import configure_logging, get_logger
from app.storage import get_storage


class _FailingStorage:
    def put_object(self, key, data, content_type):  # pragma: no cover - not used here
        raise RuntimeError("down")

    def get_object(self, key):  # pragma: no cover - not used here
        raise RuntimeError("down")

    def ping(self):
        raise RuntimeError("storage unavailable")


def test_health_ok_when_dependencies_up(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"] == {"database": "ok", "storage": "ok"}


def test_health_unhealthy_when_dependency_down(client):
    # Swap the storage for one whose ping fails.
    client.app.dependency_overrides[get_storage] = lambda: _FailingStorage()
    resp = client.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unhealthy"
    assert body["checks"]["storage"] == "error"
    assert body["checks"]["database"] == "ok"


def test_logs_are_structured_json(capsys):
    configure_logging()
    get_logger("test.obs").info("structured_event", key="value", n=7)
    line = capsys.readouterr().out.strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["event"] == "structured_event"
    assert payload["key"] == "value"
    assert payload["n"] == 7
    assert "timestamp" in payload
