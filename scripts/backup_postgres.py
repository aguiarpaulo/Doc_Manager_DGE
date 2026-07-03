"""Daily PostgreSQL backup routine (cron-able).

Runs pg_dump *inside* the compose postgres container (matching server version) and writes
a timestamped SQL dump to ./backups. Schedule with cron/Task Scheduler, or use the
`backup` service in docker-compose.backup.yml. Exits non-zero on failure.

    python scripts/backup_postgres.py
"""

import datetime as dt
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / "backups"
DB_USER = "ged"
DB_NAME = "ged"


def _compose_container(service: str) -> str:
    result = subprocess.run(
        ["docker", "compose", "ps", "-q", service],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    container = result.stdout.strip()
    if not container:
        raise RuntimeError(f"compose service '{service}' is not running")
    return container


def main() -> int:
    BACKUP_DIR.mkdir(exist_ok=True)
    container = _compose_container("postgres")
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"ged_{stamp}.sql"

    dump = subprocess.run(
        ["docker", "exec", container, "pg_dump", "-U", DB_USER, DB_NAME],
        capture_output=True,
        text=True,
        check=True,
    )
    target.write_text(dump.stdout, encoding="utf-8")

    if target.stat().st_size == 0 or "CREATE TABLE" not in dump.stdout:
        print(f"BACKUP FAILED: dump {target} is empty or has no schema", file=sys.stderr)
        return 1
    print(f"BACKUP OK: {target} ({target.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
