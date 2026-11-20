"""HTTP contract checks for the enabled User rollout on disposable MySQL."""

from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from io import BytesIO
from urllib.parse import urlsplit
from uuid import uuid4
from zipfile import ZipFile

import pytest
from conftest import AdminAccount, ApiClient, Reply, admin_tokens
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine
from test_api_integration import (
    _downloads,
    _multipart,
    _object,
    _objects,
    _pack_id,
    _png,
)

from app.models.custom_creation import CustomCreation
from app.models.user import UserSession

PREFIX = "/api/v1"
ORIGIN = {
    "Host": "localhost",
    "Origin": "https://localhost",
    "X-Forwarded-Proto": "https",
}
PASSWORD = "disposable-integration-password"


@pytest.fixture
def user_workers(api: ApiClient) -> tuple[ApiClient, ApiClient]:
    if os.environ.get("CCS_RUN_USER_INTEGRATION") != "1":
        pytest.skip("Set CCS_RUN_USER_INTEGRATION=1 for the enabled User workers")
    return ApiClient(api.peer_ip, 8002), ApiClient(api.peer_ip, 8003)


def auth_post(
    client: ApiClient,
    action: str,
    payload: dict[str, str],
    headers: dict[str, str] | None = None,
) -> Reply:
    return client.request(
        "POST",
        f"{PREFIX}/auth/{action}",
        json.dumps(payload).encode(),
        {**ORIGIN, "Content-Type": "application/json", **(headers or {})},
    )


def error_code(reply: Reply, status: int, code: str) -> None:
    assert reply.status == status
    response = reply.json()
    assert isinstance(response, dict)
    error = response["error"]
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code


def test_registration_enforces_approved_password_minimum(
    user_workers: tuple[ApiClient, ApiClient],
) -> None:
    first, _ = user_workers
    response = auth_post(
        first,
        "register",
        {"email": f"{uuid4().hex}@example.test", "password": "a" * 7},
    )
    error_code(response, 422, "VALIDATION_ERROR")
    response = auth_post(
        first,
        "register",
        {"email": f"{uuid4().hex}@example.test", "password": "a" * 8},
    )
    assert response.status == 201


def test_duplicate_registration_and_session_lifecycle(
    user_workers: tuple[ApiClient, ApiClient],
) -> None:
    first, second = user_workers
    email = f"{uuid4().hex}@example.test"
    credentials = {"email": email, "password": PASSWORD}
    with ThreadPoolExecutor(max_workers=2) as pool:
        one = pool.submit(auth_post, first, "register", credentials)
        two = pool.submit(
            auth_post,
            second,
            "register",
            {**credentials, "email": f" {email.upper()} "},
        )
        registered, duplicate = sorted(
            (one.result(), two.result()), key=lambda reply: reply.status
        )
    assert registered.status == 201
    assert "set-cookie" not in registered.headers
    error_code(duplicate, 409, "EMAIL_UNAVAILABLE")

    login = auth_post(first, "login", credentials)
    assert login.status == 200
    body = login.json()
    assert isinstance(body, dict)
    assert set(body) == {"user", "csrf_token", "expires_at"}
    cookie, *attributes = login.headers["set-cookie"].split("; ")
    assert cookie.startswith("__Secure-ccs_user=")
    assert {"httponly", "secure", "samesite=lax", "path=/api/v1"} <= {
        value.lower() for value in attributes
    }
    session = {**ORIGIN, "Cookie": cookie}
    assert second.request("GET", f"{PREFIX}/auth/me", headers=session).status == 200
    error_code(
        second.request("POST", f"{PREFIX}/auth/logout", headers=session),
        403,
        "CSRF_FAILED",
    )
    session["X-CSRF-Token"] = body["csrf_token"]
    assert (
        second.request("POST", f"{PREFIX}/auth/logout", headers=session).status == 204
    )
    error_code(
        first.request("GET", f"{PREFIX}/auth/me", headers=session), 401, "AUTH_REQUIRED"
    )


def test_guest_catalog_and_user_feature_contract(
    user_workers: tuple[ApiClient, ApiClient],
) -> None:
    client, _ = user_workers
    for path in ("/categories", "/packs"):
        assert client.request("GET", PREFIX + path, headers=ORIGIN).status == 200
    detail = client.request("GET", f"{PREFIX}/packs/sample-minimal", headers=ORIGIN)
    assert detail.status == 200
    pack = _object(detail.json())
    items = _objects(pack["cursor_items"])
    pointer = next(item for item in items if item["role_type"] == "pointer")
    preview = urlsplit(str(pointer["preview_png_url"])).path
    cursor = str(pointer["cursor_file_url"])
    pack_id = pack["id"]
    assert cursor == f"{PREFIX}/packs/{pack_id}/assets/pointer/cursor.cur"
    assert client.request("GET", preview, headers=ORIGIN).status == 200
    legacy_cursor = preview.removesuffix(".png") + ".cur"
    for method in ("GET", "HEAD"):
        assert client.request(method, legacy_cursor, headers=ORIGIN).status == 404
    for method, path in (
        ("GET", f"{PREFIX}/packs/{pack_id}/download"),
        ("GET", cursor),
        ("HEAD", cursor),
        ("POST", f"{PREFIX}/studio/convert"),
        ("POST", f"{PREFIX}/studio/share"),
        ("GET", f"{PREFIX}/studio/share/Unknown123"),
    ):
        reply = client.request(method, path, headers=ORIGIN)
        if method == "HEAD":
            assert reply.status == 401
            assert reply.body == b""
        else:
            error_code(reply, 401, "AUTH_REQUIRED")


def test_login_error_and_rate_limit_are_shared(
    user_workers: tuple[ApiClient, ApiClient],
) -> None:
    first, second = user_workers
    credentials = {"email": f"{uuid4().hex}@example.test", "password": PASSWORD}
    assert auth_post(first, "register", credentials).status == 201
    wrong_password = {**credentials, "password": "incorrect-fixture-password"}
    unknown_email = {**wrong_password, "email": f"{uuid4().hex}@example.test"}
    messages = []
    for worker, payload in (
        (first, wrong_password),
        (second, unknown_email),
        (first, wrong_password),
        (second, wrong_password),
        (first, wrong_password),
    ):
        reply = auth_post(worker, "login", payload)
        error_code(reply, 401, "INVALID_CREDENTIALS")
        body = reply.json()
        assert isinstance(body, dict)
        messages.append(body["error"]["message"])
    assert len(set(messages)) == 1
    limited = auth_post(second, "login", wrong_password)
    error_code(limited, 429, "RATE_LIMITED")
    assert int(limited.headers["retry-after"]) > 0


def test_admin_and_user_sessions_are_independent(
    user_workers: tuple[ApiClient, ApiClient], admin_account: AdminAccount
) -> None:
    first, _ = user_workers
    admin_login = admin_account.login(port=first.port)
    assert admin_login.status == 200
    admin = admin_tokens(admin_login)
    admin_headers = {**ORIGIN, "Cookie": admin.cookie, "X-CSRF-Token": admin.csrf}
    body, multipart = _multipart(_png(), 32, 0, 0)
    error_code(
        first.request(
            "POST", f"{PREFIX}/studio/convert", body, admin_headers | multipart
        ),
        401,
        "AUTH_REQUIRED",
    )
    response = first.request(
        "POST", f"{PREFIX}/admin/tools/convert", body, admin_headers | multipart
    )
    assert response.status == 200
    assert response.body.startswith(b"\x00\x00\x02\x00")

    credentials = {"email": f"{uuid4().hex}@example.test", "password": PASSWORD}
    assert auth_post(first, "register", credentials).status == 201
    login = auth_post(first, "login", credentials)
    assert login.status == 200
    user_headers = {**ORIGIN, "Cookie": login.headers["set-cookie"].split(";", 1)[0]}
    assert (
        first.request("GET", f"{PREFIX}/admin/auth/me", headers=user_headers).status
        == 401
    )


@pytest.mark.asyncio
async def test_signed_in_features_and_expiry(
    user_workers: tuple[ApiClient, ApiClient], db: AsyncEngine
) -> None:
    first, second = user_workers
    credentials = {"email": f"{uuid4().hex}@example.test", "password": PASSWORD}
    registration = auth_post(first, "register", credentials)
    assert registration.status == 201
    user_id = _object(_object(registration.json())["user"])["id"]
    login = auth_post(first, "login", credentials)
    assert login.status == 200
    csrf = _object(login.json())["csrf_token"]
    assert isinstance(csrf, str)
    headers = {
        **ORIGIN,
        "Cookie": login.headers["set-cookie"].split(";", 1)[0],
        "X-CSRF-Token": csrf,
    }
    pack_id = await _pack_id(db)
    download = f"{PREFIX}/packs/{pack_id}/download"
    before = await _downloads(db, pack_id)
    error_code(first.request("GET", download, headers=ORIGIN), 401, "AUTH_REQUIRED")
    assert await _downloads(db, pack_id) == before
    zip_reply = second.request("GET", download, headers=headers)
    assert zip_reply.status == 200
    with ZipFile(BytesIO(zip_reply.body)) as archive:
        inf = archive.read("sample-minimal/Install.inf").decode("ascii")
        scheme = inf.split("[CursorScheme]\r\n", 1)[1].splitlines()[0]
        assert len(scheme.rsplit(',"', 1)[1].removesuffix('"').split(",")) == 17
    assert await _downloads(db, pack_id) == before + 1

    cursor = f"{PREFIX}/packs/{pack_id}/assets/pointer/cursor.cur"
    response = second.request("GET", cursor, headers=headers)
    assert response.status == 200
    assert response.body.startswith(b"\x00\x00\x02\x00")
    assert response.headers["cache-control"] == "private, no-store"
    head = second.request("HEAD", cursor, headers=headers)
    assert head.status == 200 and head.body == b""

    body, multipart = _multipart(_png(), 32, 0, 0)
    convert_path = f"{PREFIX}/studio/convert"
    error_code(
        second.request(
            "POST", convert_path, body, headers | multipart | {"X-CSRF-Token": ""}
        ),
        403,
        "CSRF_FAILED",
    )
    convert = second.request("POST", convert_path, body, headers | multipart)
    assert convert.status == 200
    assert convert.body.startswith(b"\x00\x00\x02\x00")

    share_path = f"{PREFIX}/studio/share"
    payload = {
        "title": "U08 disposable mix",
        "config": {
            "version": 1,
            "roles": {"pointer": {"pack_id": pack_id, "role_type": "pointer"}},
        },
    }
    share = first.request(
        "POST",
        share_path,
        json.dumps(payload).encode(),
        {**headers, "Content-Type": "application/json"},
    )
    assert share.status == 201
    code = _object(share.json())["share_code"]
    share_url = f"{share_path}/{code}"
    error_code(first.request("GET", share_url, headers=ORIGIN), 401, "AUTH_REQUIRED")
    assert second.request("GET", share_url, headers=headers).status == 200
    error_code(
        second.request("GET", f"{share_path}/invalid!", headers=headers),
        404,
        "SHARE_NOT_FOUND",
    )
    now = datetime.now(UTC).replace(tzinfo=None)
    async with db.begin() as connection:
        await connection.execute(
            update(CustomCreation)
            .where(CustomCreation.share_code == code)
            .values(
                created_at=now - timedelta(days=91), expires_at=now - timedelta(days=1)
            )
        )
    error_code(second.request("GET", share_url, headers=headers), 410, "SHARE_EXPIRED")
    async with db.begin() as connection:
        await connection.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id)
            .values(last_seen_at=now - timedelta(minutes=31))
        )
    error_code(
        second.request("GET", f"{PREFIX}/auth/me", headers=headers),
        401,
        "AUTH_REQUIRED",
    )
    fresh_login = auth_post(first, "login", credentials)
    assert fresh_login.status == 200
    fresh_headers = {
        **ORIGIN,
        "Cookie": fresh_login.headers["set-cookie"].split(";", 1)[0],
    }
    async with db.begin() as connection:
        await connection.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id)
            .values(expires_at=now - timedelta(seconds=1))
        )
    error_code(
        second.request("GET", f"{PREFIX}/auth/me", headers=fresh_headers),
        401,
        "AUTH_REQUIRED",
    )
