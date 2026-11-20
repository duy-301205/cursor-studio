"""Exercise all seven API contracts over HTTP on seeded MySQL."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import PurePosixPath
from typing import cast
from urllib.parse import urlsplit
from zipfile import ZipFile

import pytest
from conftest import ApiClient, DraftPack, Reply
from PIL import Image
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.db.seed import SAMPLES_DIRECTORY, seed_development
from app.models.category import Category
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack
from app.models.custom_creation import CustomCreation
from app.services.cur_encoder import inspect_cur_header
from app.services.inf_builder import REQUIRED_ROLES

PREFIX = "/api/v1"
SHARE = f"{PREFIX}/studio/share"
ROLES = [role.value for role in CursorRole]


def _object(value: object) -> dict[str, object]:
    assert isinstance(value, dict)
    return cast("dict[str, object]", value)


def _objects(value: object) -> list[dict[str, object]]:
    assert isinstance(value, list)
    return [_object(item) for item in value]


def _error(reply: Reply, status: int, code: str) -> None:
    assert reply.status == status
    body = _object(reply.json())
    assert set(body) == {"error"}
    error = _object(body["error"])
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code
    assert error["request_id"] == reply.headers["x-request-id"]
    assert reply.headers["cache-control"] == "no-store"


async def _pack_id(db: AsyncEngine, slug: str = "sample-minimal") -> int:
    async with db.connect() as connection:
        return (
            await connection.execute(
                select(CursorPack.id).where(CursorPack.slug == slug)
            )
        ).scalar_one()


async def _downloads(db: AsyncEngine, pack_id: int) -> int:
    async with db.connect() as connection:
        return (
            await connection.execute(
                select(CursorPack.download_count).where(CursorPack.id == pack_id)
            )
        ).scalar_one()


def _multipart(data: bytes, size: int, x: int, y: int) -> tuple[bytes, dict[str, str]]:
    boundary = "ccs-integration-boundary"
    fields = b"".join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        for key, value in (("size", size), ("hotspot_x", x), ("hotspot_y", y))
    )
    file_header = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="input.png"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode()
    return (
        fields + file_header + data + f"\r\n--{boundary}--\r\n".encode(),
        {"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )


def _png() -> bytes:
    with BytesIO() as output:
        Image.new("RGBA", (32, 16), (25, 60, 120, 128)).save(output, format="PNG")
        return output.getvalue()


def test_openapi_and_health(api: ApiClient) -> None:
    for path, status in (("/health/live", "live"), ("/health/ready", "ready")):
        response = api.request("GET", path)
        assert response.status == 200
        assert response.json() == {"status": status}
    response = api.request("GET", "/openapi.json")
    assert response.status == 200
    paths = _object(_object(response.json())["paths"])
    expected = {
        f"{PREFIX}/categories": "get",
        f"{PREFIX}/packs": "get",
        f"{PREFIX}/packs/{{slug}}": "get",
        f"{PREFIX}/packs/{{id}}/download": "get",
        f"{PREFIX}/studio/convert": "post",
        SHARE: "post",
        f"{SHARE}/{{code}}": "get",
    }
    assert {path: set(_object(operations)) for path, operations in paths.items()} == {
        path: {method} for path, method in expected.items()
    }


@pytest.mark.asyncio
async def test_categories_count_only_published(
    api: ApiClient, draft_pack: DraftPack
) -> None:
    response = api.request("GET", f"{PREFIX}/categories")
    assert response.status == 200
    categories = _objects(response.json())
    assert [category["slug"] for category in categories] == [
        "minimal",
        "cute-kawaii",
        "gaming",
        "anime-inspired",
        "neon-cyber",
    ]
    assert [category["pack_count"] for category in categories] == [1, 0, 0, 0, 1]
    assert response.headers["cache-control"] == "public, max-age=60"
    assert api.request("POST", f"{PREFIX}/categories").status == 405


@pytest.mark.asyncio
async def test_packs_filters_and_pagination(
    api: ApiClient, draft_pack: DraftPack
) -> None:
    response = api.request("GET", f"{PREFIX}/packs")
    assert response.status == 200
    data = _object(response.json())
    cards = _objects(data["items"])
    assert {item["slug"] for item in cards} == {"sample-minimal", "sample-neon"}
    assert all(_object(item["pointer"])["role_type"] == "pointer" for item in cards)
    assert data["pagination"] == {
        "page": 1,
        "limit": 12,
        "total": 2,
        "total_pages": 1,
        "has_next": False,
    }
    first = api.request("GET", f"{PREFIX}/packs?limit=1&page=1")
    second = api.request("GET", f"{PREFIX}/packs?limit=1&page=2")
    assert first.status == second.status == 200
    assert _object(first.json())["items"] == cards[:1]
    assert _object(second.json())["items"] == cards[1:]
    filtered = api.request(
        "GET", f"{PREFIX}/packs?category=minimal&q=%20GRAPHITE%20&sort=newest"
    )
    assert filtered.status == 200
    assert [item["slug"] for item in _objects(_object(filtered.json())["items"])] == [
        "sample-minimal"
    ]
    for query in ("page=0", "limit=49", "sort=invalid"):
        _error(api.request("GET", f"{PREFIX}/packs?{query}"), 422, "VALIDATION_ERROR")


@pytest.mark.asyncio
async def test_pack_detail_and_draft(api: ApiClient, draft_pack: DraftPack) -> None:
    response = api.request("GET", f"{PREFIX}/packs/sample-minimal")
    assert response.status == 200
    detail = _object(response.json())
    items = _objects(detail["cursor_items"])
    assert [item["role_type"] for item in items] == ROLES
    for item in items:
        assert set(item) == {
            "id",
            "role_type",
            "preview_png_url",
            "cursor_file_url",
            "hotspot_x",
            "hotspot_y",
        }
        assert all(isinstance(item[key], int) for key in ("hotspot_x", "hotspot_y"))
        for field in ("preview_png_url", "cursor_file_url"):
            url = urlsplit(str(item[field]))
            assert url.netloc == "localhost:8000"
            assert api.request("HEAD", url.path).status == 200
    _error(
        api.request("GET", f"{PREFIX}/packs/{draft_pack.slug}"), 404, "PACK_NOT_FOUND"
    )


@pytest.mark.asyncio
async def test_download_zip_and_atomic_count(
    api: ApiClient, db: AsyncEngine, draft_pack: DraftPack
) -> None:
    pack_id = await _pack_id(db)
    url = f"{PREFIX}/packs/{pack_id}/download"
    before = await _downloads(db, pack_id)
    response = api.request("GET", url)
    assert response.status == 200 and response.body.startswith(b"PK")
    assert response.headers["content-type"] == "application/zip"
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="sample-minimal-windows.zip"'
    )
    with ZipFile(BytesIO(response.body)) as archive:
        assert archive.testzip() is None
        names = {PurePosixPath(name) for name in archive.namelist()}
        assert all(name.parent == PurePosixPath("sample-minimal") for name in names)
        assets = {f"{role}.cur" for role in REQUIRED_ROLES}
        assert {name.name for name in names} == assets | {"Install.inf", "README.txt"}
        inf = archive.read("sample-minimal/Install.inf").decode("ascii")
        scheme = inf.split("[CursorScheme]\r\n", 1)[1].splitlines()[0]
        paths = scheme.rsplit(',"', 1)[1].removesuffix('"').split(",")
        assert len(paths) == 17
        assert {path.rsplit("\\", 1)[1] for path in paths} == assets
        assert paths[2].endswith(r"\working.cur") and paths[3].endswith(r"\busy.cur")
    assert await _downloads(db, pack_id) == before + 1
    replies = await asyncio.gather(
        *(asyncio.to_thread(api.request, "GET", url) for _ in range(4))
    )
    assert all(reply.status == 200 for reply in replies)
    assert await _downloads(db, pack_id) == before + 5
    _error(
        api.request("GET", f"{PREFIX}/packs/{draft_pack.id}/download"),
        404,
        "PACK_NOT_FOUND",
    )
    assert await _downloads(db, draft_pack.id) == 0


def test_convert_valid_and_rejects_spoof(api: ApiClient) -> None:
    url = f"{PREFIX}/studio/convert"
    for size, point in ((32, 0), (48, 47)):
        body, headers = _multipart(_png(), size, point, point)
        response = api.request("POST", url, body, headers)
        assert response.status == 200
        assert response.body[:4] == b"\x00\x00\x02\x00"
        assert inspect_cur_header(response.body) == (size, size, point, point)
        assert (
            response.headers["content-disposition"]
            == 'attachment; filename="custom-cursor.cur"'
        )
    for invalid in (b"<svg>malicious</svg>", b"GIF89a", b"MZ"):
        body, headers = _multipart(invalid, 32, 0, 0)
        _error(api.request("POST", url, body, headers), 415, "UNSUPPORTED_MEDIA_TYPE")
    body, headers = _multipart(_png(), 32, 32, 0)
    _error(api.request("POST", url, body, headers), 422, "INVALID_HOTSPOT")
    body, headers = _multipart(b"x" * (2 * 1024 * 1024 + 1), 32, 0, 0)
    _error(api.request("POST", url, body, headers), 413, "FILE_TOO_LARGE")


def test_convert_rate_limit_uses_peer_ip(api: ApiClient) -> None:
    url = f"{PREFIX}/studio/convert"
    body, headers = _multipart(_png(), 32, 0, 0)
    for attempt in range(11):
        response = api.request(
            "POST", url, body, {**headers, "X-Forwarded-For": f"192.0.2.{attempt + 1}"}
        )
        if attempt < 10:
            assert response.status == 200
        else:
            _error(response, 429, "RATE_LIMITED")
            assert int(response.headers["retry-after"]) > 0


@pytest.mark.asyncio
async def test_share_create_view_expiry_and_rejections(
    api: ApiClient, db: AsyncEngine, draft_pack: DraftPack
) -> None:
    pack_id = await _pack_id(db)
    config = {
        "version": 1,
        "roles": {"pointer": {"pack_id": pack_id, "role_type": "pointer"}},
    }
    response = api.post_json(SHARE, {"title": "  Test mix  ", "config": config})
    assert response.status == 201
    created = _object(response.json())
    code = str(created["share_code"])
    assert len(code) == 10 and code.isascii() and code.isalnum()
    assert str(created["share_url"]).endswith(f"/mix/{code}")
    view_url = f"{SHARE}/{code}"
    try:
        view = api.request("GET", view_url)
        assert view.status == 200
        saved = _object(view.json())
        assert saved["title"] == "Test mix" and saved["config"] == config
        assert saved["expires_at"] == created["expires_at"]
        assert _objects(saved["resolved_items"])[0]["pack_id"] == pack_id
        _error(
            api.post_json(
                SHARE,
                {
                    "title": "Draft",
                    "config": {
                        "version": 1,
                        "roles": {
                            "pointer": {
                                "pack_id": draft_pack.id,
                                "role_type": "pointer",
                            }
                        },
                    },
                },
            ),
            422,
            "INVALID_SHARE_CONFIG",
        )
        _error(
            api.post_json(
                SHARE, {"title": "Invalid", "config": {"version": 2, "roles": {}}}
            ),
            422,
            "VALIDATION_ERROR",
        )
        _error(
            api.request(
                "POST",
                SHARE,
                b" " * (8 * 1024 + 1),
                {"Content-Type": "application/json"},
            ),
            413,
            "PAYLOAD_TOO_LARGE",
        )
        now = datetime.now(UTC).replace(tzinfo=None)
        async with db.begin() as connection:
            await connection.execute(
                update(CustomCreation)
                .where(CustomCreation.share_code == code)
                .values(
                    created_at=now - timedelta(days=91),
                    expires_at=now - timedelta(days=1),
                )
            )
        _error(api.request("GET", view_url), 410, "SHARE_EXPIRED")
        _error(api.request("GET", f"{SHARE}/invalid!"), 404, "SHARE_NOT_FOUND")
    finally:
        async with db.begin() as connection:
            await connection.execute(
                delete(CustomCreation).where(CustomCreation.share_code == code)
            )


@pytest.mark.asyncio
async def test_seed_rerun_preserves_ids_and_asset_mtimes(
    api: ApiClient, db: AsyncEngine
) -> None:
    async def snapshot() -> tuple[list[list[int]], dict[str, int]]:
        async with db.connect() as connection:
            rows = [
                list((await connection.scalars(statement)).all())
                for statement in (
                    select(Category.id).order_by(Category.id),
                    select(CursorPack.id).order_by(CursorPack.id),
                    select(CursorItem.id).order_by(CursorItem.id),
                )
            ]
        files = {
            str(path.relative_to(SAMPLES_DIRECTORY)): path.stat().st_mtime_ns
            for slug in ("sample-minimal", "sample-neon")
            for path in (SAMPLES_DIRECTORY / slug).rglob("*")
            if path.is_file()
        }
        return rows, files

    before = await snapshot()
    assert [len(rows) for rows in before[0]] == [5, 2, 2 * len(ROLES)]
    assert len(before[1]) == 34
    await seed_development(async_sessionmaker(db), "http://localhost:8000")
    await seed_development(async_sessionmaker(db), "http://localhost:8000")
    assert await snapshot() == before
    assert api.request("GET", "/health/ready").status == 200
