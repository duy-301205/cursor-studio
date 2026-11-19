"""User identity, shared throttling and opaque session persistence."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta
from hmac import compare_digest, digest
from math import ceil
from typing import NamedTuple

from sqlalchemy import select, text, update
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_auth import hash_password, token_hash, utc_now, verify_password
from app.models.user import User, UserRateLimit, UserSession

SESSION_LIFETIME = timedelta(hours=12)
IDLE_TIMEOUT = timedelta(minutes=30)
_MAX_JS_ID = 2**53 - 1
_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")
_LOCAL = re.compile(r"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*")
_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")


class EmailUnavailable(Exception):
    """A concurrent or earlier registration used the normalized email."""


class RateLimited(Exception):
    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after


class RateKey(NamedTuple):
    scope: str
    subject: bytes
    window_start: datetime


class UserIdentity(NamedTuple):
    user: User
    session: UserSession
    csrf_token: str


def normalize_email(email: str) -> str | None:
    email = email.strip()
    if not email.isascii() or len(email) > 254:
        return None
    email = email.lower()
    local, separator, domain = email.partition("@")
    labels = domain.split(".")
    if (
        not separator
        or len(local) > 64
        or _LOCAL.fullmatch(local) is None
        or len(labels) < 2
        or any(_LABEL.fullmatch(label) is None for label in labels)
    ):
        return None
    return email


def _subject(key: bytes, scope: str, identifier: str) -> bytes:
    return digest(key, f"ccs-user-rate-v1:{scope}:{identifier}".encode(), "sha256")


async def reserve_attempt(
    db: AsyncSession, key: bytes, peer: str, *, email: str | None = None
) -> tuple[RateKey, ...]:
    """Reserve slots before hashing. A successful login refunds its slots."""
    now = utc_now()
    scopes: tuple[tuple[str, str], ...]
    if email is None:
        start = now.replace(minute=0, second=0, microsecond=0)
        expiry = start + timedelta(hours=1)
        scopes = (("register_ip", peer),)
    else:
        start = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
        expiry = start + timedelta(minutes=15)
        scopes = (("login_ip", peer), ("login_email", email))
    keys = tuple(
        RateKey(scope, _subject(key, scope, value), start) for scope, value in scopes
    )
    async with db.begin():
        for rate in keys:
            statement = insert(UserRateLimit).values(
                scope=rate.scope,
                subject_hash=rate.subject,
                window_start=rate.window_start,
                counter=0,
                expires_at=expiry,
            )
            await db.execute(
                statement.on_duplicate_key_update(counter=UserRateLimit.counter)
            )
            row = await db.get(UserRateLimit, tuple(rate), with_for_update=True)
            if row is None:
                raise RuntimeError("User rate-limit counter missing")
            if row.counter >= 5:
                raise RateLimited(max(1, ceil((expiry - utc_now()).total_seconds())))
            row.counter += 1
    return keys


async def _refund(db: AsyncSession, keys: tuple[RateKey, ...]) -> None:
    for key in keys:
        await db.execute(
            update(UserRateLimit)
            .where(
                UserRateLimit.scope == key.scope,
                UserRateLimit.subject_hash == key.subject,
                UserRateLimit.window_start == key.window_start,
                UserRateLimit.counter > 0,
            )
            .values(counter=UserRateLimit.counter - 1)
        )


async def register(db: AsyncSession, email: str, password: bytes) -> User:
    encoded = await hash_password(password)
    try:
        async with db.begin():
            user = User(email_normalized=email, password_hash=encoded)
            db.add(user)
            await db.flush()
            if not 1 <= user.id <= _MAX_JS_ID:
                raise RuntimeError("User ID allocation exceeds supported range")
            return user
    except IntegrityError as exc:
        if (
            exc.orig is not None
            and exc.orig.args[:1] == (1062,)
            and "uq_users_email_normalized" in str(exc.orig)
        ):
            raise EmailUnavailable from None
        raise


def _csrf_token(key: bytes, token: str) -> str:
    return digest(key, b"ccs-user-csrf-v1:" + token.encode("ascii"), "sha256").hex()


async def login(
    db: AsyncSession,
    email: str,
    password: bytes,
    old_token: str,
    key: bytes,
    reservations: tuple[RateKey, ...],
) -> tuple[str, UserIdentity] | None:
    async with db.begin():
        row = (
            await db.execute(
                select(User.id, User.password_hash, User.is_active).where(
                    User.email_normalized == email
                )
            )
        ).one_or_none()
    encoded = row.password_hash if row is not None and row.is_active else None
    verified = await verify_password(password, encoded)
    if row is None or not verified:
        return None
    async with db.begin():
        user = await db.get(User, row.id, with_for_update=True)
        if user is None or not user.is_active or user.password_hash != encoded:
            return None
        if not 1 <= user.id <= _MAX_JS_ID:
            raise RuntimeError("User ID exceeds supported range")
        now = utc_now()
        if _TOKEN.fullmatch(old_token):
            await db.execute(
                update(UserSession)
                .where(
                    UserSession.token_hash == token_hash(old_token),
                    UserSession.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )
        token = secrets.token_urlsafe(32)
        csrf = _csrf_token(key, token)
        session = UserSession(
            user_id=user.id,
            token_hash=token_hash(token),
            csrf_token_hash=token_hash(csrf),
            last_seen_at=now,
            expires_at=now + SESSION_LIFETIME,
        )
        db.add(session)
        await _refund(db, reservations)
        return token, UserIdentity(user, session, csrf)


async def resolve_session(
    db: AsyncSession, token: str, key: bytes
) -> UserIdentity | None:
    """Resolve a session under the caller's transaction and account-first lock order."""
    if _TOKEN.fullmatch(token) is None:
        return None
    hashed = token_hash(token)
    user_id = await db.scalar(
        select(UserSession.user_id).where(UserSession.token_hash == hashed)
    )
    if user_id is None or not 1 <= user_id <= _MAX_JS_ID:
        return None
    user = await db.get(User, user_id, with_for_update=True)
    if user is None or not user.is_active:
        return None
    session = await db.scalar(
        select(UserSession)
        .where(UserSession.token_hash == hashed, UserSession.user_id == user.id)
        .with_for_update()
    )
    now = utc_now()
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at <= now
        or session.last_seen_at <= now - IDLE_TIMEOUT
    ):
        return None
    csrf = _csrf_token(key, token)
    if not compare_digest(session.csrf_token_hash, token_hash(csrf)):
        return None
    return UserIdentity(user, session, csrf)


def touch_session(session: UserSession) -> None:
    now = utc_now()
    if session.last_seen_at <= now - timedelta(minutes=1):
        session.last_seen_at = now


async def cleanup_expired(db: AsyncSession) -> None:
    """Delete bounded batches of expired counters and old User sessions."""
    now = utc_now()
    cutoff = now - timedelta(days=7)
    async with db.begin():
        await db.execute(
            text(
                "DELETE FROM user_rate_limits WHERE expires_at <= :now ORDER BY expires_at LIMIT 500"
            ),
            {"now": now},
        )
        await db.execute(
            text(
                "DELETE FROM user_sessions WHERE expires_at <= :cutoff ORDER BY expires_at LIMIT 500"
            ),
            {"cutoff": cutoff},
        )
        await db.execute(
            text(
                "DELETE FROM user_sessions WHERE revoked_at <= :cutoff ORDER BY revoked_at LIMIT 500"
            ),
            {"cutoff": cutoff},
        )
