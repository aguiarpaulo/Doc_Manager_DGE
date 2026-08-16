"""Delivery-graph consistency: gaps stay well-formed and a resolved gap matches reality.

These guard the hand-edited graph.json against malformed edits and against the graph
drifting from what is actually implemented in the repo.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = REPO_ROOT / "delivery-graph" / "graph.json"

_GAP_KEYS = {"id", "type", "severity", "question", "blocks", "resolution"}


def _load_gaps() -> list[dict]:
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    return graph["gaps"]


def test_every_gap_is_well_formed():
    for gap in _load_gaps():
        assert _GAP_KEYS <= set(gap), f"{gap.get('id')} missing keys"
        assert isinstance(gap["blocks"], list)
        assert gap["resolution"] is None or isinstance(gap["resolution"], str)


def test_a_resolved_gap_is_never_blank():
    for gap in _load_gaps():
        if gap["resolution"] is not None:
            assert gap["resolution"].strip(), f"{gap['id']} resolved with blank text"


def test_https_gap_resolution_matches_caddy_implementation():
    caddyfile = (REPO_ROOT / "docker" / "Caddyfile").read_text(encoding="utf-8")
    compose = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    # Caddy moved out of the compose file into the web image when the SPA started
    # being served from the same origin; it is still what terminates TLS.
    dockerfile_web = (REPO_ROOT / "docker" / "Dockerfile.web").read_text(encoding="utf-8")

    # HTTPS termination is really implemented via Caddy...
    assert "reverse_proxy" in caddyfile
    assert "CADDY_DOMAIN" in caddyfile
    assert "FROM caddy:" in dockerfile_web
    assert "docker/Dockerfile.web" in compose
    assert "443" in compose

    # ...and the API is published under a prefix the proxy strips, so the SPA and
    # the API share one origin and no request ever crosses origins.
    assert "handle_path /api/*" in caddyfile

    # ...so the graph must not still list GAP-002 (HTTPS mechanism) as unresolved.
    gap = next(g for g in _load_gaps() if g["id"] == "GAP-002")
    assert gap["resolution"] is not None
