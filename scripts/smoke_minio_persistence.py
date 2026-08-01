"""Smoke: MinIO objects survive container recreation (persistent volume).

Puts an object, force-recreates the minio container (volume retained), and verifies the
object is still readable. Exits non-zero on failure.

    python scripts/smoke_minio_persistence.py
"""

import io
import pathlib
import subprocess
import sys
import time

from minio import Minio

from app.config import get_settings

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEY = "persistence-check.txt"
PAYLOAD = b"durability smoke payload"

_settings = get_settings()
BUCKET = _settings.minio_bucket


def _client() -> Minio:
    return Minio(
        _settings.minio_endpoint,
        access_key=_settings.minio_access_key,
        secret_key=_settings.minio_secret_key,
        secure=_settings.minio_secure,
    )


def _wait_ready(timeout: int = 60) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            _client().bucket_exists(BUCKET)
            return
        except Exception:
            time.sleep(2)
    raise RuntimeError("MinIO did not become ready after recreation")


def main() -> int:
    client = _client()
    if not client.bucket_exists(BUCKET):
        client.make_bucket(BUCKET)
    client.put_object(BUCKET, KEY, io.BytesIO(PAYLOAD), length=len(PAYLOAD))

    # Recreate the container; the named volume must preserve the object.
    subprocess.run(
        ["docker", "compose", "up", "-d", "--force-recreate", "--no-deps", "minio"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    _wait_ready()

    response = _client().get_object(BUCKET, KEY)
    try:
        data = response.read()
    finally:
        response.close()
        response.release_conn()

    if data != PAYLOAD:
        print("SMOKE FAILED: object content changed or lost after recreation", file=sys.stderr)
        return 1
    print("SMOKE OK: MinIO object survived container recreation (persistent volume)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
