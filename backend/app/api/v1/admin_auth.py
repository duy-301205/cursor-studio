"""Admin session endpoints, isolated from the public API schema."""

from __future__ import annotations

import re
from collections.abc import Callable, Coroutine
from datetime import UTC
from hmac import compare_digest
from os import environ
from typing import Annotated, NamedTuple
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import (
    BaseModel,
    ConfigDict,
    SecretStr,
    StringConstraints,
    ValidationError,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import ClientDisconnect

from app.core.admin_auth import (
    SESSION_LIFETIME,
    SessionIdentity,
    active_session,
    login,
    touch_session,
    utc_now,
)
from app.db.session import get_db
from app.schemas.catalog import CatalogError, ErrorResponse

_PREFIX = "/api/v1/admin"
_USERNAME = re.compile(r"[a-z0-9][a-z0-9._-]{2,99}")
_CSRF = re.compile(r"[0-9a-f]{64}")
_DB = Annotated[AsyncSession, Depends(get_db)]


class AuthProblem(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message


class AuthRoute(APIRoute):
    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[object, object, Response]]:
        handle = super().get_route_handler()

        async def wrapped(request: Request) -> Response:
            request_id = f"req_{uuid4().hex}"
            try:
                response = await handle(request)
            except (SQLAlchemyError, RuntimeError):
                response = _error(
                    AuthProblem(
                        503, "AUTH_UNAVAILABLE", "Admin authentication unavailable."
                    ),
                    request_id,
                )
            except AuthProblem as exc:
                response = _error(exc, request_id)
            response.headers["X-Request-ID"] = request_id
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            return response

        return wrapped


def _error(exc: AuthProblem, request_id: str) -> JSONResponse:
    body = ErrorResponse(
        error=CatalogError(code=exc.code, message=exc.message, request_id=request_id)
    )
    return JSONResponse(body.model_dump(mode="json"), status_code=exc.status)


class AuthConfig(NamedTuple):
    key: bytes
    origin: str
    secure: bool

    @property
    def cookie(self) -> str:
        return "__Secure-ccs_admin" if self.secure else "ccs_admin_dev"


def _origin(url: str, *, origin_only: bool = False) -> str | None:
    if not url or any(ord(char) <= 32 for char in url):
        return None
    try:
        parsed = urlsplit(url)
        if (
            parsed.scheme not in ("https", "http")
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or (origin_only and (parsed.path or parsed.query or parsed.fragment))
        ):
            return None
        port = parsed.port
    except ValueError:
        return None
    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    default_port = 443 if parsed.scheme == "https" else 80
    suffix = f":{port}" if port is not None and port != default_port else ""
    return f"{parsed.scheme}://{host}{suffix}"


def _config(request: Request) -> AuthConfig:
    # A03 checkpoint: auth routes are available only in an explicitly enabled dev process.
    if (
        request.state.app_env != "development"
        or environ.get("ADMIN_AUTH_ENABLED") != "true"
    ):
        raise AuthProblem(404, "NOT_FOUND", "Not found.")
    key = environ.get("ADMIN_CSRF_KEY", "")
    origin = _origin(environ.get("ADMIN_ORIGIN", ""), origin_only=True)
    if not _CSRF.fullmatch(key) or origin is None:
        raise AuthProblem(503, "AUTH_UNAVAILABLE", "Admin authentication unavailable.")
    secure = origin.startswith("https://")
    if not secure and (
        environ.get("ADMIN_ALLOW_LOOPBACK_HTTP") != "true"
        or urlsplit(origin).hostname not in {"localhost", "127.0.0.1", "::1"}
    ):
        raise AuthProblem(503, "AUTH_UNAVAILABLE", "Admin authentication unavailable.")
    if _origin(str(request.url)) != origin:
        raise AuthProblem(403, "ORIGIN_DENIED", "Request origin denied.")
    return AuthConfig(bytes.fromhex(key), origin, secure)


def _require_origin(request: Request, config: AuthConfig) -> None:
    origins = request.headers.getlist("origin")
    referers = request.headers.getlist("referer")
    supplied = (
        _origin(origins[0], origin_only=True)
        if len(origins) == 1
        else _origin(referers[0])
        if not origins and len(referers) == 1
        else None
    )
    if supplied != config.origin:
        raise AuthProblem(403, "ORIGIN_DENIED", "Request origin denied.")


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)

    username: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    password: SecretStr


async def _credentials(request: Request) -> tuple[str, bytes]:
    if (
        request.headers.get("content-type", "").partition(";")[0].strip().lower()
        != "application/json"
    ):
        raise AuthProblem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected a JSON body.")
    body = bytearray()
    try:
        async for chunk in request.stream():
            if len(body) + len(chunk) > 4096:
                raise AuthProblem(413, "PAYLOAD_TOO_LARGE", "Login body exceeds 4 KiB.")
            body.extend(chunk)
        payload = Credentials.model_validate_json(body)
        username = payload.username.strip().lower()
        password = payload.password.get_secret_value().encode("utf-8")
    except (ClientDisconnect, ValidationError, UnicodeError):
        raise AuthProblem(422, "VALIDATION_ERROR", "Invalid login body.") from None
    if not _USERNAME.fullmatch(username) or not 1 <= len(password) <= 512:
        raise AuthProblem(401, "INVALID_CREDENTIALS", "Invalid credentials.")
    return username, password


class AdminIdentity(BaseModel):
    id: int
    username: str


class AuthResponse(BaseModel):
    admin: AdminIdentity
    csrf_token: str
    expires_at: str


def _response(identity: SessionIdentity) -> AuthResponse:
    return AuthResponse(
        admin=AdminIdentity(id=identity.admin.id, username=identity.admin.username),
        csrf_token=identity.csrf_token,
        expires_at=identity.session.expires_at.replace(tzinfo=UTC)
        .isoformat()
        .replace("+00:00", "Z"),
    )


async def _require_session(
    request: Request, db: AsyncSession, config: AuthConfig
) -> SessionIdentity:
    identity = await active_session(
        db, request.cookies.get(config.cookie, ""), config.key
    )
    if identity is None:
        raise AuthProblem(401, "AUTH_REQUIRED", "Admin session required.")
    return identity


router = APIRouter(prefix=_PREFIX, include_in_schema=False, route_class=AuthRoute)


@router.post("/auth/login")
async def login_route(request: Request, response: Response, db: _DB) -> AuthResponse:
    config = _config(request)
    _require_origin(request, config)
    username, password = await _credentials(request)
    result = await login(
        db, username, password, request.cookies.get(config.cookie, ""), config.key
    )
    if result is None:
        raise AuthProblem(401, "INVALID_CREDENTIALS", "Invalid credentials.")
    token, identity = result
    response.set_cookie(
        config.cookie,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        path=_PREFIX,
        secure=config.secure,
        httponly=True,
        samesite="lax",
    )
    return _response(identity)


@router.get("/auth/me")
async def me_route(request: Request, db: _DB) -> AuthResponse:
    config = _config(request)
    async with db.begin():
        identity = await _require_session(request, db, config)
        touch_session(identity.session)
        return _response(identity)


@router.post("/auth/logout", status_code=204)
async def logout_route(request: Request, db: _DB) -> Response:
    config = _config(request)
    _require_origin(request, config)
    async with db.begin():
        identity = await _require_session(request, db, config)
        tokens = request.headers.getlist("x-csrf-token")
        if (
            len(tokens) != 1
            or not _CSRF.fullmatch(tokens[0])
            or not compare_digest(tokens[0], identity.csrf_token)
        ):
            raise AuthProblem(403, "CSRF_FAILED", "Invalid CSRF token.")
        identity.session.revoked_at = utc_now()
    response = Response(status_code=204)
    response.delete_cookie(
        config.cookie, path=_PREFIX, secure=config.secure, httponly=True, samesite="lax"
    )
    return response
