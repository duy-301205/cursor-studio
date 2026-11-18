"""Verify Admin security through the real FastAPI entrypoint and shared MySQL."""

from __future__ import annotations

import asyncio
import os
import secrets
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from conftest import (
    AdminAccount,
    AdminTokens,
    Reply,
    admin_error,
    admin_json,
    admin_tokens,
)
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.admin_auth import token_hash, utc_now
from app.models.admin_user import AdminAuditEvent, AdminSession, AdminUser


def test_origin_cookie_and_session_rotation(admin_account: AdminAccount) -> None:
    account = admin_account
    payload = {"username": account.username, "password": account.password}
    for origin in (None, "null", "https://attacker.invalid"):
        admin_error(
            account.request("POST", "/auth/login", payload=payload, origin=origin),
            403,
            "ORIGIN_DENIED",
        )
    admin_error(
        account.request(
            "POST", "/auth/login", payload=payload, headers={"Host": "evil.invalid"}
        ),
        403,
        "ORIGIN_DENIED",
    )
    admin_error(
        account.request("POST", "/auth/login", payload=payload, peer="127.0.0.215"),
        403,
        "ORIGIN_DENIED",
    )
    admin_error(
        account.request(
            "POST",
            "/auth/login",
            body=b"{" + b"x" * 4096,
            headers={"Content-Type": "application/json"},
        ),
        413,
        "PAYLOAD_TOO_LARGE",
    )

    fixed = AdminTokens("__Secure-ccs_admin=" + "a" * 43, "")
    reply = account.request(
        "POST",
        "/auth/login",
        payload=payload,
        tokens=fixed,
        origin=None,
        headers={"Referer": "https://localhost/admin/login"},
    )
    session = admin_tokens(reply)
    assert session.cookie != fixed.cookie
    cookie = reply.headers["set-cookie"].lower()
    for flag in (
        "httponly",
        "secure",
        "samesite=lax",
        "path=/api/v1/admin",
        "max-age=43200",
    ):
        assert flag in cookie
    assert "domain=" not in cookie
    assert set(admin_json(reply, 200)) == {"admin", "csrf_token", "expires_at"}
    assert admin_json(
        account.request("GET", "/auth/me", tokens=session, port=8001), 200
    ) == admin_json(reply, 200)

    rotated = admin_tokens(account.login(port=8001, tokens=session))
    assert rotated != session
    admin_error(
        account.request("GET", "/auth/me", tokens=session), 401, "AUTH_REQUIRED"
    )
    for csrf in ("", session.csrf):
        invalid = AdminTokens(rotated.cookie, csrf)
        admin_error(
            account.request("POST", "/auth/logout", tokens=invalid), 403, "CSRF_FAILED"
        )
    admin_error(
        account.request(
            "POST", "/auth/logout", tokens=rotated, origin="https://attacker.invalid"
        ),
        403,
        "ORIGIN_DENIED",
    )
    logout = account.request("POST", "/auth/logout", tokens=rotated)
    assert logout.status == 204 and logout.body == b""
    assert "Max-Age=0" in logout.headers["set-cookie"]
    admin_error(
        account.request("GET", "/auth/me", tokens=rotated, port=8001),
        401,
        "AUTH_REQUIRED",
    )
    assert account.request("POST", "/auth/signup", payload=payload).status == 404


@pytest.mark.asyncio
async def test_session_expiry_disabled_account_and_redaction(
    admin_account: AdminAccount, db: AsyncEngine
) -> None:
    account = admin_account
    first = account.login()
    tokens = admin_tokens(first)
    raw_token = tokens.cookie.partition("=")[2]
    digest = token_hash(raw_token)
    idle_at = utc_now() - timedelta(minutes=2)
    async with db.begin() as connection:
        row = (
            await connection.execute(
                select(
                    AdminSession.token_hash,
                    AdminSession.csrf_token_hash,
                    AdminSession.expires_at,
                ).where(AdminSession.admin_user_id == account.id)
            )
        ).one()
        assert row.token_hash == digest
        assert row.csrf_token_hash == token_hash(tokens.csrf)
        assert (
            abs((row.expires_at - utc_now() - timedelta(hours=12)).total_seconds()) < 15
        )
        await connection.execute(
            update(AdminSession)
            .where(AdminSession.token_hash == digest)
            .values(last_seen_at=idle_at)
        )
    admin_json(account.request("GET", "/auth/me", tokens=tokens), 200)
    async with db.begin() as connection:
        last_seen = (
            await connection.execute(
                select(AdminSession.last_seen_at).where(
                    AdminSession.token_hash == digest
                )
            )
        ).scalar_one()
        assert last_seen > idle_at
        await connection.execute(
            update(AdminSession)
            .where(AdminSession.token_hash == digest)
            .values(last_seen_at=utc_now() - timedelta(minutes=31))
        )
    admin_error(account.request("GET", "/auth/me", tokens=tokens), 401, "AUTH_REQUIRED")

    absolute = admin_tokens(account.login())
    async with db.begin() as connection:
        await connection.execute(
            update(AdminSession)
            .where(
                AdminSession.token_hash == token_hash(absolute.cookie.partition("=")[2])
            )
            .values(expires_at=utc_now() - timedelta(seconds=1))
        )
    admin_error(
        account.request("GET", "/auth/me", tokens=absolute, port=8001),
        401,
        "AUTH_REQUIRED",
    )

    disabled_session = admin_tokens(account.login())
    payload = {"username": account.username, "password": account.password}
    bad = account.request(
        "POST", "/auth/login", payload={**payload, "password": "wrong"}
    )
    unknown = account.request(
        "POST",
        "/auth/login",
        payload={**payload, "username": account.username + ".missing"},
    )
    command = await asyncio.to_thread(
        subprocess.run,
        ["python", "-m", "app.cli.create_admin", "disable", account.username],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    assert command.returncode == 0, command.stderr
    disabled = account.login()
    for reply in (bad, unknown, disabled):
        admin_error(reply, 401, "INVALID_CREDENTIALS")
    assert {reply.json()["error"]["message"] for reply in (bad, unknown, disabled)} == {
        "Invalid credentials."
    }
    admin_error(
        account.request("GET", "/auth/me", tokens=disabled_session),
        401,
        "AUTH_REQUIRED",
    )
    async with db.connect() as connection:
        assert (
            await connection.execute(
                select(AdminUser.is_active).where(AdminUser.id == account.id)
            )
        ).scalar_one() is False
        audit = (
            await connection.execute(
                select(
                    AdminAuditEvent.action,
                    AdminAuditEvent.outcome,
                    AdminAuditEvent.request_id,
                ).where(
                    AdminAuditEvent.request_id.in_(
                        [
                            reply.headers["x-request-id"]
                            for reply in (first, bad, unknown, disabled)
                        ]
                    )
                )
            )
        ).all()
    assert {row.outcome for row in audit} == {"success", "failure"}
    assert len(audit) == 4
    logs = "\n".join(
        Path(path).read_text(encoding="utf-8")
        for path in os.environ["CCS_ADMIN_TEST_LOGS"].split(",")
    )
    for secret in (account.password, raw_token, tokens.csrf, account.username):
        assert secret not in logs
        assert secret not in repr(audit)
        assert all(
            secret.encode() not in reply.body for reply in (bad, unknown, disabled)
        )


def test_login_throttling_is_shared_and_atomic(admin_account: AdminAccount) -> None:
    account = admin_account
    address_prefix = f"2001:db8:{secrets.token_hex(2)}:{secrets.token_hex(2)}::"
    username = f"absent-{uuid4().hex}"

    def attempt(index: int, login: str, address: str) -> Reply:
        return account.request(
            "POST",
            "/auth/login",
            port=8000 + index % 2,
            forwarded=address,
            payload={"username": login, "password": "wrong password"},
        )

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(
            executor.map(
                lambda index: attempt(index, username, f"{address_prefix}{index + 1}"),
                range(8),
            )
        )
    assert sorted(reply.status for reply in results) == [401] * 5 + [429] * 3
    for reply in results:
        if reply.status == 429:
            admin_error(reply, 429, "RATE_LIMITED")
            assert 1 <= int(reply.headers["retry-after"]) <= 900
        else:
            admin_error(reply, 401, "INVALID_CREDENTIALS")

    dedicated_ip = f"{address_prefix}ff"
    for index in range(5):
        admin_error(
            attempt(index, f"absent-{uuid4().hex}", dedicated_ip),
            401,
            "INVALID_CREDENTIALS",
        )
    blocked = attempt(1, f"absent-{uuid4().hex}", dedicated_ip)
    admin_error(blocked, 429, "RATE_LIMITED")
    assert 1 <= int(blocked.headers["retry-after"]) <= 900
    admin_tokens(account.login(port=8001))
