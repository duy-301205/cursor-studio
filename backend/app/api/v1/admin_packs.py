"""Authenticated CRUD for Admin-managed cursor pack metadata."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from hashlib import sha256
from math import ceil
from os import environ
from uuid import UUID

from fastapi import APIRouter, Request, Response
from pydantic import AnyHttpUrl, BaseModel, TypeAdapter, ValidationError
from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import ClientDisconnect

from app.api.deps.admin import (
    ADMIN_PREFIX,
    AdminDatabase,
    AdminDependency,
    AuthProblem,
    AuthRoute,
)
from app.core.admin_auth import utc_now
from app.core.config import Settings
from app.models.admin_user import (
    AdminAsset,
    AdminAuditEvent,
    AdminPackRole,
    AdminPackState,
    AdminRateLimit,
    AssetKind,
)
from app.models.category import Category
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack, PackStatus
from app.schemas.admin_pack import (
    MAX_SAFE_ID,
    PackAsset,
    PackDetail,
    PackMetadata,
    PackPage,
    PackPagination,
    PackPatch,
    PackQuery,
    PackRole,
    PackSummary,
    RoleAssignment,
)
from app.schemas.catalog import ErrorDetail
from app.services.admin_assets import ANI_MIME_TYPE, InvalidAsset, private_storage
from app.services.pack_publisher import (
    Report,
    Snapshot,
    Validation,
    ValidationBusy,
    capture,
    category_present,
    publish_projection,
    registered_assets,
    validate_snapshot,
)
from app.services.pack_validator import (
    find_asset,
    validate_role_assets,
    verify_registered_asset,
)
from app.services.storage import StorageError

_BODY_LIMIT = 16 * 1024
_ETAG = re.compile(r'"pack-[1-9][0-9]{0,15}-r[1-9][0-9]{0,19}"')
_ID = re.compile(r"[1-9][0-9]{0,15}")
_URL = TypeAdapter(AnyHttpUrl)
_ROLE_ORDER = {role: index for index, role in enumerate(CursorRole)}

router = APIRouter(prefix=ADMIN_PREFIX, include_in_schema=False, route_class=AuthRoute)


def _pack_id(raw: str) -> int:
    if _ID.fullmatch(raw) is None or int(raw) > MAX_SAFE_ID:
        raise AuthProblem(422, "VALIDATION_ERROR", "Invalid pack ID.")
    return int(raw)


def _placeholder() -> str:
    try:
        url = _URL.validate_python(environ.get("ADMIN_DRAFT_THUMBNAIL_URL", ""))
    except ValidationError:
        raise AuthProblem(
            503, "STORAGE_UNAVAILABLE", "Draft thumbnail is not configured."
        ) from None
    value = str(url)
    if (
        url.scheme != "https"
        or url.username is not None
        or url.password is not None
        or url.fragment is not None
        or url.query is not None
        or len(value) > 1024
    ):
        raise AuthProblem(
            503, "STORAGE_UNAVAILABLE", "Draft thumbnail is not configured."
        )
    return value


async def _read_json[Model: BaseModel](request: Request, schema: type[Model]) -> Model:
    media_type = (
        request.headers.get("content-type", "").partition(";")[0].strip().lower()
    )
    if media_type != "application/json":
        raise AuthProblem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected a JSON body.")
    body = bytearray()
    try:
        async for chunk in request.stream():
            if len(body) + len(chunk) > _BODY_LIMIT:
                raise AuthProblem(
                    413, "PAYLOAD_TOO_LARGE", "Metadata body exceeds 16 KiB."
                )
            body.extend(chunk)
        return schema.model_validate_json(body)
    except (ClientDisconnect, ValidationError):
        raise AuthProblem(422, "VALIDATION_ERROR", "Invalid pack metadata.") from None


def _summary(pack: CursorPack, revision: int | None, is_animated: bool) -> PackSummary:
    if not (1 <= pack.id <= MAX_SAFE_ID and 1 <= pack.category_id <= MAX_SAFE_ID):
        raise AuthProblem(
            503, "ID_OUT_OF_RANGE", "Pack or category ID exceeds the supported range."
        )
    return PackSummary(
        id=pack.id,
        category_id=pack.category_id,
        title=pack.title,
        slug=pack.slug,
        description=pack.description,
        is_premium=pack.is_premium,
        is_animated=is_animated,
        status=pack.status,
        managed=revision is not None,
        revision=revision,
        created_at=pack.created_at,
        updated_at=pack.updated_at,
    )


def _asset_url(pack_id: int, asset_id: UUID) -> str:
    return f"{ADMIN_PREFIX}/packs/{pack_id}/assets/{asset_id}/content"


def _asset_view(asset: AdminAsset) -> PackAsset:
    asset_id = UUID(bytes=asset.id)
    return PackAsset(
        asset_id=asset_id,
        kind=asset.kind,
        mime_type=asset.mime_type,
        byte_size=asset.byte_size,
        sha256=asset.sha256.hex(),
        width=asset.width,
        height=asset.height,
        hotspot_x=asset.hotspot_x,
        hotspot_y=asset.hotspot_y,
        content_url=_asset_url(asset.pack_id, asset_id)
        if asset.kind != AssetKind.CURSOR
        else None,
    )


async def _detail(
    db: AsyncSession, pack: CursorPack, state: AdminPackState | None
) -> PackDetail:
    is_animated = pack.is_animated
    thumbnail = None
    thumbnail_url: str | None
    assets: list[PackAsset] = []
    if state is None:
        items = await db.scalars(
            select(CursorItem).where(CursorItem.pack_id == pack.id)
        )
        roles = [
            PackRole(
                role_type=item.role_type,
                asset_id=None,
                preview_asset_id=None,
                hotspot_x=item.hotspot_x,
                hotspot_y=item.hotspot_y,
                preview_url=item.preview_png_url,
            )
            for item in items
        ]
        thumbnail_url = pack.thumbnail_url
    else:
        registered = await db.scalars(
            select(AdminAsset)
            .where(AdminAsset.pack_id == pack.id)
            .order_by(AdminAsset.created_at.desc(), AdminAsset.id)
        )
        asset_views = {asset.id: _asset_view(asset) for asset in registered}
        assets = list(asset_views.values())
        if state.thumbnail_asset_id is not None:
            thumbnail = asset_views.get(state.thumbnail_asset_id)
        thumbnail_url = thumbnail.content_url if thumbnail is not None else None
        bindings = (
            await db.scalars(
                select(AdminPackRole).where(AdminPackRole.pack_id == pack.id)
            )
        ).all()
        if pack.status == PackStatus.DRAFT:
            is_animated = any(
                (cursor := asset_views.get(binding.asset_id)) is not None
                and cursor.kind == AssetKind.CURSOR
                and cursor.mime_type == ANI_MIME_TYPE
                for binding in bindings
            )
        roles = [
            PackRole(
                role_type=binding.role_type,
                asset_id=UUID(bytes=binding.asset_id),
                preview_asset_id=UUID(bytes=binding.preview_asset_id),
                hotspot_x=binding.hotspot_x,
                hotspot_y=binding.hotspot_y,
                preview_url=_asset_url(pack.id, UUID(bytes=binding.preview_asset_id)),
            )
            for binding in bindings
        ]
    roles.sort(key=lambda role: _ROLE_ORDER[role.role_type])
    summary = _summary(pack, state.revision if state is not None else None, is_animated)
    return PackDetail(
        **summary.model_dump(),
        thumbnail=thumbnail,
        thumbnail_url=thumbnail_url,
        roles=roles,
        assets=assets,
    )


def _etag(pack_id: int, revision: int) -> str:
    return f'"pack-{pack_id}-r{revision}"'


def _if_match(request: Request, pack_id: int, revision: int) -> None:
    values = request.headers.getlist("if-match")
    if not values:
        raise AuthProblem(428, "PRECONDITION_REQUIRED", "If-Match is required.")
    if len(values) != 1 or _ETAG.fullmatch(values[0]) is None:
        raise AuthProblem(422, "VALIDATION_ERROR", "Invalid If-Match header.")
    if values[0] != _etag(pack_id, revision):
        raise AuthProblem(
            409, "REVISION_CONFLICT", "The pack has changed. Reload it and try again."
        )


async def _locked_draft(
    db: AsyncSession, request: Request, pack_id: int
) -> tuple[CursorPack, AdminPackState]:
    pack = await db.get(CursorPack, pack_id, with_for_update=True)
    if pack is None:
        raise AuthProblem(404, "NOT_FOUND", "Pack not found.")
    state = await db.get(AdminPackState, pack_id, with_for_update=True)
    if state is None or pack.status != PackStatus.DRAFT:
        raise AuthProblem(
            409, "PACK_LOCKED", "Only Admin-managed draft packs can be edited."
        )
    _if_match(request, pack_id, state.revision)
    return pack, state


async def _require_asset(db: AsyncSession, pack_id: int, asset_id: UUID) -> AdminAsset:
    asset = await find_asset(db, pack_id, asset_id)
    if asset is None:
        raise AuthProblem(404, "NOT_FOUND", "Asset not found.")
    return asset


@asynccontextmanager
async def _asset_validation() -> AsyncIterator[None]:
    try:
        yield
    except InvalidAsset as exc:
        raise AuthProblem(422, "VALIDATION_ERROR", str(exc)) from None
    except StorageError:
        raise AuthProblem(
            503, "STORAGE_UNAVAILABLE", "Private asset storage is unavailable."
        ) from None


async def _category_exists(db: AsyncSession, category_id: int) -> None:
    category = await db.scalar(
        select(Category.id).where(Category.id == category_id).with_for_update(read=True)
    )
    if category is None:
        raise AuthProblem(422, "VALIDATION_ERROR", "Category does not exist.")


async def _write_limit(
    db: AsyncSession, subject_id: int, *, pack_validation: bool = False
) -> None:
    now = utc_now()
    window = now.replace(second=0, microsecond=0)
    expiry = window + timedelta(minutes=1)
    scope = "pack_validate" if pack_validation else "admin_mutation"
    limit = 5 if pack_validation else 60
    namespace = "pack-validate" if pack_validation else "admin-mutation"
    subject = sha256(f"{namespace}:{subject_id}".encode()).digest()
    async with db.begin():
        statement = insert(AdminRateLimit).values(
            scope=scope,
            subject_hash=subject,
            window_start=window,
            counter=0,
            expires_at=expiry,
        )
        await db.execute(
            statement.on_duplicate_key_update(counter=AdminRateLimit.counter)
        )
        record = await db.get(
            AdminRateLimit, (scope, subject, window), with_for_update=True
        )
        if record is None:
            raise RuntimeError("Admin mutation counter missing")
        if record.counter >= limit:
            raise AuthProblem(
                429,
                "RATE_LIMITED",
                "Too many admin mutations.",
                retry_after=max(1, ceil((expiry - utc_now()).total_seconds())),
            )
        record.counter += 1


def _audit(
    db: AsyncSession,
    request: Request,
    admin_id: int,
    action: str,
    outcome: str,
    pack_id: int | None,
) -> None:
    db.add(
        AdminAuditEvent(
            actor_admin_id=admin_id,
            action=action,
            target_type="cursor_pack",
            target_id=str(pack_id) if pack_id is not None else None,
            outcome=outcome,
            request_id=request.state.admin_request_id,
        )
    )


@asynccontextmanager
async def _mutation(
    db: AsyncSession,
    request: Request,
    admin_id: int,
    action: str,
    pack_id: int | None = None,
) -> AsyncIterator[None]:
    await _write_limit(db, admin_id)
    try:
        yield
    except IntegrityError as exc:
        if (
            exc.orig is None
            or exc.orig.args[:1] != (1062,)
            or "uq_cursor_packs_slug" not in str(exc.orig)
        ):
            raise
        async with db.begin():
            _audit(db, request, admin_id, action, "failure", pack_id)
        raise AuthProblem(
            409, "SLUG_CONFLICT", "A pack already uses this slug."
        ) from None
    except AuthProblem:
        async with db.begin():
            _audit(db, request, admin_id, action, "failure", pack_id)
        raise


@router.get("/packs")
async def list_packs(
    request: Request, identity: AdminDependency, db: AdminDatabase
) -> PackPage:
    try:
        query = PackQuery.model_validate(dict(request.query_params))
    except ValidationError:
        raise AuthProblem(422, "VALIDATION_ERROR", "Invalid pack filters.") from None
    filters = []
    if query.status is not None:
        filters.append(CursorPack.status == query.status)
    if query.q:
        filters.append(
            or_(
                CursorPack.title.contains(query.q, autoescape=True),
                CursorPack.slug.contains(query.q, autoescape=True),
            )
        )
    draft_has_ani = (
        select(AdminPackRole.asset_id)
        .join(AdminAsset, AdminAsset.id == AdminPackRole.asset_id)
        .where(
            AdminPackRole.pack_id == CursorPack.id,
            AdminAsset.pack_id == CursorPack.id,
            AdminAsset.kind == AssetKind.CURSOR,
            AdminAsset.mime_type == ANI_MIME_TYPE,
        )
        .correlate(CursorPack)
        .exists()
    )
    animated = case(
        (
            (CursorPack.status == PackStatus.DRAFT)
            & AdminPackState.pack_id.is_not(None),
            draft_has_ani,
        ),
        else_=CursorPack.is_animated,
    )
    async with db.begin():
        total = (
            await db.scalar(
                select(func.count()).select_from(CursorPack).where(*filters)
            )
            or 0
        )
        rows = (
            await db.execute(
                select(CursorPack, AdminPackState.revision, animated)
                .outerjoin(AdminPackState, AdminPackState.pack_id == CursorPack.id)
                .where(*filters)
                .order_by(CursorPack.created_at.desc(), CursorPack.id.desc())
                .offset((query.page - 1) * query.limit)
                .limit(query.limit)
            )
        ).all()
        pages = (total + query.limit - 1) // query.limit
        return PackPage(
            items=[
                _summary(pack, revision, bool(is_animated))
                for pack, revision, is_animated in rows
            ],
            pagination=PackPagination(
                page=query.page,
                limit=query.limit,
                total=total,
                total_pages=pages,
                has_next=query.page < pages,
            ),
        )


@router.post("/packs", status_code=201)
async def create_pack(
    request: Request, response: Response, identity: AdminDependency, db: AdminDatabase
) -> PackDetail:
    admin_id = identity.admin.id
    async with _mutation(db, request, admin_id, "pack_create"):
        data = await _read_json(request, PackMetadata)
        async with db.begin():
            await _category_exists(db, data.category_id)
            pack = CursorPack(
                **data.model_dump(),
                thumbnail_url=_placeholder(),
                status=PackStatus.DRAFT,
            )
            db.add(pack)
            await db.flush()
            if pack.id > MAX_SAFE_ID:
                raise AuthProblem(
                    503,
                    "ID_OUT_OF_RANGE",
                    "Pack ID allocation exceeds the supported range.",
                )
            state = AdminPackState(pack_id=pack.id, revision=1)
            db.add(state)
            _audit(db, request, admin_id, "pack_create", "success", pack.id)
            await db.refresh(pack)
            detail = await _detail(db, pack, state)
    response.headers["ETag"] = _etag(pack.id, state.revision)
    response.headers["Location"] = f"{ADMIN_PREFIX}/packs/{pack.id}"
    return detail


@router.get("/packs/{id}")
async def get_pack(
    id: str, response: Response, identity: AdminDependency, db: AdminDatabase
) -> PackDetail:
    pack_id = _pack_id(id)
    async with db.begin():
        pack = await db.get(CursorPack, pack_id)
        if pack is None:
            raise AuthProblem(404, "NOT_FOUND", "Pack not found.")
        state = await db.get(AdminPackState, pack_id)
        detail = await _detail(db, pack, state)
    if detail.revision is not None:
        response.headers["ETag"] = _etag(pack_id, detail.revision)
    return detail


@router.patch("/packs/{id}")
async def update_pack(
    id: str,
    request: Request,
    response: Response,
    identity: AdminDependency,
    db: AdminDatabase,
) -> PackDetail:
    admin_id = identity.admin.id
    pack_id = _pack_id(id)
    async with _mutation(db, request, admin_id, "pack_edit", pack_id):
        data = await _read_json(request, PackPatch)
        async with db.begin():
            pack, state = await _locked_draft(db, request, pack_id)
            thumbnail_changed = False
            if "thumbnail_asset_id" in data.model_fields_set:
                thumbnail_id = data.thumbnail_asset_id
                if thumbnail_id is not None:
                    asset = await _require_asset(db, pack_id, thumbnail_id)
                    async with _asset_validation():
                        store = private_storage(Settings.model_validate({}))
                        await verify_registered_asset(store, asset, AssetKind.THUMBNAIL)
                new_thumbnail = thumbnail_id.bytes if thumbnail_id is not None else None
                thumbnail_changed = state.thumbnail_asset_id != new_thumbnail
                state.thumbnail_asset_id = new_thumbnail
            changes = {
                field: value
                for field, value in data.model_dump(
                    exclude_unset=True, exclude={"thumbnail_asset_id"}
                ).items()
                if getattr(pack, field) != value
            }
            if data.category_id is not None and "category_id" in changes:
                await _category_exists(db, data.category_id)
            if "slug" in changes:
                projection = await db.scalar(
                    select(CursorItem.id).where(CursorItem.pack_id == pack_id).limit(1)
                )
                if projection is not None:
                    raise AuthProblem(
                        409, "PACK_LOCKED", "The slug is fixed after publication."
                    )
            if changes or thumbnail_changed:
                for field, value in changes.items():
                    setattr(pack, field, value)
                pack.updated_at = utc_now()
                state.revision += 1
                _audit(db, request, admin_id, "pack_edit", "success", pack_id)
                await db.flush()
                await db.refresh(pack)
            detail = await _detail(db, pack, state)
    response.headers["ETag"] = _etag(pack_id, state.revision)
    return detail


@router.put("/packs/{id}/roles/{role}")
async def assign_role(
    id: str,
    role: str,
    request: Request,
    response: Response,
    identity: AdminDependency,
    db: AdminDatabase,
) -> PackDetail:
    pack_id = _pack_id(id)
    admin_id = identity.admin.id
    async with _mutation(db, request, admin_id, "role_assign", pack_id):
        try:
            role_type = CursorRole(role)
        except ValueError:
            raise AuthProblem(422, "VALIDATION_ERROR", "Invalid cursor role.") from None
        data = await _read_json(request, RoleAssignment)
        async with db.begin():
            pack, state = await _locked_draft(db, request, pack_id)
            cursor = await _require_asset(db, pack_id, data.asset_id)
            preview = await _require_asset(db, pack_id, data.preview_asset_id)
            async with _asset_validation():
                store = private_storage(Settings.model_validate({}))
                await validate_role_assets(
                    store,
                    cursor,
                    preview,
                    data.hotspot_x,
                    data.hotspot_y,
                    allow_ani=environ.get("ADMIN_ANI_UPLOAD_ENABLED") == "true",
                )
            binding = await db.get(
                AdminPackRole, (pack_id, role_type), with_for_update=True
            )
            desired = (cursor.id, preview.id, data.hotspot_x, data.hotspot_y)
            if binding is None:
                db.add(
                    AdminPackRole(
                        pack_id=pack_id,
                        role_type=role_type,
                        asset_id=cursor.id,
                        preview_asset_id=preview.id,
                        hotspot_x=data.hotspot_x,
                        hotspot_y=data.hotspot_y,
                    )
                )
            elif (
                binding.asset_id,
                binding.preview_asset_id,
                binding.hotspot_x,
                binding.hotspot_y,
            ) == desired:
                response.headers["ETag"] = _etag(pack_id, state.revision)
                return await _detail(db, pack, state)
            else:
                (
                    binding.asset_id,
                    binding.preview_asset_id,
                    binding.hotspot_x,
                    binding.hotspot_y,
                ) = desired
            pack.updated_at = utc_now()
            state.revision += 1
            _audit(db, request, admin_id, "role_assign", "success", pack_id)
            await db.flush()
            detail = await _detail(db, pack, state)
    response.headers["ETag"] = _etag(pack_id, state.revision)
    return detail


async def _managed(
    db: AsyncSession, request: Request, pack_id: int, *, lock: bool
) -> tuple[CursorPack, AdminPackState]:
    pack = await db.get(
        CursorPack, pack_id, with_for_update=lock, populate_existing=lock
    )
    if pack is None:
        raise AuthProblem(404, "NOT_FOUND", "Pack not found.")
    state = await db.get(
        AdminPackState, pack_id, with_for_update=lock, populate_existing=lock
    )
    if state is None:
        raise AuthProblem(
            409, "PACK_LOCKED", "Only Admin-managed packs support this action."
        )
    _if_match(request, pack_id, state.revision)
    return pack, state


async def _run_validation(
    snapshot: Snapshot, assets: dict[bytes, AdminAsset], category_exists: bool
) -> Validation:
    try:
        return await validate_snapshot(
            snapshot, assets, category_exists, Settings.model_validate({})
        )
    except ValidationBusy:
        raise AuthProblem(
            429, "RATE_LIMITED", "Pack validation is busy.", retry_after=1
        ) from None
    except StorageError:
        raise AuthProblem(
            503, "STORAGE_UNAVAILABLE", "Private asset storage is unavailable."
        ) from None


@router.post("/packs/{id}/validate")
async def validate_pack(
    id: str, request: Request, identity: AdminDependency, db: AdminDatabase
) -> Report:
    pack_id = _pack_id(id)
    await _write_limit(db, pack_id, pack_validation=True)
    async with db.begin():
        pack, state = await _managed(db, request, pack_id, lock=False)
        snapshot = await capture(db, pack, state)
        assets = await registered_assets(db, snapshot)
        category_exists = await category_present(db, pack.category_id)
    result = await _run_validation(snapshot, assets, category_exists)
    return result.report


@router.post("/packs/{id}/publish")
async def publish_pack(
    id: str,
    request: Request,
    response: Response,
    identity: AdminDependency,
    db: AdminDatabase,
) -> PackDetail:
    pack_id = _pack_id(id)
    admin_id = identity.admin.id
    await _write_limit(db, pack_id, pack_validation=True)
    async with _mutation(db, request, admin_id, "pack_publish", pack_id):
        async with db.begin():
            pack, state = await _managed(db, request, pack_id, lock=False)
            if pack.status == PackStatus.PUBLISHED:
                response.headers["ETag"] = _etag(pack_id, state.revision)
                return await _detail(db, pack, state)
            snapshot = await capture(db, pack, state)
            assets = await registered_assets(db, snapshot)
            category_exists = await category_present(db, pack.category_id)
        result = await _run_validation(snapshot, assets, category_exists)
        if not result.report.valid:
            raise AuthProblem(
                422,
                "PACK_INVALID",
                "The pack did not pass publication checks.",
                details=[
                    ErrorDetail(field=issue.field, reason=issue.message)
                    for issue in result.report.errors
                ],
            )
        async with db.begin():
            pack, state = await _managed(db, request, pack_id, lock=True)
            if await capture(db, pack, state) != snapshot:
                raise AuthProblem(
                    409, "REVISION_CONFLICT", "The pack changed during validation."
                )
            await _category_exists(db, pack.category_id)
            await publish_projection(db, pack, result)
            pack.updated_at = utc_now()
            state.revision += 1
            _audit(db, request, admin_id, "pack_publish", "success", pack_id)
            await db.flush()
            detail = await _detail(db, pack, state)
    response.headers["ETag"] = _etag(pack_id, state.revision)
    return detail


@router.post("/packs/{id}/unpublish")
async def unpublish_pack(
    id: str,
    request: Request,
    response: Response,
    identity: AdminDependency,
    db: AdminDatabase,
) -> PackDetail:
    pack_id = _pack_id(id)
    admin_id = identity.admin.id
    async with _mutation(db, request, admin_id, "pack_unpublish", pack_id), db.begin():
        pack, state = await _managed(db, request, pack_id, lock=True)
        if pack.status != PackStatus.DRAFT:
            pack.status = PackStatus.DRAFT
            pack.updated_at = utc_now()
            state.revision += 1
            _audit(db, request, admin_id, "pack_unpublish", "success", pack_id)
            await db.flush()
        detail = await _detail(db, pack, state)
    response.headers["ETag"] = _etag(pack_id, state.revision)
    return detail
