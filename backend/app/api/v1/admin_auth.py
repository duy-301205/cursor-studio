"""Admin session endpoints, isolated from the public API schema."""

from __future__ import annotations

import re
from datetime import UTC
from typing import Annotated

from fastapi import APIRouter, Request, Response
from pydantic import (
    BaseModel,
    ConfigDict,
    SecretStr,
    StringConstraints,
    ValidationError,
)
from starlette.requests import ClientDisconnect

from app.api.deps.admin import (
    ADMIN_PREFIX,
    AdminDatabase,
    AdminDependency,
    AuthProblem,
    AuthRoute,
    audit_event,
    auth_config,
    authenticate_session,
    release_login_attempt,
    require_csrf,
    require_origin,
    reserve_login_attempt,
)
from app.core.admin_auth import SESSION_LIFETIME, SessionIdentity, login, utc_now

_USERNAME = re.compile(r"[a-z0-9][a-z0-9._-]{2,99}")


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
        return "", b""
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


router = APIRouter(prefix=ADMIN_PREFIX, include_in_schema=False, route_class=AuthRoute)


@router.post("/auth/login")
async def login_route(
    request: Request, response: Response, db: AdminDatabase
) -> AuthResponse:
    config = auth_config(request)
    require_origin(request, config)
    username, password = await _credentials(request)
    attempt = await reserve_login_attempt(request, db, config, username)
    request_id = request.state.admin_request_id

    async def record_success(admin_id: int) -> None:
        await release_login_attempt(db, attempt)
        audit_event(db, "login", "success", request_id, admin_id)

    result = await login(
        db,
        username,
        password,
        request.cookies.get(config.cookie, ""),
        config.key,
        on_success=record_success,
    )
    if result is None:
        async with db.begin():
            audit_event(db, "login", "failure", request_id)
        raise AuthProblem(401, "INVALID_CREDENTIALS", "Invalid credentials.")
    token, identity = result
    response.set_cookie(
        config.cookie,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        path=ADMIN_PREFIX,
        secure=config.secure,
        httponly=True,
        samesite="lax",
    )
    return _response(identity)


@router.get("/auth/me")
async def me_route(identity: AdminDependency) -> AuthResponse:
    return _response(identity)


@router.post("/auth/logout", status_code=204)
async def logout_route(request: Request, db: AdminDatabase) -> Response:
    config = auth_config(request)
    require_origin(request, config)
    async with db.begin():
        identity = await authenticate_session(request, db, config)
        require_csrf(request, identity)
        identity.session.revoked_at = utc_now()
        audit_event(
            db, "logout", "success", request.state.admin_request_id, identity.admin.id
        )
    response = Response(status_code=204)
    response.delete_cookie(
        config.cookie,
        path=ADMIN_PREFIX,
        secure=config.secure,
        httponly=True,
        samesite="lax",
    )
    return response
