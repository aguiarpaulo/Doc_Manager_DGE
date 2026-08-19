"""Round-trip of `MinioStorage` against a real MinIO server.

The rest of the suite swaps in `InMemoryStorage`, which is the right call — it keeps
`pytest` runnable with no services. But the fake can never show that the MinIO client
is driven correctly, and `delete_object` in particular has no coverage worth the name
without a server: a fake that stores nothing will happily "delete" nothing.

Skipped unless `GED_LIVE_MINIO=1`, so the default suite still needs no Docker.

    docker run -d -p 9030:9000 -e MINIO_ROOT_USER=minioadmin \
        -e MINIO_ROOT_PASSWORD=minioadmin123 minio/minio server /data

    GED_LIVE_MINIO=1 GED_MINIO_ENDPOINT=127.0.0.1:9030 \
        GED_MINIO_ACCESS_KEY=minioadmin GED_MINIO_SECRET_KEY=minioadmin123 \
        uv run pytest tests/test_storage_minio_live.py
"""

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("GED_LIVE_MINIO") != "1",
    reason="precisa de um MinIO real; defina GED_LIVE_MINIO=1",
)

PNG = b"\x89PNG\r\n\x1a\n" + b"rubrica de teste"


@pytest.fixture
def storage():
    # Imported inside the fixture so collecting the module never needs the settings
    # to point at a live server.
    from app.config import get_settings
    from app.storage import MinioStorage

    get_settings.cache_clear()
    return MinioStorage()


def test_put_get_delete_round_trip(storage):
    key = f"rubricas/{uuid.uuid4()}/{uuid.uuid4()}.png"

    storage.put_object(key, PNG, "image/png")
    assert storage.get_object(key) == PNG

    storage.delete_object(key)

    # After deletion the object is really gone from the bucket, which is the claim
    # the in-memory fake cannot substantiate.
    from minio.error import S3Error

    with pytest.raises(S3Error):
        storage.get_object(key)


def test_delete_is_idempotent_against_a_real_bucket(storage):
    key = f"rubricas/{uuid.uuid4()}/{uuid.uuid4()}.png"
    storage.put_object(key, PNG, "image/png")

    storage.delete_object(key)
    # MinIO treats removing an absent object as success; a retry after a partial
    # failure must therefore not raise.
    storage.delete_object(key)


def test_replacing_a_rubric_leaves_only_the_new_object(storage):
    user_id = uuid.uuid4()
    antiga = f"rubricas/{user_id}/{uuid.uuid4()}.png"
    nova = f"rubricas/{user_id}/{uuid.uuid4()}.png"

    storage.put_object(antiga, PNG, "image/png")
    outra = b"\x89PNG\r\n\x1a\n" + b"outra rubrica"
    storage.put_object(nova, outra, "image/png")
    # The service writes the new object before dropping the previous one.
    storage.delete_object(antiga)

    assert storage.get_object(nova) == outra
    from minio.error import S3Error

    with pytest.raises(S3Error):
        storage.get_object(antiga)


def test_ping_reports_a_reachable_bucket(storage):
    storage.ping()
