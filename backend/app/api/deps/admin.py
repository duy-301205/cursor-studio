"""Shared authorization, login throttling, and audit for Admin API routes."""

from __future__ import annotations

import re
from collections.abc import Callable, Coroutine
from datetime import datetime, timedelta
from hmac import compare_digest, digest
from ipaddress import IPv6Address, ip_address
from math import ceil
from os import environ
from typing import Annotated, NamedTuple
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import Depends, Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import select, update
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_auth import SessionIdentity, active_session, touch_session, utc_now
from app.db.session import get_db
from app.models.admin_user import AdminAuditEvent, AdminRateLimit
from app.schemas.catalog import CatalogError, ErrorDetail, ErrorResponse

ADMIN_PREFIX = "/api/v1/admin"
_CSRF = re.compile(r"[0-9a-f]{64}")
_WINDOW = timedelta(minutes=15)
_FAILURE_LIMIT = 5
AdminDatabase = Annotated[AsyncSession, Depends(get_db)]


class AuthProblem(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        retry_after: int | None = None,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after
        self.details = details or []


class AuthRoute(APIRoute):
    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[object, object, Response]]:
        handle = super().get_route_handler()

        async def wrapped(request: Request) -> Response:
            request_id = f"req_{uuid4().hex}"
            request.state.admin_request_id = request_id
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
        error=CatalogError(
            code=exc.code,
            message=exc.message,
            details=exc.details,
            request_id=request_id,
        )
    )
    headers = (
        {"Retry-After": str(exc.retry_after)} if exc.retry_after is not None else None
    )
    return JSONResponse(
        body.model_dump(mode="json"), status_code=exc.status, headers=headers
    )


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


def auth_config(request: Request) -> AuthConfig:
    # Admin stays development-only pending the release gate.
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


def require_origin(request: Request, config: AuthConfig) -> None:
    require_trusted_origin(request, config.origin)


def require_trusted_origin(request: Request, origin: str) -> None:
    origins = request.headers.getlist("origin")
    referers = request.headers.getlist("referer")
    supplied = (
        _origin(origins[0], origin_only=True)
        if len(origins) == 1
        else _origin(referers[0])
        if not origins and len(referers) == 1
        else None
    )
    if supplied != origin:
        raise AuthProblem(403, "ORIGIN_DENIED", "Request origin denied.")


async def authenticate_session(
    request: Request, db: AsyncSession, config: AuthConfig
) -> SessionIdentity:
    identity = await active_session(
        db, request.cookies.get(config.cookie, ""), config.key
    )
    if identity is None:
        raise AuthProblem(401, "AUTH_REQUIRED", "Admin session required.")
    return identity


def require_csrf(request: Request, identity: SessionIdentity) -> None:
    tokens = request.headers.getlist("x-csrf-token")
    if (
        len(tokens) != 1
        or not _CSRF.fullmatch(tokens[0])
        or not compare_digest(tokens[0], identity.csrf_token)
    ):
        raise AuthProblem(403, "CSRF_FAILED", "Invalid CSRF token.")


async def require_admin(request: Request, db: AdminDatabase) -> SessionIdentity:
    """Validate a protected Admin request before accessing its handler."""
    config = auth_config(request)
    mutation = request.method not in {"GET", "HEAD", "OPTIONS"}
    if mutation:
        require_origin(request, config)
    async with db.begin():
        identity = await authenticate_session(request, db, config)
        if mutation:
            require_csrf(request, identity)
        touch_session(identity.session)
        return identity


AdminDependency = Annotated[SessionIdentity, Depends(require_admin)]


def audit_event(
    db: AsyncSession,
    action: str,
    outcome: str,
    request_id: str,
    actor_id: int | None = None,
    *,
    target_id: int | None = None,
) -> None:
    if target_id is None:
        target_id = actor_id
    db.add(
        AdminAuditEvent(
            actor_admin_id=actor_id,
            action=action,
            target_type="admin_user",
            target_id=str(target_id) if target_id is not None else None,
            outcome=outcome,
            request_id=request_id,
        )
    )


class LoginAttempt(NamedTuple):
    window_start: datetime
    peer_digest: bytes
    account_digest: bytes


def _peer(request: Request) -> str:
    # The ASGI server applies its configured proxy trust before setting this address.
    try:
        peer = ip_address(request.client.host if request.client else "")
    except ValueError:
        return "unknown"
    if isinstance(peer, IPv6Address) and peer.ipv4_mapped is not None:
        return str(peer.ipv4_mapped)
    return str(peer)


async def _reserve(
    db: AsyncSession, scope: str, subject: bytes, window: datetime, expiry: datetime
) -> None:
    statement = insert(AdminRateLimit).values(
        scope=scope,
        subject_hash=subject,
        window_start=window,
        counter=0,
        expires_at=expiry,
    )
    await db.execute(statement.on_duplicate_key_update(counter=AdminRateLimit.counter))
    row = await db.scalar(
        select(AdminRateLimit)
        .where(
            AdminRateLimit.scope == scope,
            AdminRateLimit.subject_hash == subject,
            AdminRateLimit.window_start == window,
        )
        .with_for_update()
    )
    if row is None:
        raise RuntimeError("Login rate-limit counter missing")
    if row.counter >= _FAILURE_LIMIT:
        wait = max(1, ceil((expiry - utc_now()).total_seconds()))
        raise AuthProblem(
            429, "RATE_LIMITED", "Too many login attempts.", retry_after=wait
        )
    row.counter += 1


async def reserve_login_attempt(
    request: Request, db: AsyncSession, config: AuthConfig, username: str
) -> LoginAttempt:
    """Reserve capacity before the KDF so concurrent requests share the limit."""
    now = utc_now()
    window = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
    peer = digest(config.key, b"admin-login-ip:" + _peer(request).encode(), "sha256")
    account = digest(config.key, b"admin-login-user:" + username.encode(), "sha256")
    async with db.begin():
        await _reserve(db, "login_ip", peer, window, window + _WINDOW)
        await _reserve(db, "login_account", account, window, window + _WINDOW)
    return LoginAttempt(window, peer, account)


async def release_login_attempt(db: AsyncSession, attempt: LoginAttempt) -> None:
    """Refund only the successful request, preserving failures in its window."""
    for scope, subject in (
        ("login_ip", attempt.peer_digest),
        ("login_account", attempt.account_digest),
    ):
        await db.execute(
            update(AdminRateLimit)
            .where(
                AdminRateLimit.scope == scope,
                AdminRateLimit.subject_hash == subject,
                AdminRateLimit.window_start == attempt.window_start,
                AdminRateLimit.counter > 0,
            )
            .values(counter=AdminRateLimit.counter - 1)
        )
