"""Admin password and database-backed session operations."""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest, digest
from typing import NamedTuple

from anyio import CapacityLimiter, to_thread
from cryptography.exceptions import InvalidKey
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_user import AdminSession, AdminUser

SESSION_LIFETIME = timedelta(hours=12)
IDLE_TIMEOUT = timedelta(minutes=30)
_TOUCH_INTERVAL = timedelta(minutes=1)
_ARGON_PREFIX = "$argon2id$v=19$m=65536,t=3,p=1$"
_SAFE_PHC = re.compile(
    r"\$argon2id\$v=19\$m=(\d{1,6}),t=(\d),p=(\d)\$[A-Za-z0-9+/]{22,43}\$[A-Za-z0-9+/]{43}"
)
_SESSION_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")
_HASH_LIMITER = CapacityLimiter(2)
# A valid PHC shape with an arbitrary digest, to run the same KDF for unknown users.
_DUMMY_PHC = _ARGON_PREFIX + "AAAAAAAAAAAAAAAAAAAAAA$" + "A" * 43


class SessionIdentity(NamedTuple):
    session: AdminSession
    admin: AdminUser
    csrf_token: str


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def token_hash(token: str) -> bytes:
    return sha256(token.encode("ascii")).digest()


def _csrf_token(key: bytes, token: str) -> str:
    return digest(key, b"ccs-admin-csrf-v1:" + token.encode("ascii"), "sha256").hex()


def _hash_password(password: bytes) -> str:
    return Argon2id(
        salt=secrets.token_bytes(16),
        length=32,
        iterations=3,
        lanes=1,
        memory_cost=65536,
    ).derive_phc_encoded(password)


async def hash_password(password: bytes) -> str:
    """Encode a password as an Argon2id PHC string off the event loop."""
    return await to_thread.run_sync(_hash_password, password, limiter=_HASH_LIMITER)


def _verify_password(password: bytes, encoded: str) -> bool:
    match = _SAFE_PHC.fullmatch(encoded)
    usable = (
        match is not None
        and 8192 <= int(match[1]) <= 65536
        and 1 <= int(match[2]) <= 3
        and 1 <= int(match[3]) <= 4
    )
    try:
        Argon2id.verify_phc_encoded(password, encoded if usable else _DUMMY_PHC)
    except InvalidKey:
        return False
    return usable


async def login(
    db: AsyncSession, username: str, password: bytes, old_token: str, csrf_key: bytes
) -> tuple[str, SessionIdentity] | None:
    async with db.begin():
        row = (
            await db.execute(
                select(
                    AdminUser.id, AdminUser.password_hash, AdminUser.is_active
                ).where(AdminUser.username == username)
            )
        ).one_or_none()
    encoded = row.password_hash if row and row.is_active else _DUMMY_PHC
    verified = await to_thread.run_sync(
        _verify_password, password, encoded, limiter=_HASH_LIMITER
    )
    if not verified or row is None or not row.is_active:
        return None

    replacement = (
        None if encoded.startswith(_ARGON_PREFIX) else await hash_password(password)
    )
    async with db.begin():
        admin = await db.scalar(
            select(AdminUser).where(AdminUser.id == row.id).with_for_update()
        )
        if admin is None or not admin.is_active or admin.password_hash != encoded:
            return None
        if replacement is not None:
            admin.password_hash = replacement
        now = utc_now()
        if _SESSION_TOKEN.fullmatch(old_token):
            await db.execute(
                update(AdminSession)
                .where(
                    AdminSession.token_hash == token_hash(old_token),
                    AdminSession.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )
        token = secrets.token_urlsafe(32)
        csrf = _csrf_token(csrf_key, token)
        session = AdminSession(
            admin_user_id=admin.id,
            token_hash=token_hash(token),
            csrf_token_hash=token_hash(csrf),
            expires_at=now + SESSION_LIFETIME,
            last_seen_at=now,
        )
        db.add(session)
        await db.flush()
        return token, SessionIdentity(session, admin, csrf)


async def active_session(
    db: AsyncSession, token: str, csrf_key: bytes
) -> SessionIdentity | None:
    """Resolve an active session inside the caller's transaction."""
    if not _SESSION_TOKEN.fullmatch(token):
        return None
    hashed = token_hash(token)
    admin_id = await db.scalar(
        select(AdminSession.admin_user_id).where(AdminSession.token_hash == hashed)
    )
    if admin_id is None:
        return None
    # Use the same account-before-session lock order as login.
    admin = await db.scalar(
        select(AdminUser).where(AdminUser.id == admin_id).with_for_update()
    )
    if admin is None or not admin.is_active:
        return None
    session = await db.scalar(
        select(AdminSession)
        .where(
            AdminSession.token_hash == hashed, AdminSession.admin_user_id == admin_id
        )
        .with_for_update()
    )
    if session is None:
        return None
    now = utc_now()
    if (
        session.revoked_at is not None
        or session.expires_at <= now
        or session.last_seen_at <= now - IDLE_TIMEOUT
    ):
        return None
    csrf = _csrf_token(csrf_key, token)
    if not compare_digest(session.csrf_token_hash, token_hash(csrf)):
        return None
    return SessionIdentity(session, admin, csrf)


def touch_session(session: AdminSession) -> None:
    now = utc_now()
    if session.last_seen_at <= now - _TOUCH_INTERVAL:
        session.last_seen_at = now
