"""Fixtures for HTTP tests in a disposable Compose project."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from http.client import HTTPConnection
from itertools import count
from time import monotonic, sleep
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.db.session import create_engine
from app.models.category import Category
from app.models.cursor_pack import CursorPack, PackStatus

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

    def request(
        self,
        method: str,
        path: str,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> Reply:
        connection = HTTPConnection(
            "127.0.0.1", 8000, timeout=15, source_address=(self.peer_ip, 0)
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
