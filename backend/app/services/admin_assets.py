"""Validation and private object storage for the Admin asset registry."""

from __future__ import annotations

import os
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from struct import error as StructError
from struct import unpack_from
from tempfile import NamedTemporaryFile
from typing import Protocol, TypedDict, cast
from uuid import UUID

from anyio import CapacityLimiter, to_thread
from botocore.exceptions import BotoCoreError, ClientError  # type: ignore[import-untyped]
from PIL import Image, ImageOps

from app.core.config import Settings
from app.models.admin_user import AssetKind
from app.services.cur_encoder import inspect_cur_header
from app.services.storage import (
    InvalidAssetLocation,
    LocalStorage,
    R2Storage,
    Storage,
    StorageError,
    _R2Client,
    create_r2_read_client,
)

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
_MAX_PIXELS = 12_000_000
_PROCESSING = CapacityLimiter(2)
_STORAGE = CapacityLimiter(4)
_ASSET_KEY = re.compile(
    r"managed/[1-9][0-9]{0,15}/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|webp|cur)"
)
_STATIC_ROOT = Path(__file__).resolve().parents[1] / "static"
_PNG_HEADER = b"\x89PNG\r\n\x1a\n"
_PNG_END = b"\x00\x00\x00\x00IEND\xaeB\x60\x82"


class InvalidAsset(Exception):
    """Upload bytes are outside the accepted formats or geometry."""


class AssetKeyExists(StorageError):
    """The object key already exists and was left intact."""


@dataclass(frozen=True)
class AssetBytes:
    data: bytes
    mime_type: str
    width: int
    height: int
    hotspot_x: int | None = None
    hotspot_y: int | None = None


def asset_key(pack_id: int, asset_id: UUID, kind: AssetKind) -> str:
    extension = {
        AssetKind.PREVIEW: "png",
        AssetKind.THUMBNAIL: "webp",
        AssetKind.CURSOR: "cur",
    }[kind]
    return _validated_key(f"managed/{pack_id}/{asset_id}.{extension}")


def _validated_key(key: str) -> str:
    if _ASSET_KEY.fullmatch(key) is None:
        raise InvalidAssetLocation("Invalid managed asset key")
    return key


def _png_ends_at_iend(data: bytes) -> bool:
    offset = len(_PNG_HEADER)
    while offset + 12 <= len(data):
        length, kind = unpack_from(">I4s", data, offset)
        if kind == b"IEND":
            return data[offset:] == _PNG_END
        offset += length + 12
    return False


def _image_format(data: bytes) -> str:
    if data.startswith(_PNG_HEADER) and _png_ends_at_iend(data):
        return "PNG"
    if (
        len(data) >= 12
        and data.startswith(b"RIFF")
        and data[8:12] == b"WEBP"
        and unpack_from("<I", data, 4)[0] == len(data) - 8
    ):
        return "WEBP"
    raise InvalidAsset("Expected a complete PNG or WebP image.")


def _normalize_image(kind: AssetKind, data: bytes) -> AssetBytes:
    image_format = _image_format(data)
    try:
        with Image.open(BytesIO(data), formats=[image_format]) as probe:
            if probe.format != image_format or probe.width * probe.height > _MAX_PIXELS:
                raise InvalidAsset("Invalid image format or pixel count.")
            if getattr(probe, "is_animated", False):
                raise InvalidAsset("Animated images are not supported.")
            probe.verify()
        with Image.open(BytesIO(data), formats=[image_format]) as decoded:
            decoded.load()
            raster = ImageOps.exif_transpose(decoded).convert("RGBA")
            if kind == AssetKind.PREVIEW:
                if raster.size not in {(32, 32), (48, 48)}:
                    raise InvalidAsset("Preview must be 32×32 or 48×48 pixels.")
                encoding, mime = "PNG", "image/png"
            else:
                raster.thumbnail((512, 512), Image.Resampling.LANCZOS)
                encoding, mime = "WEBP", "image/webp"
            clean = Image.frombytes("RGBA", raster.size, raster.tobytes())
            with BytesIO() as output:
                clean.save(output, format=encoding, lossless=True)
                normalized = output.getvalue()
    except (
        OSError,
        ValueError,
        SyntaxError,
        EOFError,
        StructError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise InvalidAsset("Invalid image payload.") from None
    return AssetBytes(normalized, mime, clean.width, clean.height)


def _validate_cursor(data: bytes) -> AssetBytes:
    try:
        width, height, x, y = inspect_cur_header(data)
    except ValueError:
        raise InvalidAsset("Expected a complete, single-image Windows CUR.") from None
    if width not in (32, 48) or height != width or x >= width or y >= height:
        raise InvalidAsset("Invalid CUR dimensions or hotspot.")
    stride = ((width + 31) // 32) * 4
    raster_size = width * height * 4
    mask_size = stride * height
    if (
        data[8:10] != b"\x00\x00"
        or unpack_from("<IiiHHII", data, 22)
        != (40, width, height * 2, 1, 32, 0, raster_size + mask_size)
        or len(data) != 62 + raster_size + mask_size
    ):
        raise InvalidAsset("Invalid CUR bitmap header or stride.")
    mask = bytearray(mask_size)
    for index, alpha in enumerate(data[65 : 62 + raster_size : 4]):
        if alpha == 0:
            row, column = divmod(index, width)
            mask[row * stride + column // 8] |= 0x80 >> (column % 8)
    if data[62 + raster_size :] != mask:
        raise InvalidAsset("CUR transparency mask does not match alpha.")
    return AssetBytes(data, "application/octet-stream", width, height, x, y)


async def validate_asset(kind: AssetKind, data: bytes) -> AssetBytes:
    """Decode or validate an entire bounded asset off the event loop."""
    if not 0 < len(data) <= MAX_UPLOAD_BYTES:
        raise InvalidAsset("Invalid asset byte count.")
    if kind == AssetKind.CURSOR:
        return await to_thread.run_sync(_validate_cursor, data, limiter=_PROCESSING)
    normalized = await to_thread.run_sync(
        _normalize_image, kind, data, limiter=_PROCESSING
    )
    if len(normalized.data) > MAX_UPLOAD_BYTES:
        raise InvalidAsset("Normalized image exceeds the byte budget.")
    return normalized


class PrivateAssets(Protocol):
    async def put(self, key: str, asset: AssetBytes) -> None: ...
    async def read(self, key: str, *, max_bytes: int) -> bytes: ...
    async def delete(self, key: str) -> None: ...
    def inventory(self, pack_id: int) -> AsyncIterator[tuple[str, datetime]]: ...


class LocalPrivateAssets:
    """Store immutable files outside the development static mount."""

    def __init__(self, root: Path) -> None:
        if not root.is_absolute() or root.is_symlink():
            raise StorageError(
                "Private asset root must be an absolute, regular directory"
            )
        self.root = root.resolve()
        static = _STATIC_ROOT.resolve()
        if self.root.is_relative_to(static) or static.is_relative_to(self.root):
            raise StorageError("Private asset root overlaps the public static root")
        self._reader = LocalStorage(self.root, "https://private-assets.invalid")

    def _path(self, key: str, *, create: bool = False) -> Path:
        path = self.root.joinpath(*_validated_key(key).split("/"))
        for directory in (self.root, path.parent.parent, path.parent):
            if directory.is_symlink():
                raise InvalidAssetLocation("Symlink in private asset directory")
            if create:
                directory.mkdir(
                    mode=0o700, exist_ok=True, parents=directory == self.root
                )
            if (
                os.name == "posix"
                and directory.exists()
                and directory.stat().st_mode & 0o022
            ):
                raise InvalidAssetLocation(
                    "Private asset directory is writable by other users"
                )
        if path.is_symlink() or not path.resolve().is_relative_to(self.root):
            raise InvalidAssetLocation("Invalid private asset path")
        if path.exists() and not path.is_file():
            raise InvalidAssetLocation("Private asset is not a regular file")
        return path

    async def put(self, key: str, asset: AssetBytes) -> None:
        await to_thread.run_sync(self._put, key, asset.data, limiter=_STORAGE)

    def _put(self, key: str, data: bytes) -> None:
        try:
            path = self._path(key, create=True)
            with NamedTemporaryFile(dir=path.parent, delete=False) as output:
                staged = Path(output.name)
                try:
                    output.write(data)
                    output.flush()
                    os.fsync(output.fileno())
                    output.close()
                    os.link(staged, path)
                finally:
                    staged.unlink(missing_ok=True)
        except FileExistsError:
            raise AssetKeyExists("Managed asset already exists") from None
        except OSError:
            raise StorageError("Unable to write private asset") from None

    async def read(self, key: str, *, max_bytes: int) -> bytes:
        await to_thread.run_sync(self._assert_path, key, limiter=_STORAGE)
        return await self._reader.read_asset(
            self._reader.public_url(key), max_bytes=max_bytes
        )

    def _assert_path(self, key: str) -> None:
        try:
            self._path(key)
        except OSError:
            raise StorageError("Unable to resolve private asset") from None

    async def delete(self, key: str) -> None:
        await to_thread.run_sync(self._delete, key, limiter=_STORAGE)

    def _delete(self, key: str) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except OSError:
            raise StorageError("Unable to delete private asset") from None

    async def inventory(self, pack_id: int) -> AsyncIterator[tuple[str, datetime]]:
        entries = await to_thread.run_sync(self._inventory, pack_id, limiter=_STORAGE)
        for entry in entries:
            yield entry

    def _inventory(self, pack_id: int) -> list[tuple[str, datetime]]:
        probe = asset_key(pack_id, UUID(int=0), AssetKind.PREVIEW)
        try:
            directory = self._path(probe).parent
            if not directory.exists():
                return []
            prefix = f"managed/{pack_id}/"
            return [
                (
                    prefix + child.name,
                    datetime.fromtimestamp(child.stat().st_mtime, UTC),
                )
                for child in directory.iterdir()
                if _ASSET_KEY.fullmatch(prefix + child.name)
                and not child.is_symlink()
                and child.is_file()
            ]
        except OSError:
            raise StorageError("Unable to list private assets") from None


class _ListedAsset(TypedDict):
    Key: str
    LastModified: datetime


class _InventoryPage(TypedDict, total=False):
    Contents: list[_ListedAsset]
    NextContinuationToken: str
    IsTruncated: bool


class PrivateR2Client(_R2Client, Protocol):
    def put_object(
        self, *, Bucket: str, Key: str, Body: bytes, ContentType: str, IfNoneMatch: str
    ) -> object: ...

    def delete_object(self, *, Bucket: str, Key: str) -> object: ...

    def list_objects_v2(
        self, *, Bucket: str, Prefix: str, MaxKeys: int, ContinuationToken: str = ""
    ) -> _InventoryPage: ...


class R2PrivateAssets:
    """Keep objects in a dedicated private R2 bucket."""

    def __init__(self, client: PrivateR2Client, bucket: str) -> None:
        self._client = client
        self._bucket = bucket
        self._reader = R2Storage(client, bucket, "https://private-assets.invalid")

    async def put(self, key: str, asset: AssetBytes) -> None:
        await to_thread.run_sync(
            self._put, _validated_key(key), asset, limiter=_STORAGE
        )

    def _put(self, key: str, asset: AssetBytes) -> None:
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=asset.data,
                ContentType=asset.mime_type,
                IfNoneMatch="*",
            )
        except ClientError as exc:
            if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 412:
                raise AssetKeyExists("Managed asset already exists") from None
            raise StorageError("Unable to write private R2 asset") from None
        except (BotoCoreError, OSError):
            raise StorageError("Unable to write private R2 asset") from None

    async def read(self, key: str, *, max_bytes: int) -> bytes:
        return await self._reader.read_asset(
            self._reader.public_url(_validated_key(key)), max_bytes=max_bytes
        )

    async def delete(self, key: str) -> None:
        await to_thread.run_sync(self._delete, _validated_key(key), limiter=_STORAGE)

    def _delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError, OSError):
            raise StorageError("Unable to delete private R2 asset") from None

    async def inventory(self, pack_id: int) -> AsyncIterator[tuple[str, datetime]]:
        asset_key(pack_id, UUID(int=0), AssetKind.PREVIEW)
        prefix = f"managed/{pack_id}/"
        token = None
        while True:
            page = await to_thread.run_sync(
                self._inventory_page, prefix, token, limiter=_STORAGE
            )
            for asset in page.get("Contents", []):
                key = asset["Key"]
                if key.startswith(prefix) and _ASSET_KEY.fullmatch(key):
                    yield key, asset["LastModified"]
            next_token = page.get("NextContinuationToken")
            if not page.get("IsTruncated"):
                return
            if not next_token or next_token == token:
                raise StorageError("Invalid private R2 inventory continuation")
            token = next_token

    def _inventory_page(self, prefix: str, token: str | None) -> _InventoryPage:
        try:
            if token is None:
                return self._client.list_objects_v2(
                    Bucket=self._bucket, Prefix=prefix, MaxKeys=250
                )
            return self._client.list_objects_v2(
                Bucket=self._bucket, Prefix=prefix, MaxKeys=250, ContinuationToken=token
            )
        except (BotoCoreError, ClientError, OSError):
            raise StorageError("Unable to list private R2 assets") from None


def private_storage(settings: Settings) -> PrivateAssets:
    if settings.storage_backend == "local":
        return LocalPrivateAssets(Path(os.environ.get("ADMIN_ASSET_LOCAL_ROOT", "")))
    bucket = os.environ.get("ADMIN_ASSET_R2_BUCKET", "")
    if not bucket or bucket == settings.r2_bucket:
        raise StorageError("A dedicated private Admin asset bucket is required")
    return R2PrivateAssets(
        cast(PrivateR2Client, create_r2_read_client(settings)), bucket
    )


class ManagedAssetStorage(Storage):
    """Internal URL-to-key bridge for the future publish gate and ZIP builder."""

    def __init__(self, store: PrivateAssets, public_prefix: str) -> None:
        self._store = store
        self._prefix = public_prefix.rstrip("/") + "/"

    def public_url(self, path: str) -> str:
        return self._prefix + _validated_key(path)

    async def read_asset(self, trusted_asset_url: str, *, max_bytes: int) -> bytes:
        if not trusted_asset_url.startswith(self._prefix):
            raise InvalidAssetLocation("URL is outside the managed asset prefix")
        return await self._store.read(
            _validated_key(trusted_asset_url[len(self._prefix) :]), max_bytes=max_bytes
        )
