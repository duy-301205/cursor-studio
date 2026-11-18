"""Fixtures for HTTP tests in a disposable Compose project."""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import subprocess
from collections.abc import AsyncIterator
from dataclasses import dataclass
from http.client import HTTPConnection
from itertools import count
from pathlib import Path
from time import monotonic, sleep
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.db.session import create_engine
from app.models.admin_user import AdminAsset, AdminPackRole, AdminPackState, AdminUser
from app.models.category import Category
from app.models.cursor_pack import CursorPack, PackStatus
from app.models.custom_creation import CustomCreation
from app.services.admin_assets import LocalPrivateAssets

_peers = count(10)


@dataclass(frozen=True)
class Reply:
    status: int
    headers: dict[str, str]
    body: bytes

    def json(self) -> object:
        result: object = json.loads(self.body)
        return result


@dataclass(frozen=True)
class ApiClient:
    peer_ip: str
    port: int = 8000

    def request(
        self,
        method: str,
        path: str,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> Reply:
        connection = HTTPConnection(
            "127.0.0.1", self.port, timeout=15, source_address=(self.peer_ip, 0)
        )
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return Reply(
                response.status,
                {key.lower(): value for key, value in response.getheaders()},
                response.read(),
            )
        finally:
            connection.close()

    def post_json(self, path: str, payload: object) -> Reply:
        return self.request(
            "POST",
            path,
            json.dumps(payload).encode(),
            {"Content-Type": "application/json"},
        )


@pytest.fixture(scope="session")
def integration_settings() -> Settings:
    if os.environ.get("CCS_RUN_MYSQL_INTEGRATION") != "1":
        pytest.skip("Set CCS_RUN_MYSQL_INTEGRATION=1 in a disposable Compose backend")
    settings = Settings.model_validate({})
    if (
        settings.app_env != "development"
        or settings.storage_backend != "local"
        or not settings.auto_seed
        or settings.database_host != "db"
        or not settings.database_name.startswith("ccs_test_")
        or str(settings.public_api_base_url).rstrip("/") != "http://localhost:8000"
    ):
        pytest.fail(
            "Integration requires dev seed, local assets and a ccs_test_* MySQL database"
        )
    client = ApiClient("127.0.0.2")
    deadline = monotonic() + 60
    while monotonic() < deadline:
        try:
            if client.request("GET", "/health/ready").status == 200:
                return settings
        except OSError:
            pass
        sleep(1)
    pytest.fail("Backend did not become ready")


@pytest.fixture
def api(integration_settings: Settings) -> ApiClient:
    return ApiClient(f"127.0.0.{next(_peers)}")


@pytest_asyncio.fixture
async def db(integration_settings: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(integration_settings)
    try:
        yield engine
    finally:
        await engine.dispose()


@dataclass(frozen=True)
class DraftPack:
    id: int
    slug: str


@pytest_asyncio.fixture
async def draft_pack(db: AsyncEngine) -> AsyncIterator[DraftPack]:
    slug = f"integration-draft-{uuid4().hex}"
    async with db.begin() as connection:
        category_id = (
            await connection.execute(
                select(Category.id).where(Category.slug == "minimal")
            )
        ).scalar_one()
        await connection.execute(
            insert(CursorPack).values(
                category_id=category_id,
                title="Integration draft",
                slug=slug,
                description="Disposable test pack",
                thumbnail_url="http://localhost:8000/static/samples/sample-minimal/thumbnail.webp",
                status=PackStatus.DRAFT,
            )
        )
        pack_id = (
            await connection.execute(
                select(CursorPack.id).where(CursorPack.slug == slug)
            )
        ).scalar_one()
    try:
        yield DraftPack(pack_id, slug)
    finally:
        async with db.begin() as connection:
            await connection.execute(delete(CursorPack).where(CursorPack.id == pack_id))


ADMIN_PREFIX = "/api/v1/admin"
ADMIN_ORIGIN = "https://localhost"


@dataclass(frozen=True)
class AdminTokens:
    cookie: str
    csrf: str


@dataclass(frozen=True)
class AdminAccount:
    id: int
    username: str
    password: str
    marker: str
    private_root: Path

    def request(
        self,
        method: str,
        path: str,
        *,
        tokens: AdminTokens | None = None,
        payload: object | None = None,
        body: bytes | None = None,
        port: int = 8000,
        peer: str = "127.0.0.1",
        forwarded: str | None = None,
        origin: str | None = ADMIN_ORIGIN,
        headers: dict[str, str] | None = None,
    ) -> Reply:
        request_headers = {"Host": "localhost", "X-Forwarded-Proto": "https"}
        if origin is not None:
            request_headers["Origin"] = origin
        if forwarded is not None:
            request_headers["X-Forwarded-For"] = forwarded
        if tokens is not None:
            request_headers.update(
                {"Cookie": tokens.cookie, "X-CSRF-Token": tokens.csrf}
            )
        if payload is not None:
            request_headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode()
        request_headers.update(headers or {})
        return ApiClient(peer, port).request(
            method, ADMIN_PREFIX + path, body, request_headers
        )

    def login(self, *, port: int = 8000, tokens: AdminTokens | None = None) -> Reply:
        return self.request(
            "POST",
            "/auth/login",
            port=port,
            tokens=tokens,
            payload={"username": self.username, "password": self.password},
        )


def admin_json(reply: Reply, status: int) -> dict[str, object]:
    assert reply.status == status
    result = reply.json()
    assert isinstance(result, dict)
    return result


def admin_error(reply: Reply, status: int, code: str) -> None:
    result = admin_json(reply, status)
    error = result["error"]
    assert isinstance(error, dict)
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code
    assert error["request_id"] == reply.headers["x-request-id"]
    assert reply.headers["cache-control"] == "no-store"
    assert reply.headers["x-content-type-options"] == "nosniff"


def admin_tokens(reply: Reply) -> AdminTokens:
    result = admin_json(reply, 200)
    csrf = result["csrf_token"]
    assert isinstance(csrf, str)
    return AdminTokens(reply.headers["set-cookie"].split(";", 1)[0], csrf)


@pytest.fixture(scope="session")
def admin_private_root(integration_settings: Settings) -> Path:
    if os.environ.get("CCS_RUN_ADMIN_INTEGRATION") != "1":
        pytest.skip("Set CCS_RUN_ADMIN_INTEGRATION=1 for the two-worker Admin suite")
    root = Path(os.environ.get("ADMIN_ASSET_LOCAL_ROOT", ""))
    if not root.is_absolute() or not os.environ.get("CCS_ADMIN_TEST_LOGS"):
        pytest.fail(
            "Admin integration needs a disposable private root and worker log paths"
        )
    headers = {"Host": "localhost", "X-Forwarded-Proto": "https"}
    for port in (8000, 8001):
        deadline = monotonic() + 60
        while monotonic() < deadline:
            try:
                reply = ApiClient("127.0.0.1", port).request(
                    "GET", ADMIN_PREFIX + "/auth/me", headers=headers
                )
            except OSError:
                sleep(0.5)
                continue
            assert reply.status == 401, (
                f"Admin test worker {port} is not configured for HTTPS proxy requests"
            )
            break
        else:
            pytest.fail(f"Admin test worker {port} did not start")
    return root


@pytest_asyncio.fixture
async def admin_account(
    db: AsyncEngine, admin_private_root: Path
) -> AsyncIterator[AdminAccount]:
    marker = "admin-it-" + uuid4().hex
    username = "test." + uuid4().hex
    password = secrets.token_urlsafe(30)
    created = await asyncio.to_thread(
        subprocess.run,
        [
            "python",
            "-m",
            "app.cli.create_admin",
            "create",
            username,
            "--password-stdin",
        ],
        input=f"{password}\n",
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert created.returncode == 0, created.stderr
    assert password not in created.stdout + created.stderr
    async with db.connect() as connection:
        admin_id = (
            await connection.execute(
                select(AdminUser.id).where(AdminUser.username == username)
            )
        ).scalar_one()
    try:
        yield AdminAccount(admin_id, username, password, marker, admin_private_root)
    finally:
        async with db.begin() as connection:
            pack_ids = (
                await connection.scalars(
                    select(CursorPack.id).where(CursorPack.slug.startswith(marker))
                )
            ).all()
            keys = (
                await connection.scalars(
                    select(AdminAsset.storage_key).where(
                        AdminAsset.pack_id.in_(pack_ids)
                    )
                )
            ).all()
            await connection.execute(
                delete(CustomCreation).where(CustomCreation.title == f"{marker} share")
            )
            await connection.execute(
                delete(AdminPackRole).where(AdminPackRole.pack_id.in_(pack_ids))
            )
            await connection.execute(
                update(AdminPackState)
                .where(AdminPackState.pack_id.in_(pack_ids))
                .values(thumbnail_asset_id=None)
            )
            await connection.execute(
                delete(AdminAsset).where(AdminAsset.pack_id.in_(pack_ids))
            )
            await connection.execute(
                delete(AdminPackState).where(AdminPackState.pack_id.in_(pack_ids))
            )
            await connection.execute(
                delete(CursorPack).where(CursorPack.id.in_(pack_ids))
            )
            await connection.execute(delete(AdminUser).where(AdminUser.id == admin_id))
        store = LocalPrivateAssets(admin_private_root)
        for key in keys:
            await store.delete(key)
