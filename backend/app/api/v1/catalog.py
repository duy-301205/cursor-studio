"""Published-only catalog queries and HTTP routes."""

from __future__ import annotations

import logging
from asyncio import Semaphore
from collections.abc import AsyncIterator, Callable, Coroutine
from functools import lru_cache
from typing import Annotated
from uuid import uuid4

from anyio import to_thread
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRoute
from pydantic import ValidationError
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager
from sqlalchemy.sql.elements import ColumnElement
from starlette.types import Receive, Scope, Send

from app.api.deps.admin import AuthProblem
from app.api.deps.user_features import (
    PRIVATE_FEATURE_HEADERS,
    authorize_user_feature,
    feature_auth_required,
)
from app.core.config import Settings
from app.db.session import get_db
from app.models.category import Category
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack, PackStatus
from app.schemas.catalog import (
    CatalogError,
    CatalogQuery,
    CategoryEntry,
    CursorAsset,
    ErrorDetail,
    ErrorResponse,
    PackCard,
    PackCursor,
    PackDetail,
    PackPage,
    PackSummary,
    Pagination,
)
from app.services.admin_assets import ManagedAssetStorage, private_storage
from app.services.pack_publisher import (
    managed_prefix,
    published_asset,
    read_published_bytes,
)
from app.services.storage import (
    MAX_ASSET_BYTES,
    AssetNotFound,
    Storage,
    StorageError,
    create_storage,
)
from app.services.zip_packager import (
    AssetUnavailable,
    PackIncomplete,
    _asset_extension,
    _validate_ani,
    _validate_cur,
    build_pack_zip,
)

logger = logging.getLogger(__name__)
Session = Annotated[AsyncSession, Depends(get_db)]
_PUBLISHED = CursorPack.status == PackStatus.PUBLISHED
_POINTER = and_(
    CursorItem.pack_id == CursorPack.id, CursorItem.role_type == CursorRole.POINTER
)
_download_slots = Semaphore(2)


def _download_peer(request: Request) -> str:
    return request.client.host if request.client else "unknown"


_download_limiter = Limiter(key_func=_download_peer, key_style="endpoint")


class CatalogRoute(APIRoute):
    """Normalize errors and add a server-generated request ID to gallery responses."""

    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[object, object, Response]]:
        handler = super().get_route_handler()

        async def handle(request: Request) -> Response:
            request_id = f"req_{uuid4().hex}"
            request.state.request_id = request_id
            raw_cursor = self.path.endswith("/cursor.{ext}")
            protected = feature_auth_required() and (
                raw_cursor or self.path.endswith("/download")
            )
            try:
                if raw_cursor and not protected:
                    raise HTTPException(status_code=404)
                if protected:
                    await authorize_user_feature(request)
                response = await handler(request)
            except AuthProblem as exc:
                response = _error(
                    exc.status, exc.code, exc.message, request_id, exc.details
                )
            except RateLimitExceeded:
                response = _error(
                    429, "RATE_LIMITED", "Too many downloads.", request_id
                )
                response.headers["Retry-After"] = "60"
            except RequestValidationError as exc:
                details = [
                    ErrorDetail(
                        field=".".join(str(part) for part in error["loc"][1:]),
                        reason=error["msg"],
                    )
                    for error in exc.errors()
                ]
                response = _error(
                    422,
                    "VALIDATION_ERROR",
                    "Invalid request parameters.",
                    request_id,
                    details,
                )
            except HTTPException as exc:
                if exc.status_code != 404:
                    raise
                response = _error(404, "PACK_NOT_FOUND", "Pack not found.", request_id)
            except (SQLAlchemyError, OSError, RuntimeError, ValidationError):
                logger.error(
                    "Catalog request failed",
                    extra={
                        "request_id": request_id,
                        "route": self.path,
                        "error_code": "INTERNAL_ERROR",
                    },
                )
                response = _error(
                    500, "INTERNAL_ERROR", "Unable to load the catalog.", request_id
                )
            if protected or raw_cursor:
                response.headers.update(PRIVATE_FEATURE_HEADERS)
            response.headers["X-Request-ID"] = request_id
            return response

        return handle


def _error(
    status: int,
    code: str,
    message: str,
    request_id: str,
    details: list[ErrorDetail] | None = None,
) -> JSONResponse:
    error = CatalogError(
        code=code, message=message, details=details or [], request_id=request_id
    )
    return JSONResponse(
        ErrorResponse(error=error).model_dump(mode="json"),
        status_code=status,
        headers={"Cache-Control": "no-store"},
    )


router = APIRouter(
    prefix="/api/v1",
    tags=["catalog"],
    route_class=CatalogRoute,
    responses={500: {"model": ErrorResponse}},
)


def _public_cursor(item: CursorItem) -> CursorAsset:
    cursor = CursorAsset.model_validate(item)
    if feature_auth_required():
        suffix = _asset_extension(item.cursor_file_url)
        cursor.cursor_file_url = f"/api/v1/packs/{item.pack_id}/assets/{item.role_type.value}/cursor.{suffix}"
    return cursor


@router.get("/categories")
async def categories(response: Response, session: Session) -> list[CategoryEntry]:
    counts = (
        select(CursorPack.category_id, func.count().label("pack_count"))
        .where(_PUBLISHED)
        .group_by(CursorPack.category_id)
        .subquery()
    )
    rows = await session.execute(
        select(
            Category.id,
            Category.name,
            Category.slug,
            Category.sort_order,
            func.coalesce(counts.c.pack_count, 0).label("pack_count"),
        )
        .outerjoin(counts, counts.c.category_id == Category.id)
        .order_by(Category.sort_order, Category.id)
    )
    response.headers["Cache-Control"] = "public, max-age=60"
    return [CategoryEntry.model_validate(row) for row in rows]


@router.get("/packs", responses={422: {"model": ErrorResponse}})
async def packs(
    request: Request,
    response: Response,
    session: Session,
    query: Annotated[CatalogQuery, Query()],
) -> PackPage:
    filters: list[ColumnElement[bool]] = [_PUBLISHED]
    if query.category:
        filters.append(Category.slug == query.category)
    if query.q:
        filters.append(
            or_(
                CursorPack.title.icontains(query.q, autoescape=True),
                CursorPack.slug.icontains(query.q, autoescape=True),
                CursorPack.description.icontains(query.q, autoescape=True),
            )
        )

    counts = (
        select(func.count(CursorPack.id), func.count(CursorItem.id))
        .select_from(CursorPack)
        .join(Category, CursorPack.category_id == Category.id)
        .outerjoin(CursorItem, _POINTER)
        .where(*filters)
    )
    matching, total = (await session.execute(counts)).one()
    if matching != total:
        logger.warning(
            "Published packs without a pointer were excluded",
            extra={
                "request_id": request.state.request_id,
                "route": "/api/v1/packs",
                "missing_pointer_count": matching - total,
            },
        )

    offset = (query.page - 1) * query.limit
    items: list[PackCard] = []
    if offset < total:
        primary_sort = (
            CursorPack.download_count
            if query.sort == "popular"
            else CursorPack.created_at
        )
        rows = await session.execute(
            select(CursorPack, CursorItem)
            .select_from(CursorPack)
            .join(Category, CursorPack.category_id == Category.id)
            .join(CursorItem, _POINTER)
            .options(contains_eager(CursorPack.category))
            .where(*filters)
            .order_by(primary_sort.desc(), CursorPack.id.desc())
            .limit(query.limit)
            .offset(offset)
        )
        items = [
            PackCard.model_validate(
                {
                    "pointer": _public_cursor(pointer),
                    **PackSummary.model_validate(pack).model_dump(),
                }
            )
            for pack, pointer in rows
        ]
    total_pages = (total + query.limit - 1) // query.limit
    response.headers["Cache-Control"] = "public, max-age=30"
    return PackPage(
        items=items,
        pagination=Pagination(
            page=query.page,
            limit=query.limit,
            total=total,
            total_pages=total_pages,
            has_next=query.page < total_pages,
        ),
    )


@router.get("/packs/{slug}", responses={404: {"model": ErrorResponse}})
async def pack_detail(slug: str, response: Response, session: Session) -> PackDetail:
    pack = await session.scalar(
        select(CursorPack)
        .join(CursorPack.category)
        .options(contains_eager(CursorPack.category))
        .where(_PUBLISHED, CursorPack.slug == slug)
    )
    if pack is None:
        raise HTTPException(status_code=404)
    items = (
        await session.scalars(
            select(CursorItem)
            .where(CursorItem.pack_id == pack.id)
            .order_by(CursorItem.role_type)
        )
    ).all()
    if len(items) != len(CursorRole):
        raise RuntimeError("Published pack does not have every cursor role")
    response.headers["Cache-Control"] = "public, max-age=60"
    return PackDetail.model_validate(
        {
            **PackSummary.model_validate(pack).model_dump(),
            "updated_at": pack.updated_at,
            "cursor_items": [
                PackCursor(id=item.id, **_public_cursor(item).model_dump())
                for item in items
            ],
        }
    )


@lru_cache(maxsize=1)
def _download_settings() -> Settings:
    return Settings.model_validate({})


@lru_cache(maxsize=2)
def _download_storage(managed: bool) -> Storage:
    settings = _download_settings()
    if managed:
        return ManagedAssetStorage(private_storage(settings), managed_prefix(settings))
    return create_storage(settings)


def _storage_for_urls(urls: dict[str, str]) -> Storage:
    prefix = managed_prefix(_download_settings()) + "managed/"
    return _download_storage(any(url.startswith(prefix) for url in urls.values()))


async def _zip_chunks(data: bytes) -> AsyncIterator[bytes]:
    chunk_size = 64 * 1024
    for start in range(0, len(data), chunk_size):
        yield data[start : start + chunk_size]


class _DownloadResponse(StreamingResponse):
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            _download_slots.release()


@router.get(
    "/packs/{id}/download",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {
                "application/zip": {"schema": {"type": "string", "format": "binary"}}
            }
        },
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
@_download_limiter.limit("30/minute")
async def download_pack(
    id: Annotated[int, Path(gt=0, le=(1 << 64) - 1)],
    request: Request,
    session: Session,
) -> Response:
    await _download_slots.acquire()
    handing_off = False
    try:
        pack = (
            await session.execute(
                select(CursorPack.title, CursorPack.slug).where(
                    CursorPack.id == id, _PUBLISHED
                )
            )
        ).one_or_none()
        if pack is None:
            raise HTTPException(status_code=404)

        rows = await session.execute(
            select(CursorItem.role_type, CursorItem.cursor_file_url).where(
                CursorItem.pack_id == id
            )
        )
        urls = {role.value: url for role, url in rows.tuples()}
        # Return the DB connection before fetching assets or compressing the archive.
        await session.rollback()
        request_id = request.state.request_id
        try:
            storage = await to_thread.run_sync(_storage_for_urls, urls)
            filename, binary = await build_pack_zip(
                pack.title, pack.slug, urls, storage
            )
        except PackIncomplete:
            return _error(
                409, "PACK_INCOMPLETE", "Pack is missing cursor roles.", request_id
            )
        except (AssetUnavailable, StorageError):
            return _error(
                502, "ASSET_UNAVAILABLE", "Pack assets are unavailable.", request_id
            )

        async with session.begin():
            connection = await session.connection()
            result = await connection.execute(
                update(CursorPack)
                .where(CursorPack.id == id, _PUBLISHED)
                .values(download_count=CursorPack.download_count + 1)
            )
            if result.rowcount != 1:
                raise HTTPException(status_code=404)

        response = _DownloadResponse(
            _zip_chunks(binary),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(binary)),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
        handing_off = True
        return response
    finally:
        if not handing_off:
            _download_slots.release()


@router.api_route(
    "/packs/{id}/assets/{role}/cursor.{ext}",
    methods=["GET", "HEAD"],
    include_in_schema=False,
)
@_download_limiter.limit("30/minute")
async def download_cursor_asset(
    id: Annotated[int, Path(gt=0, le=(1 << 64) - 1)],
    role: CursorRole,
    ext: str,
    request: Request,
    session: Session,
) -> Response:
    url = await session.scalar(
        select(CursorItem.cursor_file_url)
        .join(CursorPack, CursorPack.id == CursorItem.pack_id)
        .where(CursorPack.id == id, _PUBLISHED, CursorItem.role_type == role)
    )
    if url is None or ext not in {"cur", "ani"}:
        raise HTTPException(status_code=404)
    try:
        if _asset_extension(url) != ext:
            raise HTTPException(status_code=404)
        settings = _download_settings()
        prefix = managed_prefix(settings)
        if url.startswith(prefix + "managed/"):
            asset = await published_asset(session, id, url[len(prefix) :], url)
            if asset is None:
                raise HTTPException(status_code=404)
            # The session is rolled back before storage I/O. Keep the immutable row.
            session.expunge(asset)
            await session.rollback()
            binary = await read_published_bytes(private_storage(settings), asset)
        else:
            await session.rollback()
            storage = await to_thread.run_sync(_download_storage, False)
            binary = await storage.read_asset(url, max_bytes=MAX_ASSET_BYTES)
        await to_thread.run_sync(
            _validate_cur if ext == "cur" else _validate_ani, binary
        )
    except AssetNotFound:
        raise HTTPException(status_code=404) from None
    except (AssetUnavailable, StorageError):
        return _error(
            502,
            "ASSET_UNAVAILABLE",
            "Cursor asset is unavailable.",
            request.state.request_id,
        )
    return Response(
        binary if request.method == "GET" else None,
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(len(binary)),
            "Content-Disposition": f'attachment; filename="{role.value}.{ext}"',
        },
    )
