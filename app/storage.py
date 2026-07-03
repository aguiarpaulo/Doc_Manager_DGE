"""Object storage abstraction with a MinIO implementation and an in-memory fake.

The API depends on the `ObjectStorage` protocol so tests can swap in `InMemoryStorage`
without a running MinIO. Production wiring lives in `get_storage`.
"""

import io
from typing import Protocol

from app.config import get_settings


class ObjectStorage(Protocol):
    def put_object(self, key: str, data: bytes, content_type: str) -> None: ...

    def get_object(self, key: str) -> bytes: ...

    def ping(self) -> None: ...


class InMemoryStorage:
    """Test double: keeps objects in a dict."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    def get_object(self, key: str) -> bytes:
        return self.objects[key]

    def ping(self) -> None:
        return None


class MinioStorage:
    def __init__(self) -> None:
        from minio import Minio

        settings = get_settings()
        self._bucket = settings.minio_bucket
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            self._bucket, key, io.BytesIO(data), length=len(data), content_type=content_type
        )

    def get_object(self, key: str) -> bytes:
        response = self._client.get_object(self._bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def ping(self) -> None:
        self._client.bucket_exists(self._bucket)


_storage: MinioStorage | None = None


def get_storage() -> ObjectStorage:
    global _storage
    if _storage is None:
        _storage = MinioStorage()
    return _storage
