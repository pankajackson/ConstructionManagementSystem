"""Pluggable file storage providers.

Selected via `STORAGE_TYPE` env var. Every provider implements the same interface:
- `upload(data, key, content_type)` -> stores the bytes under `key`
- `public_url(key)` or `signed_url(key, ttl)` -> returns a URL renderable in <img>

Providers:
- FilesystemProvider — writes to local disk under UPLOAD_DIR; served by backend
  route `/api/v1/uploads/file/{org}/{filename}`.
- S3Provider — uploads to a private S3 bucket, returns a pre-signed GET URL
  (default TTL 7 days, configurable via S3_PRESIGNED_TTL_SECONDS). Optionally
  returns a CloudFront/public URL if `AWS_S3_PUBLIC_URL_BASE` is set.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import aiofiles

from core.config import get_settings

log = logging.getLogger("storage")


class StorageProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    async def upload(self, *, data: bytes, key: str, content_type: str) -> None: ...

    @abstractmethod
    async def get_file_url(self, key: str, *, request_base_url: str | None = None) -> str: ...


class FilesystemProvider(StorageProvider):
    provider_name = "filesystem"

    async def upload(self, *, data: bytes, key: str, content_type: str) -> None:
        settings = get_settings()
        path = Path(settings.UPLOAD_DIR) / key
        path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(path, "wb") as f:
            await f.write(data)

    async def get_file_url(self, key: str, *, request_base_url: str | None = None) -> str:
        # Prefer explicit PUBLIC_BASE_URL (safe for pods behind ingress); fall back
        # to the request's base URL for local dev.
        settings = get_settings()
        base = (settings.PUBLIC_BASE_URL or request_base_url or "").rstrip("/")
        return f"{base}/api/v1/uploads/file/{key}"


class S3Provider(StorageProvider):
    provider_name = "s3"

    def __init__(self):
        import aioboto3  # deferred
        self._aioboto3 = aioboto3
        self._session = aioboto3.Session()

    def _client_kwargs(self) -> dict:
        s = get_settings()
        return {
            "aws_access_key_id": s.AWS_ACCESS_KEY_ID,
            "aws_secret_access_key": s.AWS_SECRET_ACCESS_KEY,
            "region_name": s.AWS_S3_REGION,
        }

    async def upload(self, *, data: bytes, key: str, content_type: str) -> None:
        s = get_settings()
        async with self._session.client("s3", **self._client_kwargs()) as s3:
            await s3.upload_fileobj(
                BytesIO(data),
                s.AWS_S3_BUCKET,
                key,
                ExtraArgs={"ContentType": content_type},
            )

    async def get_file_url(self, key: str, *, request_base_url: str | None = None) -> str:
        s = get_settings()
        # If a CDN/public URL base is configured, return that (assumes objects are readable).
        if s.AWS_S3_PUBLIC_URL_BASE:
            return f"{s.AWS_S3_PUBLIC_URL_BASE.rstrip('/')}/{key}"
        # Otherwise return a pre-signed GET URL. Private bucket + signed access is
        # the recommended default per the playbook.
        async with self._session.client("s3", **self._client_kwargs()) as s3:
            url = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": s.AWS_S3_BUCKET, "Key": key},
                ExpiresIn=s.S3_PRESIGNED_TTL_SECONDS,
            )
            return url


@lru_cache
def get_storage_provider() -> StorageProvider:
    s = get_settings()
    if s.STORAGE_TYPE == "s3":
        return S3Provider()
    return FilesystemProvider()
