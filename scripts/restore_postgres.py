"""Restore verification for a PostgreSQL backup.

Restores the most recent dump from ./backups into a scratch database and confirms the
schema is present. This is the tested restore procedure. Exits non-zero on failure.

    python scripts/restore_postgres.py
"""

import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / "backups"
DB_USER = "ged"
SCRATCH_DB = "ged_restore_test"


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


def _psql(container: str, args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-U", DB_USER, *args],
        input=stdin,
        capture_output=True,
        text=True,
        check=True,
    )


def main() -> int:
    dumps = sorted(BACKUP_DIR.glob("ged_*.sql"))
    if not dumps:
        print("RESTORE FAILED: no backup found in ./backups", file=sys.stderr)
        return 1
    latest = dumps[-1]
    container = _compose_container("postgres")

    _psql(container, ["-d", "postgres", "-c", f'DROP DATABASE IF EXISTS "{SCRATCH_DB}";'])
    _psql(container, ["-d", "postgres", "-c", f'CREATE DATABASE "{SCRATCH_DB}";'])
    _psql(container, ["-d", SCRATCH_DB], stdin=latest.read_text(encoding="utf-8"))

    check = _psql(container, ["-d", SCRATCH_DB, "-t", "-c", "SELECT count(*) FROM users;"])
    _psql(container, ["-d", "postgres", "-c", f'DROP DATABASE IF EXISTS "{SCRATCH_DB}";'])

    print(f"RESTORE OK: {latest.name} restored; users table present (rows={check.stdout.strip()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
