"""Publish a validated, immutable snapshot of an Admin-managed pack."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import NamedTuple
from uuid import UUID

from anyio import CapacityLimiter, WouldBlock
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.admin_user import (
    AdminAsset,
    AdminAuditEvent,
    AdminPackRole,
    AdminPackState,
    AssetKind,
)
from app.models.category import Category
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack, PackStatus
from app.schemas.admin_pack import PackMetadata
from app.services.admin_assets import (
    MAX_UPLOAD_BYTES,
    InvalidAsset,
    ManagedAssetStorage,
    PrivateAssets,
    asset_key,
    private_storage,
)
from app.services.pack_validator import validate_role_assets, verify_registered_asset
from app.services.storage import (
    AssetNotFound,
    AssetTooLarge,
    InvalidAssetLocation,
    StorageError,
    _base_url,
)
from app.services.zip_packager import AssetUnavailable, PackIncomplete, build_pack_zip

_JOBS = CapacityLimiter(2)


class ValidationBusy(Exception):
    """The bounded validation worker pool is at capacity."""


class Issue(BaseModel):
    code: str
    field: str
    message: str


class Report(BaseModel):
    valid: bool
    pack_id: int
    revision: int
    missing_roles: list[CursorRole]
    errors: list[Issue]
    warnings: list[Issue]


class Binding(NamedTuple):
    role: CursorRole
    asset_id: bytes
    preview_id: bytes
    hotspot_x: int
    hotspot_y: int


@dataclass(frozen=True)
class Snapshot:
    pack_id: int
    revision: int
    status: PackStatus
    category_id: int
    title: str
    slug: str
    description: str
    is_premium: bool
    is_animated: bool
    thumbnail_id: bytes | None
    roles: tuple[Binding, ...]


class Projection(NamedTuple):
    role: CursorRole
    cursor_url: str
    preview_url: str
    hotspot_x: int
    hotspot_y: int


class Validation(NamedTuple):
    report: Report
    thumbnail_url: str | None
    roles: list[Projection]


def managed_prefix(settings: Settings) -> str:
    if settings.storage_backend == "local":
        return _base_url(
            f"{str(settings.public_api_base_url).rstrip('/')}/static/samples"
        )
    if settings.public_cdn_base_url is None:
        raise StorageError("Managed media origin is unavailable")
    return _base_url(str(settings.public_cdn_base_url))


async def capture(
    db: AsyncSession, pack: CursorPack, state: AdminPackState
) -> Snapshot:
    rows = await db.scalars(
        select(AdminPackRole)
        .where(AdminPackRole.pack_id == pack.id)
        .order_by(AdminPackRole.role_type)
    )
    return Snapshot(
        pack.id,
        state.revision,
        pack.status,
        pack.category_id,
        pack.title,
        pack.slug,
        pack.description,
        pack.is_premium,
        pack.is_animated,
        state.thumbnail_asset_id,
        tuple(
            Binding(
                row.role_type,
                row.asset_id,
                row.preview_asset_id,
                row.hotspot_x,
                row.hotspot_y,
            )
            for row in rows
        ),
    )


async def registered_assets(
    db: AsyncSession, snapshot: Snapshot
) -> dict[bytes, AdminAsset]:
    ids = {item for role in snapshot.roles for item in (role.asset_id, role.preview_id)}
    if snapshot.thumbnail_id is not None:
        ids.add(snapshot.thumbnail_id)
    if not ids:
        return {}
    rows = await db.scalars(
        select(AdminAsset).where(
            AdminAsset.pack_id == snapshot.pack_id, AdminAsset.id.in_(ids)
        )
    )
    return {row.id: row for row in rows}


class _VerifiedZipAssets:
    def __init__(self, items: dict[str, bytes]) -> None:
        self._items = items

    def public_url(self, path: str) -> str:
        raise InvalidAssetLocation("Verified assets use precomputed URLs")

    async def read_asset(self, trusted_asset_url: str, *, max_bytes: int) -> bytes:
        data = self._items.get(trusted_asset_url)
        if data is None:
            raise AssetNotFound("Verified cursor missing")
        if len(data) > max_bytes:
            raise AssetTooLarge("Verified cursor exceeds ZIP byte budget")
        return data


def _issue(code: str, field: str, message: str) -> Issue:
    return Issue(code=code, field=field, message=message)


async def validate_snapshot(
    snapshot: Snapshot,
    assets: dict[bytes, AdminAsset],
    category_exists: bool,
    settings: Settings,
) -> Validation:
    """Validate the immutable asset snapshot without holding database locks."""
    try:
        _JOBS.acquire_nowait()
    except WouldBlock:
        raise ValidationBusy from None
    try:
        return await _validate(snapshot, assets, category_exists, settings)
    finally:
        _JOBS.release()


async def _validate(
    snapshot: Snapshot,
    assets: dict[bytes, AdminAsset],
    category_exists: bool,
    settings: Settings,
) -> Validation:
    errors: list[Issue] = []
    try:
        PackMetadata.model_validate(
            {
                "title": snapshot.title,
                "slug": snapshot.slug,
                "category_id": snapshot.category_id,
                "description": snapshot.description,
                "is_premium": snapshot.is_premium,
                "is_animated": snapshot.is_animated,
            }
        )
    except ValidationError:
        errors.append(
            _issue("INVALID_METADATA", "metadata", "Pack metadata is invalid.")
        )
    if not category_exists:
        errors.append(
            _issue("CATEGORY_REQUIRED", "category_id", "Category does not exist.")
        )
    by_role = {role.role: role for role in snapshot.roles}
    missing = [role for role in CursorRole if role not in by_role]
    for role in missing:
        errors.append(
            _issue(
                "ROLE_REQUIRED", f"roles.{role.value}", "Role has no assigned assets."
            )
        )
    thumbnail = (
        assets.get(snapshot.thumbnail_id) if snapshot.thumbnail_id is not None else None
    )
    if thumbnail is None:
        errors.append(
            _issue("THUMBNAIL_REQUIRED", "thumbnail_asset_id", "Pack has no thumbnail.")
        )

    thumbnail_url = None
    projections: list[Projection] = []
    if thumbnail is not None or by_role:
        store = private_storage(settings)
        urls = ManagedAssetStorage(store, managed_prefix(settings))
        if thumbnail is not None:
            try:
                await verify_registered_asset(store, thumbnail, AssetKind.THUMBNAIL)
                thumbnail_url = urls.public_url(thumbnail.storage_key)
            except AssetNotFound:
                errors.append(
                    _issue(
                        "ASSET_MISSING",
                        "thumbnail_asset_id",
                        "Thumbnail file is missing.",
                    )
                )
            except (InvalidAsset, AssetTooLarge):
                errors.append(
                    _issue(
                        "INVALID_ASSET", "thumbnail_asset_id", "Thumbnail is invalid."
                    )
                )
        verified: dict[str, bytes] = {}
        for role in CursorRole:
            binding = by_role.get(role)
            if binding is None:
                continue
            field = f"roles.{role.value}"
            cursor, preview = (
                assets.get(binding.asset_id),
                assets.get(binding.preview_id),
            )
            if cursor is None or preview is None:
                errors.append(
                    _issue("ASSET_MISSING", field, "Assigned asset is missing.")
                )
                continue
            try:
                cursor_bytes = await validate_role_assets(
                    store,
                    cursor,
                    preview,
                    binding.hotspot_x,
                    binding.hotspot_y,
                )
                cursor_url = urls.public_url(cursor.storage_key)
                preview_url = urls.public_url(preview.storage_key)
            except AssetNotFound:
                errors.append(
                    _issue("ASSET_MISSING", field, "Assigned file is missing.")
                )
                continue
            except (InvalidAsset, AssetTooLarge):
                errors.append(
                    _issue(
                        "INVALID_ASSET", field, "Assigned cursor or preview is invalid."
                    )
                )
                continue
            verified[cursor_url] = cursor_bytes.data
            projections.append(
                Projection(
                    role, cursor_url, preview_url, binding.hotspot_x, binding.hotspot_y
                )
            )
        if not errors:
            try:
                await build_pack_zip(
                    snapshot.title,
                    snapshot.slug,
                    {item.role.value: item.cursor_url for item in projections},
                    _VerifiedZipAssets(verified),
                )
            except (PackIncomplete, AssetUnavailable, ValueError):
                errors.append(
                    _issue(
                        "INVALID_PACKAGE",
                        "roles",
                        "Could not build the Windows installer archive.",
                    )
                )

    return Validation(
        Report(
            valid=not errors,
            pack_id=snapshot.pack_id,
            revision=snapshot.revision,
            missing_roles=missing,
            errors=errors,
            warnings=[],
        ),
        thumbnail_url,
        projections,
    )


async def publish_projection(
    db: AsyncSession, pack: CursorPack, result: Validation
) -> None:
    """Keep existing item IDs while atomically projecting the validated snapshot."""
    if (
        not result.report.valid
        or result.thumbnail_url is None
        or {projection.role for projection in result.roles} != set(CursorRole)
    ):
        raise ValueError("A complete validation result is required")
    existing = {
        row.role_type: row
        for row in await db.scalars(
            select(CursorItem).where(CursorItem.pack_id == pack.id)
        )
    }
    for item in result.roles:
        row = existing.get(item.role)
        if row is None:
            row = CursorItem(pack_id=pack.id, role_type=item.role)
            db.add(row)
        row.preview_png_url = item.preview_url
        row.cursor_file_url = item.cursor_url
        row.hotspot_x = item.hotspot_x
        row.hotspot_y = item.hotspot_y
    pack.thumbnail_url = result.thumbnail_url
    pack.status = PackStatus.PUBLISHED


async def published_asset(
    db: AsyncSession, pack_id: int, key: str, url: str
) -> AdminAsset | None:
    """Require a current published projection and the matching registry binding."""
    pack = await db.get(CursorPack, pack_id)
    state = await db.get(AdminPackState, pack_id)
    if pack is None or state is None or pack.status != PackStatus.PUBLISHED:
        return None
    asset = (
        await db.scalars(
            select(AdminAsset).where(
                AdminAsset.pack_id == pack_id, AdminAsset.storage_key == key
            )
        )
    ).one_or_none()
    if asset is None:
        return None
    if asset.kind == AssetKind.THUMBNAIL:
        return (
            asset
            if state.thumbnail_asset_id == asset.id and pack.thumbnail_url == url
            else None
        )
    if asset.kind == AssetKind.PREVIEW:
        bound = AdminPackRole.preview_asset_id
        projected = CursorItem.preview_png_url
    else:
        bound = AdminPackRole.asset_id
        projected = CursorItem.cursor_file_url
    match = await db.scalar(
        select(CursorItem.id)
        .join(
            AdminPackRole,
            (AdminPackRole.pack_id == CursorItem.pack_id)
            & (AdminPackRole.role_type == CursorItem.role_type),
        )
        .where(CursorItem.pack_id == pack_id, bound == asset.id, projected == url)
        .limit(1)
    )
    return asset if match is not None else None


async def read_published_bytes(store: PrivateAssets, asset: AdminAsset) -> bytes:
    expected_key = asset_key(asset.pack_id, UUID(bytes=asset.id), asset.kind)
    if expected_key != asset.storage_key or not 0 < asset.byte_size <= MAX_UPLOAD_BYTES:
        raise StorageError("Invalid published registry metadata")
    content = await store.read(expected_key, max_bytes=asset.byte_size)
    if len(content) != asset.byte_size or sha256(content).digest() != asset.sha256:
        raise StorageError("Published asset failed integrity verification")
    return content


async def category_present(db: AsyncSession, category_id: int) -> bool:
    return (
        await db.scalar(select(Category.id).where(Category.id == category_id))
        is not None
    )


async def _locked_references(
    db: AsyncSession, pack_id: int
) -> tuple[set[bytes], set[str]] | None:
    pack = await db.get(CursorPack, pack_id, with_for_update=True)
    state = await db.get(AdminPackState, pack_id, with_for_update=True)
    if pack is None or state is None:
        return None
    snapshot = await capture(db, pack, state)
    bindings = {
        asset for role in snapshot.roles for asset in (role.asset_id, role.preview_id)
    }
    if snapshot.thumbnail_id is not None:
        bindings.add(snapshot.thumbnail_id)
    projected = {pack.thumbnail_url}
    for item in await db.scalars(
        select(CursorItem).where(CursorItem.pack_id == pack_id)
    ):
        projected.update((item.preview_png_url, item.cursor_file_url))
    return bindings, projected


def _projected(key: str, urls: set[str]) -> bool:
    return any(url.endswith("/" + key) for url in urls)


async def cleanup_pack_assets(
    db: AsyncSession, store: PrivateAssets, pack_id: int, *, request_id: str
) -> int:
    """Reclaim old unbound registry assets and retry deletion of old orphan objects."""
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    async with db.begin():
        refs = await _locked_references(db, pack_id)
        if refs is None:
            raise ValueError("Pack is not managed")
        bindings, projected = refs
        stale = await db.scalars(
            select(AdminAsset).where(
                AdminAsset.pack_id == pack_id,
                AdminAsset.created_at <= cutoff.replace(tzinfo=None),
            )
        )
        for asset in stale:
            if (
                asset.id not in bindings
                and asset.storage_key
                == asset_key(pack_id, UUID(bytes=asset.id), asset.kind)
                and not _projected(asset.storage_key, projected)
            ):
                await db.delete(asset)
    # Once registry removal commits, a new binding cannot reference those objects.
    # Existing objects are inventoried even if a previous cleanup crashed after commit.
    count = 0
    async for key, modified in store.inventory(pack_id):
        if modified > cutoff:
            continue
        async with db.begin():
            refs = await _locked_references(db, pack_id)
            if refs is None or _projected(key, refs[1]):
                continue
            if (
                await db.scalar(
                    select(AdminAsset.id).where(AdminAsset.storage_key == key)
                )
                is not None
            ):
                continue
            await store.delete(key)
            count += 1
    async with db.begin():
        db.add(
            AdminAuditEvent(
                action="asset_cleanup",
                target_type="cursor_pack",
                target_id=str(pack_id),
                outcome="success",
                request_id=request_id,
            )
        )
    return count
