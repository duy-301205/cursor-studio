"""Validate registered assets and their compatibility as a cursor role."""

from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from uuid import UUID

from anyio import to_thread
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_user import AdminAsset, AssetKind
from app.services.admin_assets import (
    MAX_UPLOAD_BYTES,
    AssetBytes,
    InvalidAsset,
    PrivateAssets,
    asset_key,
    validate_asset,
)

_MIME_TYPES = {
    AssetKind.PREVIEW: "image/png",
    AssetKind.THUMBNAIL: "image/webp",
    AssetKind.CURSOR: "application/octet-stream",
}


async def find_asset(
    db: AsyncSession, pack_id: int, asset_id: UUID
) -> AdminAsset | None:
    """Resolve an asset only within the owning pack."""
    asset = await db.get(AdminAsset, asset_id.bytes)
    return asset if asset is not None and asset.pack_id == pack_id else None


async def verify_registered_asset(
    store: PrivateAssets, asset: AdminAsset, kind: AssetKind
) -> AssetBytes:
    """Check ownership-derived key, stored bytes and verified format metadata."""
    if asset.kind != kind:
        raise InvalidAsset(f"Expected a {kind.value} asset.")
    if (
        asset.storage_key != asset_key(asset.pack_id, UUID(bytes=asset.id), kind)
        or asset.mime_type != _MIME_TYPES[kind]
        or not 0 < asset.byte_size <= MAX_UPLOAD_BYTES
    ):
        raise InvalidAsset("Asset registry metadata does not match its kind.")
    data = await store.read(asset.storage_key, max_bytes=asset.byte_size)
    if len(data) != asset.byte_size or sha256(data).digest() != asset.sha256:
        raise InvalidAsset("Asset integrity verification failed.")
    verified = await validate_asset(kind, data)
    if (
        verified.mime_type != asset.mime_type
        or verified.width != asset.width
        or verified.height != asset.height
        or verified.hotspot_x != asset.hotspot_x
        or verified.hotspot_y != asset.hotspot_y
    ):
        raise InvalidAsset("Asset geometry or format does not match the registry.")
    # The registry stores canonical PNG/WebP, not the source format or dimensions.
    if kind != AssetKind.CURSOR:
        await to_thread.run_sync(_verify_image_geometry, data, verified)
    return verified


def _verify_image_geometry(data: bytes, verified: AssetBytes) -> None:
    with Image.open(BytesIO(data)) as image:
        if Image.MIME.get(image.format or "") != verified.mime_type or image.size != (
            verified.width,
            verified.height,
        ):
            raise InvalidAsset(
                "Image does not match the registered format or dimensions."
            )


def _visible_rgba(image: Image.Image) -> bytes:
    canvas = Image.new("RGBA", image.size)
    canvas.alpha_composite(image)
    return canvas.tobytes()


def _match_rasters(cursor: AssetBytes, preview: AssetBytes) -> None:
    size = (cursor.width, cursor.height)
    end = 62 + cursor.width * cursor.height * 4
    # validate_asset has already verified the single-entry DIB, including its AND mask.
    cursor_image = Image.frombytes(
        "RGBA", size, cursor.data[62:end], "raw", "BGRA", 0, -1
    )
    with Image.open(BytesIO(preview.data), formats=["PNG"]) as image:
        if _visible_rgba(image.convert("RGBA")) != _visible_rgba(cursor_image):
            raise InvalidAsset("Preview pixels do not match the cursor raster.")


async def validate_role_assets(
    store: PrivateAssets,
    cursor: AdminAsset,
    preview: AdminAsset,
    hotspot_x: int,
    hotspot_y: int,
) -> AssetBytes:
    """Check role dimensions, CUR hotspot and visible preview pixels including alpha."""
    if (
        cursor.pack_id != preview.pack_id
        or cursor.kind != AssetKind.CURSOR
        or preview.kind != AssetKind.PREVIEW
    ):
        raise InvalidAsset("Expected a cursor and a preview from the same pack.")
    cursor_bytes = await verify_registered_asset(store, cursor, AssetKind.CURSOR)
    preview_bytes = await verify_registered_asset(store, preview, AssetKind.PREVIEW)
    if (cursor_bytes.width, cursor_bytes.height) != (
        preview_bytes.width,
        preview_bytes.height,
    ):
        raise InvalidAsset("Preview and cursor dimensions must match.")
    if (
        not 0 <= hotspot_x < cursor_bytes.width
        or not 0 <= hotspot_y < cursor_bytes.height
        or (hotspot_x, hotspot_y) != (cursor_bytes.hotspot_x, cursor_bytes.hotspot_y)
    ):
        raise InvalidAsset("Hotspot must match the CUR header and fit the raster.")
    await to_thread.run_sync(_match_rasters, cursor_bytes, preview_bytes)
    return cursor_bytes
