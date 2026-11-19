"""Same-origin registration and session endpoints for public Users."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable, Coroutine
from datetime import UTC
from hmac import compare_digest
from os import environ
from typing import Annotated, NamedTuple
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, Response
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

from app.api.deps.admin import (
    AuthProblem,
    _error,
    _origin,
    _peer,
    require_trusted_origin,
)
from app.core.admin_auth import utc_now
from app.core.user_auth import (
    SESSION_LIFETIME,
    EmailUnavailable,
    RateLimited,
    UserIdentity,
    login,
    normalize_email,
    register,
    reserve_attempt,
    resolve_session,
    touch_session,
)
from app.db.session import get_db
from app.models.user import User

_USER_PREFIX = "/api/v1"
_DIGEST = re.compile(r"[0-9a-f]{64}")
logger = logging.getLogger("uvicorn.error.user_auth")
UserDatabase = Annotated[AsyncSession, Depends(get_db)]


class UserAuthRoute(APIRoute):
    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[object, object, Response]]:
        handle = super().get_route_handler()

        async def wrapped(request: Request) -> Response:
            request_id = f"req_{uuid4().hex}"
            request.state.user_request_id = request_id
            try:
                response = await handle(request)
            except RateLimited as exc:
                response = _error(
                    AuthProblem(
                        429,
                        "RATE_LIMITED",
                        "Too many attempts.",
                        retry_after=exc.retry_after,
                    ),
                    request_id,
                )
            except AuthProblem as exc:
                response = _error(exc, request_id)
            except (SQLAlchemyError, RuntimeError):
                logger.warning(
                    "User authentication unavailable", extra={"request_id": request_id}
                )
                response = _error(
                    AuthProblem(
                        503, "AUTH_UNAVAILABLE", "User authentication unavailable."
                    ),
                    request_id,
                )
            response.headers["X-Request-ID"] = request_id
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            return response

        return wrapped


class UserConfig(NamedTuple):
    key: bytes
    origin: str
    secure: bool

    @property
    def cookie(self) -> str:
        return "__Secure-ccs_user" if self.secure else "ccs_user_dev"


def user_config(request: Request) -> UserConfig:
    if (
        request.state.app_env != "development"
        or environ.get("USER_AUTH_ENABLED") != "true"
    ):
        raise AuthProblem(404, "NOT_FOUND", "Not found.")
    key = environ.get("USER_CSRF_KEY", "")
    origin = _origin(environ.get("USER_ORIGIN", ""), origin_only=True)
    if _DIGEST.fullmatch(key) is None or origin is None:
        raise AuthProblem(503, "AUTH_UNAVAILABLE", "User authentication unavailable.")
    secure = origin.startswith("https://")
    if not secure and (
        environ.get("USER_ALLOW_LOOPBACK_HTTP") != "true"
        or urlsplit(origin).hostname not in {"localhost", "127.0.0.1", "::1"}
    ):
        raise AuthProblem(503, "AUTH_UNAVAILABLE", "User authentication unavailable.")
    if _origin(str(request.url)) != origin:
        raise AuthProblem(403, "ORIGIN_DENIED", "Request origin denied.")
    return UserConfig(bytes.fromhex(key), origin, secure)


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    email: Annotated[str, StringConstraints(max_length=320)]
    password: SecretStr


class UserView(BaseModel):
    id: int
    email: str


class RegistrationResponse(BaseModel):
    user: UserView


class UserAuthResponse(RegistrationResponse):
    csrf_token: str
    expires_at: str


def _view(user: User) -> UserView:
    return UserView(id=user.id, email=user.email_normalized)


def _response(identity: UserIdentity) -> UserAuthResponse:
    return UserAuthResponse(
        user=_view(identity.user),
        csrf_token=identity.csrf_token,
        expires_at=identity.session.expires_at.replace(tzinfo=UTC)
        .isoformat()
        .replace("+00:00", "Z"),
    )


async def _credentials(request: Request) -> tuple[str | None, str, bytes]:
    if (
        request.headers.get("content-type", "").partition(";")[0].strip().lower()
        != "application/json"
    ):
        raise AuthProblem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected a JSON body.")
    body = bytearray()
    try:
        async for chunk in request.stream():
            if len(body) + len(chunk) > 4096:
                raise AuthProblem(
                    413, "PAYLOAD_TOO_LARGE", "Credentials body exceeds 4 KiB."
                )
            body.extend(chunk)
        data = Credentials.model_validate_json(body)
        password = data.password.get_secret_value()
        return normalize_email(data.email), password, password.encode("utf-8")
    except (ClientDisconnect, ValidationError, UnicodeError):
        raise AuthProblem(
            422, "VALIDATION_ERROR", "Invalid credentials payload."
        ) from None


def _event(
    request: Request, action: str, outcome: str, user_id: int | None = None
) -> None:
    logger.info(
        "User authentication event request_id=%s action=%s outcome=%s user_id=%s",
        request.state.user_request_id,
        action,
        outcome,
        user_id,
        extra={
            "request_id": request.state.user_request_id,
            "action": action,
            "outcome": outcome,
            "user_id": user_id,
        },
    )


async def authenticate_user(
    request: Request, db: AsyncSession, config: UserConfig
) -> UserIdentity:
    identity = await resolve_session(
        db, request.cookies.get(config.cookie, ""), config.key
    )
    if identity is None:
        raise AuthProblem(401, "AUTH_REQUIRED", "User session required.")
    return identity


def require_user_csrf(request: Request, identity: UserIdentity) -> None:
    values = request.headers.getlist("x-csrf-token")
    if (
        len(values) != 1
        or _DIGEST.fullmatch(values[0]) is None
        or not compare_digest(values[0], identity.csrf_token)
    ):
        raise AuthProblem(403, "CSRF_FAILED", "Invalid CSRF token.")


router = APIRouter(
    prefix=f"{_USER_PREFIX}/auth", route_class=UserAuthRoute, include_in_schema=False
)


@router.post("/register", status_code=201)
async def register_route(request: Request, db: UserDatabase) -> RegistrationResponse:
    config = user_config(request)
    require_trusted_origin(request, config.origin)
    await reserve_attempt(db, config.key, _peer(request))
    email, password, encoded = await _credentials(request)
    if email is None or not 15 <= len(password) <= 128 or len(encoded) > 512:
        _event(request, "register", "invalid")
        raise AuthProblem(
            422, "VALIDATION_ERROR", "Email or password does not meet the requirements."
        )
    try:
        user = await register(db, email, encoded)
    except EmailUnavailable:
        _event(request, "register", "duplicate")
        raise AuthProblem(
            409, "EMAIL_UNAVAILABLE", "This email is unavailable."
        ) from None
    _event(request, "register", "success", user.id)
    return RegistrationResponse(user=_view(user))


@router.post("/login")
async def login_route(
    request: Request, response: Response, db: UserDatabase
) -> UserAuthResponse:
    config = user_config(request)
    require_trusted_origin(request, config.origin)
    email, _, password = await _credentials(request)
    if not 1 <= len(password) <= 512:
        email, password = None, b""
    reservations = await reserve_attempt(
        db, config.key, _peer(request), email=email or ""
    )
    result = await login(
        db,
        email or "",
        password,
        request.cookies.get(config.cookie, ""),
        config.key,
        reservations,
    )
    if result is None:
        _event(request, "login", "failure")
        raise AuthProblem(401, "INVALID_CREDENTIALS", "Invalid credentials.")
    token, identity = result
    response.set_cookie(
        config.cookie,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        path=_USER_PREFIX,
        secure=config.secure,
        httponly=True,
        samesite="lax",
    )
    _event(request, "login", "success", identity.user.id)
    return _response(identity)


@router.get("/me")
async def me_route(request: Request, db: UserDatabase) -> UserAuthResponse:
    config = user_config(request)
    async with db.begin():
        identity = await authenticate_user(request, db, config)
        touch_session(identity.session)
        return _response(identity)


@router.post("/logout", status_code=204)
async def logout_route(request: Request, db: UserDatabase) -> Response:
    config = user_config(request)
    require_trusted_origin(request, config.origin)
    async with db.begin():
        identity = await authenticate_user(request, db, config)
        require_user_csrf(request, identity)
        identity.session.revoked_at = utc_now()
    response = Response(status_code=204)
    response.delete_cookie(
        config.cookie,
        path=_USER_PREFIX,
        secure=config.secure,
        httponly=True,
        samesite="lax",
    )
    _event(request, "logout", "success", identity.user.id)
    return response
