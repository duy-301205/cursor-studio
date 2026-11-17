"""FastAPI lifecycle and operational endpoints."""

from __future__ import annotations

import asyncio
import logging
import mimetypes
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from anyio import to_thread
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.staticfiles import StaticFiles
from starlette.types import Receive, Scope, Send

from app.core.config import Settings
from app.db.seed import SAMPLES_DIRECTORY, seed_development
from app.db.session import DatabaseState, database_lifespan, get_db

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

mimetypes.add_type("image/webp", ".webp")
_sample_files = StaticFiles(directory=SAMPLES_DIRECTORY, check_dir=False)


async def _serve_samples(scope: Scope, receive: Receive, send: Send) -> None:
    if scope.get("state", {}).get("app_env") != "development":
        await Response(status_code=404)(scope, receive, send)
        return
    await _sample_files(scope, receive, send)


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
