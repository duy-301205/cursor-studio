"""Read cursor assets from a configured local directory or R2 bucket."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol, TypedDict, cast
from urllib.parse import quote, unquote, urlsplit

import boto3  # type: ignore[import-untyped]
from anyio import CapacityLimiter, to_thread
from botocore.config import Config  # type: ignore[import-untyped]
from botocore.exceptions import (  # type: ignore[import-untyped]
    BotoCoreError,
    ClientError,
    ConnectTimeoutError,
    ReadTimeoutError,
)

from app.core.config import Settings

MAX_ASSET_BYTES = 10 * 1024 * 1024
_READ_LIMITER = CapacityLimiter(4)
_SAMPLES_DIRECTORY = Path(__file__).resolve().parents[1] / "static" / "samples"


class StorageError(Exception):
    """An asset cannot be read within the configured storage policy."""


class InvalidAssetLocation(StorageError):
    """The asset URL or key is outside the allowed storage namespace."""


class AssetNotFound(StorageError):
    """An expected trusted object is missing."""


class AssetTooLarge(StorageError):
    """The asset exceeds the requested byte budget."""


class Storage(Protocol):
    async def read_asset(self, trusted_asset_url: str, *, max_bytes: int) -> bytes: ...

    def public_url(self, path: str) -> str: ...


class _ObjectBody(Protocol):
    def read(self, amt: int) -> bytes: ...

    def close(self) -> None: ...


class _StoredObject(TypedDict):
    Body: _ObjectBody
    ContentLength: int


class _R2Client(Protocol):
    def get_object(self, *, Bucket: str, Key: str) -> _StoredObject: ...


def _base_url(value: str) -> str:
    try:
        url = urlsplit(value)
        if (
            url.scheme in {"http", "https"}
            and url.hostname
            and url.username is None
            and url.password is None
            and not any(char in value for char in "?#\\")
            and not any(char.isspace() or ord(char) < 32 for char in value)
        ):
            return value.rstrip("/") + "/"
    except ValueError:
        pass
    raise StorageError("Invalid public storage URL configuration")


def _key(path: str) -> str:
    if any(not part or part.endswith((".", " ")) for part in path.split("/")) or any(
        char in "\\%?#:" or ord(char) < 32 or ord(char) == 127 for char in path
    ):
        raise InvalidAssetLocation("Invalid asset key")
    return path


def _key_from_url(value: str, prefix: str) -> str:
    if not value.startswith(prefix):
        raise InvalidAssetLocation("Asset URL is outside configured storage")
    suffix = value[len(prefix) :]
    if any(char.isspace() or ord(char) < 32 for char in suffix):
        raise InvalidAssetLocation("Invalid asset URL")
    if any(separator in suffix.lower() for separator in ("%2f", "%5c")):
        raise InvalidAssetLocation("Invalid encoded asset path separator")
    try:
        return _key(unquote(suffix, errors="strict"))
    except UnicodeDecodeError:
        raise InvalidAssetLocation("Invalid asset URL encoding") from None


def _budget(max_bytes: int) -> None:
    if type(max_bytes) is not int or not 1 <= max_bytes <= MAX_ASSET_BYTES:
        raise StorageError("Invalid asset byte budget")


def _bounded(data: bytes, max_bytes: int) -> bytes:
    if len(data) > max_bytes:
        raise AssetTooLarge("Asset exceeds the byte budget")
    return data


class LocalStorage:
    """Read files beneath the resolved development samples root."""

    def __init__(self, root: Path, public_base_url: str) -> None:
        self._root = root.resolve()
        self._prefix = _base_url(public_base_url)

    def public_url(self, path: str) -> str:
        return self._prefix + quote(_key(path))

    async def read_asset(self, trusted_asset_url: str, *, max_bytes: int) -> bytes:
        _budget(max_bytes)
        key = _key_from_url(trusted_asset_url, self._prefix)
        return await to_thread.run_sync(
            self._read, key, max_bytes, limiter=_READ_LIMITER
        )

    def _read(self, key: str, max_bytes: int) -> bytes:
        try:
            path = self._root.joinpath(*key.split("/")).resolve(strict=True)
            if not path.is_relative_to(self._root):
                raise InvalidAssetLocation("Asset path escapes the storage root")
            if not path.is_file():
                raise StorageError("Asset is not a regular file")
            with path.open("rb") as stream:
                return _bounded(stream.read(max_bytes + 1), max_bytes)
        except FileNotFoundError:
            raise AssetNotFound("Unable to read local asset") from None
        except TimeoutError:
            raise StorageError("Asset read timed out") from None
        except (OSError, RuntimeError):
            raise StorageError("Unable to read local asset") from None


class R2Storage:
    """Read object keys from one bucket using a configured S3-compatible client."""

    def __init__(self, client: _R2Client, bucket: str, public_base_url: str) -> None:
        self._client = client
        self._bucket = bucket
        self._prefix = _base_url(public_base_url)

    def public_url(self, path: str) -> str:
        return self._prefix + quote(_key(path))

    async def read_asset(self, trusted_asset_url: str, *, max_bytes: int) -> bytes:
        _budget(max_bytes)
        key = _key_from_url(trusted_asset_url, self._prefix)
        return await to_thread.run_sync(
            self._read, key, max_bytes, limiter=_READ_LIMITER
        )

    def _read(self, key: str, max_bytes: int) -> bytes:
        try:
            asset = self._client.get_object(Bucket=self._bucket, Key=key)
            body = asset["Body"]
            try:
                if asset["ContentLength"] > max_bytes:
                    raise AssetTooLarge("Asset exceeds the byte budget")
                return _bounded(body.read(max_bytes + 1), max_bytes)
            finally:
                body.close()
        except (TimeoutError, ConnectTimeoutError, ReadTimeoutError):
            raise StorageError("Asset read timed out") from None
        except ClientError as exc:
            error = exc.response.get("Error", {}).get("Code")
            if error in {"NoSuchKey", "NotFound", "404"}:
                raise AssetNotFound(
                    "Unable to read asset from object storage"
                ) from None
            raise StorageError("Unable to read asset from object storage") from None
        except (BotoCoreError, OSError):
            raise StorageError("Unable to read asset from object storage") from None


def create_r2_read_client(settings: Settings) -> _R2Client:
    """Create the fixed-endpoint client shared by trusted R2 adapters."""
    endpoint = settings.r2_endpoint
    key_id = settings.r2_access_key_id
    secret = settings.r2_secret_access_key
    if endpoint is None or key_id is None or secret is None:
        raise StorageError("Incomplete object storage configuration")

    endpoint_url = _base_url(str(endpoint)).rstrip("/")
    try:
        client = cast(
            "_R2Client",
            boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                region_name="auto",
                aws_access_key_id=key_id.get_secret_value(),
                aws_secret_access_key=secret.get_secret_value(),
                config=Config(
                    connect_timeout=3,
                    read_timeout=5,
                    retries={"total_max_attempts": 1},
                    s3={"addressing_style": "path"},
                ),
            ),
        )
    except (BotoCoreError, ClientError, ValueError):
        raise StorageError("Unable to configure object storage") from None
    return client


def create_storage(settings: Settings) -> Storage:
    """Build the storage adapter from service-side settings."""
    if settings.storage_backend == "local":
        return LocalStorage(
            _SAMPLES_DIRECTORY,
            f"{str(settings.public_api_base_url).rstrip('/')}/static/samples",
        )

    bucket = settings.r2_bucket
    public_base = settings.public_cdn_base_url
    if bucket is None or public_base is None:
        raise StorageError("Incomplete object storage configuration")
    return R2Storage(create_r2_read_client(settings), bucket, str(public_base))
