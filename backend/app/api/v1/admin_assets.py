"""Authenticated upload and reading for private pack assets."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from hashlib import sha256
from math import ceil
from os import environ
from uuid import UUID, uuid4

from anyio import CancelScope, CapacityLimiter, WouldBlock
from fastapi import APIRouter, Request, Response
from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import parse_options_header
from sqlalchemy import func, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.requests import ClientDisconnect

from app.api.deps.admin import (
    ADMIN_PREFIX,
    AdminDatabase,
    AdminDependency,
    AuthProblem,
    AuthRoute,
)
from app.api.v1.admin_packs import _asset_view, _audit, _if_match, _pack_id
from app.core.admin_auth import utc_now
from app.core.config import Settings
from app.models.admin_user import AdminAsset, AdminPackState, AdminRateLimit, AssetKind
from app.models.cursor_pack import CursorPack, PackStatus
from app.schemas.admin_pack import PackAsset
from app.services.admin_assets import (
    ANI_MIME_TYPE,
    MAX_UPLOAD_BYTES,
    AssetKeyExists,
    InvalidAsset,
    PrivateAssets,
    asset_key,
    private_storage,
    validate_asset,
)
from app.services.storage import StorageError

_MAX_MULTIPART = MAX_UPLOAD_BYTES + 32 * 1024
_MAX_ASSETS = 128
_UPLOADS = CapacityLimiter(4)
logger = logging.getLogger(__name__)
router = APIRouter(prefix=ADMIN_PREFIX, include_in_schema=False, route_class=AuthRoute)


class UploadTooLarge(MultiPartException):
    pass


class MemoryMultipart(MultiPartParser):
    spool_max_size = _MAX_MULTIPART


def _too_large() -> AuthProblem:
    return AuthProblem(413, "PAYLOAD_TOO_LARGE", "File exceeds the upload byte budget.")


async def _multipart(request: Request) -> tuple[AssetKind, bytes]:
    media, options = parse_options_header(request.headers.get("content-type", ""))
    if media.lower() != b"multipart/form-data":
        raise AuthProblem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected a multipart upload.")
    boundary = options.get(b"boundary", b"")
    if not 1 <= len(boundary) <= 70 or any(
        byte < 32 or byte >= 127 for byte in boundary
    ):
        raise AuthProblem(422, "VALIDATION_ERROR", "Invalid multipart boundary.")
    length = request.headers.get("content-length", "")
    if (
        length.isascii()
        and length.isdecimal()
        and (len(length) > 10 or int(length) > _MAX_MULTIPART)
    ):
        raise _too_large()
    ending = b"\r\n--" + boundary + b"--"
    tail_size = len(ending) + 2
    total = 0
    tail = b""

    async def stream() -> AsyncGenerator[bytes, None]:
        nonlocal total, tail
        async for chunk in request.stream():
            total += len(chunk)
            if total > _MAX_MULTIPART:
                raise UploadTooLarge("Multipart body exceeds its budget")
            tail = (tail + chunk[-tail_size:])[-tail_size:]
            yield chunk

    parser = MemoryMultipart(
        request.headers, stream(), max_files=1, max_fields=1, max_part_size=32
    )
    try:
        form = await parser.parse()
    except UploadTooLarge:
        raise _too_large() from None
    except (MultiPartException, MultipartParseError, ClientDisconnect, ValueError):
        raise AuthProblem(
            422, "VALIDATION_ERROR", "Invalid multipart upload."
        ) from None
    try:
        file, kind = form.get("file"), form.get("kind")
        if (
            not tail.endswith((ending, ending + b"\r\n"))
            or set(form) != {"file", "kind"}
            or len(form.multi_items()) != 2
            or not isinstance(file, UploadFile)
            or not isinstance(kind, str)
        ):
            raise AuthProblem(
                422, "VALIDATION_ERROR", "Expected one file and one asset kind."
            )
        try:
            asset_kind = AssetKind(kind)
        except ValueError:
            raise AuthProblem(422, "VALIDATION_ERROR", "Invalid asset kind.") from None
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES or total - len(data) > 32 * 1024:
            raise _too_large()
        return asset_kind, data
    finally:
        await form.close()


async def _upload_limit(db: AsyncSession, admin_id: int) -> None:
    now = utc_now()
    window = now.replace(second=0, microsecond=0)
    expires = window + timedelta(minutes=1)
    subject = sha256(f"admin-upload:{admin_id}".encode()).digest()
    async with db.begin():
        statement = insert(AdminRateLimit).values(
            scope="admin_upload",
            subject_hash=subject,
            window_start=window,
            counter=0,
            expires_at=expires,
        )
        await db.execute(
            statement.on_duplicate_key_update(counter=AdminRateLimit.counter)
        )
        record = await db.get(
            AdminRateLimit, ("admin_upload", subject, window), with_for_update=True
        )
        if record is None:
            raise RuntimeError("Admin upload counter missing")
        if record.counter >= 20:
            raise AuthProblem(
                429,
                "RATE_LIMITED",
                "Too many asset uploads.",
                retry_after=max(1, ceil((expires - utc_now()).total_seconds())),
            )
        record.counter += 1


@asynccontextmanager
async def _upload_slot() -> AsyncIterator[None]:
    try:
        _UPLOADS.acquire_nowait()
    except WouldBlock:
        raise AuthProblem(
            429, "RATE_LIMITED", "Asset upload capacity is busy.", retry_after=1
        ) from None
    try:
        yield
    finally:
        _UPLOADS.release()


async def _check_pack(
    db: AsyncSession, request: Request, pack_id: int, *, lock: bool
) -> None:
    pack = await db.get(CursorPack, pack_id, with_for_update=lock)
    if pack is None:
        raise AuthProblem(404, "NOT_FOUND", "Pack not found.")
    state = await db.get(AdminPackState, pack_id, with_for_update=lock)
    if state is None or pack.status != PackStatus.DRAFT:
        raise AuthProblem(
            409, "PACK_LOCKED", "Only Admin-managed draft packs can accept uploads."
        )
    _if_match(request, pack_id, state.revision)
    count = await db.scalar(
        select(func.count())
        .select_from(AdminAsset)
        .where(AdminAsset.pack_id == pack_id)
    )
    if count is not None and count >= _MAX_ASSETS:
        raise AuthProblem(
            409, "ASSET_QUOTA_EXCEEDED", "The pack has reached its asset limit."
        )


async def _discard_unregistered(
    db: AsyncSession, store: PrivateAssets, key: str, request_id: str
) -> None:
    # A commit can succeed even if its acknowledgement is lost. Preserve registered objects.
    with CancelScope(shield=True):
        try:
            async with db.begin():
                registered = await db.scalar(
                    select(AdminAsset.id).where(AdminAsset.storage_key == key)
                )
            if registered is None:
                await store.delete(key)
        except (StorageError, SQLAlchemyError, RuntimeError):
            logger.warning(
                "Private asset needs reconciliation",
                extra={"request_id": request_id, "storage_key": key},
            )


async def _save(
    db: AsyncSession,
    request: Request,
    pack_id: int,
    admin_id: int,
    kind: AssetKind,
    data: bytes,
) -> PackAsset:
    async with db.begin():
        await _check_pack(db, request, pack_id, lock=False)
    try:
        asset = await validate_asset(
            kind, data, allow_ani=environ.get("ADMIN_ANI_UPLOAD_ENABLED") == "true"
        )
    except InvalidAsset as exc:
        raise AuthProblem(415, "UNSUPPORTED_MEDIA_TYPE", str(exc)) from None

    asset_id = uuid4()
    key = asset_key(pack_id, asset_id, kind, mime_type=asset.mime_type)
    store = private_storage(Settings.model_validate({}))
    attempted = False
    try:
        async with db.begin():
            await _check_pack(db, request, pack_id, lock=True)
            row = AdminAsset(
                id=asset_id.bytes,
                pack_id=pack_id,
                kind=kind,
                storage_key=key,
                mime_type=asset.mime_type,
                byte_size=len(asset.data),
                sha256=sha256(asset.data).digest(),
                width=asset.width,
                height=asset.height,
                hotspot_x=asset.hotspot_x,
                hotspot_y=asset.hotspot_y,
                created_by_admin_id=admin_id,
            )
            db.add(row)
            _audit(db, request, admin_id, "asset_upload", "success", pack_id)
            await db.flush()
            attempted = True
            await store.put(key, asset)
            view = _asset_view(row)
        return view
    except AssetKeyExists:
        raise AuthProblem(
            409, "ASSET_KEY_CONFLICT", "The generated asset key already exists."
        ) from None
    except BaseException:
        if attempted:
            await _discard_unregistered(db, store, key, request.state.admin_request_id)
        raise


@router.post("/packs/{id}/assets", status_code=201)
async def upload_asset(
    id: str, request: Request, identity: AdminDependency, db: AdminDatabase
) -> PackAsset:
    pack_id = _pack_id(id)
    admin_id = identity.admin.id
    await _upload_limit(db, admin_id)
    async with _upload_slot():
        try:
            kind, data = await _multipart(request)
            return await _save(db, request, pack_id, admin_id, kind, data)
        except (AuthProblem, StorageError, SQLAlchemyError) as exc:
            async with db.begin():
                _audit(db, request, admin_id, "asset_upload", "failure", pack_id)
            if isinstance(exc, StorageError):
                raise AuthProblem(
                    503, "STORAGE_UNAVAILABLE", "Private asset storage is unavailable."
                ) from None
            raise


@router.get("/packs/{id}/assets/{asset_id}/content")
async def read_asset(
    id: str, asset_id: str, identity: AdminDependency, db: AdminDatabase
) -> Response:
    pack_id = _pack_id(id)
    try:
        parsed = UUID(asset_id)
        if str(parsed) != asset_id:
            raise ValueError("Noncanonical asset ID")
    except ValueError:
        raise AuthProblem(404, "NOT_FOUND", "Asset not found.") from None

    async with db.begin():
        row = await db.scalar(
            select(AdminAsset).where(
                AdminAsset.id == parsed.bytes, AdminAsset.pack_id == pack_id
            )
        )
    if row is None:
        raise AuthProblem(404, "NOT_FOUND", "Asset not found.")
    if row.kind == AssetKind.CURSOR:
        if row.mime_type != ANI_MIME_TYPE:
            raise AuthProblem(404, "NOT_FOUND", "Asset not found.")
        media = ANI_MIME_TYPE
    else:
        media = "image/png" if row.kind == AssetKind.PREVIEW else "image/webp"
    try:
        if row.mime_type != media or row.storage_key != asset_key(
            pack_id, parsed, row.kind, mime_type=media
        ):
            raise StorageError("Registry asset metadata mismatch")
        store = private_storage(Settings.model_validate({}))
        if not 0 < row.byte_size <= MAX_UPLOAD_BYTES:
            raise StorageError("Registry asset size outside budget")
        data = await store.read(row.storage_key, max_bytes=row.byte_size)
        if len(data) != row.byte_size or sha256(data).digest() != row.sha256:
            raise StorageError("Registry asset digest mismatch")
    except StorageError:
        raise AuthProblem(
            503, "STORAGE_UNAVAILABLE", "Private asset storage is unavailable."
        ) from None
    headers = (
        {"Content-Disposition": 'attachment; filename="cursor.ani"'}
        if media == ANI_MIME_TYPE
        else None
    )
    return Response(content=data, media_type=media, headers=headers)
