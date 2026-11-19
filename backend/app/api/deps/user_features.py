"""Rollout and request guards for signed-in User features."""

from __future__ import annotations

from contextlib import asynccontextmanager
from os import environ

from fastapi import Request

from app.api.deps.admin import require_trusted_origin
from app.api.v1.user_auth import authenticate_user, require_user_csrf, user_config
from app.core.user_auth import touch_session
from app.db.session import get_db

PRIVATE_FEATURE_HEADERS = {
    "Cache-Control": "private, no-store",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
}


def feature_auth_required() -> bool:
    """Keep existing clients working until the coordinated frontend cutover."""
    return environ.get("USER_FEATURE_AUTH_REQUIRED") == "true"


async def authorize_user_feature(request: Request) -> None:
    """Check credentials before parsing request data or loading product resources."""
    config = user_config(request)
    mutation = request.method not in {"GET", "HEAD"}
    async with asynccontextmanager(get_db)(request) as db, db.begin():
        identity = await authenticate_user(request, db, config)
        if mutation:
            require_trusted_origin(request, config.origin)
            require_user_csrf(request, identity)
        touch_session(identity.session)
