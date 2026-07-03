"""Smoke check: the running stack's /health reports DB and storage healthy.

Used as compose smoke evidence. Exits non-zero if the API, database, or MinIO is not
reachable. Override the URL with GED_SMOKE_URL.
"""

import json
import os
import sys
import urllib.request

URL = os.environ.get("GED_SMOKE_URL", "http://localhost:8000/health")


def main() -> int:
    with urllib.request.urlopen(URL, timeout=10) as resp:
        body = json.load(resp)
    ok = (
        body.get("status") == "ok"
        and body.get("checks", {}).get("database") == "ok"
        and body.get("checks", {}).get("storage") == "ok"
    )
    print(json.dumps(body))
    if not ok:
        print("SMOKE FAILED: a dependency is not healthy", file=sys.stderr)
        return 1
    print("SMOKE OK: API up, PostgreSQL and MinIO connected via env config")
    return 0


if __name__ == "__main__":
    sys.exit(main())
