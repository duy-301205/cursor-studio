"""FastAPI lifecycle and operational endpoints."""

from __future__ import annotations

import asyncio
import logging
import mimetypes
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from io import BytesIO
from struct import unpack
from typing import Annotated, Literal
from uuid import UUID

from anyio import CapacityLimiter, WouldBlock, to_thread
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Path, Request, Response
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from PIL import Image
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.staticfiles import StaticFiles
from starlette.types import Receive, Scope, Send

from app.api.deps.admin import AdminDatabase, AdminDependency, AuthRoute
from app.api.deps.user_features import feature_auth_required
from app.api.v1.admin_assets import router as admin_assets_router
from app.api.v1.admin_auth import router as admin_auth_router
from app.api.v1.admin_packs import router as admin_packs_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.studio import admin_tools_router
from app.api.v1.studio import router as studio_router
from app.api.v1.user_auth import router as user_auth_router
from app.core.config import Settings
from app.db.seed import SAMPLES_DIRECTORY, seed_development
from app.db.session import DatabaseState, database_lifespan, get_db
from app.models.admin_user import AdminAsset, AdminPackRole, AssetKind
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack, PackStatus
from app.schemas.admin_pack import MAX_SAFE_ID
from app.services.admin_assets import (
    ANI_MIME_TYPE,
    InvalidAsset,
    asset_key,
    private_storage,
)
from app.services.ani_validator import _chunks, validate_ani_cursor
from app.services.pack_publisher import (
    managed_prefix,
    published_asset,
    read_published_bytes,
)
from app.services.storage import AssetNotFound, StorageError

logger = logging.getLogger(__name__)


class AppState(DatabaseState):
    app_env: Literal["development", "production"]
    storage_backend: Literal["local", "r2"]


async def _wait_for_database(sessions: async_sessionmaker[AsyncSession]) -> None:
    for attempt in range(8):
        try:
            async with asyncio.timeout(5), sessions() as session:
                await session.execute(text("SELECT 1"))
            return
        except (SQLAlchemyError, OSError, TimeoutError):
            if attempt == 7:
                raise RuntimeError(
                    "Development database unavailable. Check DATABASE_* settings."
                ) from None
            await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[AppState]:
    settings = Settings.model_validate({})
    async with database_lifespan(application) as state:
        if settings.app_env == "development":
            await to_thread.run_sync(
                lambda: SAMPLES_DIRECTORY.mkdir(parents=True, exist_ok=True)
            )
            if settings.auto_seed:
                await _wait_for_database(state["db_sessions"])
                await seed_development(
                    state["db_sessions"], str(settings.public_api_base_url)
                )
                logger.info(
                    "Development sample catalog ready", extra={"event": "seed_ready"}
                )
        yield {
            "db_sessions": state["db_sessions"],
            "app_env": settings.app_env,
            "storage_backend": settings.storage_backend,
        }


app = FastAPI(
    title="Custom Cursor Studio & Library",
    lifespan=lifespan,
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
)
app.include_router(admin_auth_router)
app.include_router(admin_assets_router)
app.include_router(admin_packs_router)
app.include_router(catalog_router)
app.include_router(studio_router)
app.include_router(admin_tools_router)
app.include_router(user_auth_router)

mimetypes.add_type("image/webp", ".webp")
_sample_files = StaticFiles(directory=SAMPLES_DIRECTORY, check_dir=False)


def _public_sample_image(path: str) -> bool:
    relative = path.removeprefix("/static/samples/")
    if relative == path:
        return False
    try:
        root = SAMPLES_DIRECTORY.resolve()
        resolved = (root / relative).resolve()
    except (OSError, RuntimeError, ValueError):
        return False
    return resolved.is_relative_to(root) and resolved.suffix.lower() in {
        ".png",
        ".webp",
    }


async def _serve_samples(scope: Scope, receive: Receive, send: Send) -> None:
    if scope.get("state", {}).get("app_env") != "development":
        await Response(status_code=404)(scope, receive, send)
        return
    if feature_auth_required() and not await to_thread.run_sync(
        _public_sample_image, scope["path"]
    ):
        await Response(status_code=404, headers=_MEDIA_HEADERS)(scope, receive, send)
        return
    await _sample_files(scope, receive, send)


_MEDIA_HEADERS = {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
}
_MEDIA_TYPES = {
    "png": (AssetKind.PREVIEW, "image/png"),
    "webp": (AssetKind.THUMBNAIL, "image/webp"),
    "cur": (AssetKind.CURSOR, "application/octet-stream"),
    "ani": (AssetKind.CURSOR, ANI_MIME_TYPE),
}
_ANI_PREVIEWS = CapacityLimiter(2)
_admin_previews = APIRouter(
    prefix="/api/v1/admin", include_in_schema=False, route_class=AuthRoute
)


@lru_cache(maxsize=16)
def _animated_png(data: bytes) -> bytes:
    """Encode the validated playback sequence as a browser preview."""
    cursor = validate_ani_cursor(data)
    chunks = dict(_chunks(memoryview(data)[12:]))
    # A valid ANI has one frame list and can also include an INFO list.
    frame_list = next(
        chunk[4:]
        for tag, chunk in _chunks(memoryview(data)[12:])
        if tag == b"LIST" and bytes(chunk[:4]) == b"fram"
    )
    size = (cursor.width, cursor.height)
    end = 62 + cursor.width * cursor.height * 4
    frames = [
        Image.frombytes("RGBA", size, bytes(frame[62:end]), "raw", "BGRA", 0, -1)
        for _, frame in _chunks(frame_list)
    ]
    _, _, steps, _, _, _, _, default_rate, _ = unpack("<9I", chunks[b"anih"])
    sequence = (
        unpack(f"<{steps}I", chunks[b"seq "]) if b"seq " in chunks else range(steps)
    )
    rates = (
        unpack(f"<{steps}I", chunks[b"rate"])
        if b"rate" in chunks
        else (default_rate,) * steps
    )
    ordered = [frames[index] for index in sequence]
    with BytesIO() as output:
        ordered[0].save(
            output,
            format="PNG",
            save_all=True,
            append_images=ordered[1:],
            duration=[round(rate * 1000 / 60) for rate in rates],
            loop=0,
            disposal=0,
            blend=0,
        )
        return output.getvalue()


async def _animation_response(asset: AdminAsset, settings: Settings) -> Response:
    try:
        _ANI_PREVIEWS.acquire_nowait()
    except WouldBlock:
        raise HTTPException(status_code=503) from None
    try:
        data = await read_published_bytes(private_storage(settings), asset)
        png = await to_thread.run_sync(_animated_png, data)
        return Response(content=png, media_type="image/png", headers=_MEDIA_HEADERS)
    except (AssetNotFound, StorageError, InvalidAsset):
        raise HTTPException(status_code=404) from None
    finally:
        _ANI_PREVIEWS.release()


@_admin_previews.get("/packs/{pack_id}/roles/{role}/animation")
async def admin_cursor_animation(
    pack_id: Annotated[int, Path(gt=0, le=MAX_SAFE_ID)],
    role: CursorRole,
    identity: AdminDependency,
    db: AdminDatabase,
) -> Response:
    async with db.begin():
        asset = await db.scalar(
            select(AdminAsset)
            .join(
                AdminPackRole,
                (AdminPackRole.pack_id == AdminAsset.pack_id)
                & (AdminPackRole.asset_id == AdminAsset.id),
            )
            .where(
                AdminPackRole.pack_id == pack_id,
                AdminPackRole.role_type == role,
                AdminAsset.kind == AssetKind.CURSOR,
                AdminAsset.mime_type == ANI_MIME_TYPE,
            )
        )
    if asset is None:
        return Response(status_code=204, headers=_MEDIA_HEADERS)
    return await _animation_response(asset, Settings.model_validate({}))


app.include_router(_admin_previews)


@app.get("/api/v1/packs/{pack_id}/assets/{role}/animation", include_in_schema=False)
async def public_cursor_animation(
    pack_id: Annotated[int, Path(gt=0, le=MAX_SAFE_ID)],
    role: CursorRole,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    settings = Settings.model_validate({})
    prefix = managed_prefix(settings)
    async with db.begin():
        url = await db.scalar(
            select(CursorItem.cursor_file_url)
            .join(CursorPack, CursorPack.id == CursorItem.pack_id)
            .where(
                CursorItem.pack_id == pack_id,
                CursorItem.role_type == role,
                CursorPack.status == PackStatus.PUBLISHED,
            )
        )
        if (
            url is None
            or not url.startswith(prefix + "managed/")
            or not url.endswith(".ani")
        ):
            raise HTTPException(status_code=404)
        asset = await published_asset(db, pack_id, url[len(prefix) :], url)
    if asset is None or asset.mime_type != ANI_MIME_TYPE:
        raise HTTPException(status_code=404)
    response = await _animation_response(asset, settings)
    response.headers["Vary"] = "Origin"
    origin = request.headers.get("origin")
    if origin is not None and origin in settings.cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
    return response


@app.api_route(
    "/static/samples/managed/{pack_id}/{filename}",
    methods=["GET", "HEAD"],
    include_in_schema=False,
)
@app.api_route(
    "/internal/managed/{pack_id}/{filename}",
    methods=["GET", "HEAD"],
    include_in_schema=False,
)
async def managed_media(
    pack_id: str,
    filename: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    headers = dict(_MEDIA_HEADERS)
    backend = request.state.storage_backend
    local_route = request.url.path.startswith("/static/samples/")
    if (
        (local_route and (backend != "local" or request.state.app_env != "development"))
        or (not local_route and backend != "r2")
        or not pack_id.isascii()
        or not pack_id.isdecimal()
        or len(pack_id) > 16
        or not 1 <= int(pack_id) <= MAX_SAFE_ID
        or str(int(pack_id)) != pack_id
    ):
        return Response(status_code=404, headers=headers)
    raw_id, _, extension = filename.rpartition(".")
    if feature_auth_required() and extension in {"cur", "ani"}:
        return Response(status_code=404, headers=headers)
    format_info = _MEDIA_TYPES.get(extension)
    if format_info is None:
        return Response(status_code=404, headers=headers)
    kind, mime = format_info
    try:
        asset_id = UUID(raw_id)
        if str(asset_id) != raw_id:
            raise ValueError("Noncanonical UUID")
    except ValueError:
        return Response(status_code=404, headers=headers)
    key = asset_key(int(pack_id), asset_id, kind, mime_type=mime)
    try:
        settings = Settings.model_validate({})
        async with db.begin():
            asset = await published_asset(
                db, int(pack_id), key, managed_prefix(settings) + key
            )
        if asset is None:
            return Response(status_code=404, headers=headers)
        content = await read_published_bytes(private_storage(settings), asset)
    except AssetNotFound:
        return Response(status_code=404, headers=headers)
    except (StorageError, SQLAlchemyError, RuntimeError):
        return Response(status_code=503, headers=headers)
    headers["Content-Length"] = str(len(content))
    if extension == "ani":
        headers["Content-Disposition"] = 'attachment; filename="cursor.ani"'
    headers["Vary"] = "Origin"
    origin = request.headers.get("origin")
    if origin is not None and origin in settings.cors_origins:
        headers["Access-Control-Allow-Origin"] = origin
    return Response(
        content=content if request.method == "GET" else None,
        media_type=mime,
        headers=headers,
    )


app.mount("/static/samples", _serve_samples, name="samples")


@app.get("/health/live", include_in_schema=False)
async def health_live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/health/ready", include_in_schema=False)
async def health_ready(
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    try:
        async with asyncio.timeout(5):
            await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError, TimeoutError):
        logger.warning(
            "Readiness database probe failed", extra={"error_code": "db_unavailable"}
        )
        response.status_code = 503
        return {"status": "not_ready"}
    if request.state.storage_backend == "local" and not await to_thread.run_sync(
        SAMPLES_DIRECTORY.is_dir
    ):
        response.status_code = 503
        return {"status": "not_ready"}
    return {"status": "ready"}


@app.get("/openapi.json", include_in_schema=False, name="dev_openapi")
async def dev_openapi(request: Request) -> JSONResponse:
    if request.state.app_env != "development":
        raise HTTPException(status_code=404)
    return JSONResponse(app.openapi())


@app.get("/docs", include_in_schema=False)
async def dev_docs(request: Request) -> HTMLResponse:
    if request.state.app_env != "development":
        raise HTTPException(status_code=404)
    return get_swagger_ui_html(
        openapi_url=request.url_for("dev_openapi").path,
        title=f"{app.title} - Swagger UI",
    )
