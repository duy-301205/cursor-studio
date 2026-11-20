"""Admin pack contracts, transaction failures, and public lifecycle regression."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from os import utime
from pathlib import Path
from typing import cast
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest
from conftest import (
    AdminAccount,
    AdminTokens,
    ApiClient,
    Reply,
    admin_error,
    admin_json,
    admin_tokens,
)
from PIL import Image
from sqlalchemy import event, func, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from starlette.requests import Request

from app.api.deps.admin import AuthProblem
from app.api.v1.admin_assets import _save
from app.api.v1.admin_packs import _run_validation
from app.core.config import Settings
from app.models.admin_user import AdminAsset, AdminPackState, AssetKind
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack, PackStatus
from app.services.admin_assets import (
    AssetBytes,
    InvalidAsset,
    LocalPrivateAssets,
    asset_key,
    validate_asset,
)
from app.services.cur_encoder import encode_cur
from app.services.inf_builder import LEGACY_ROLE_FALLBACKS, REGISTRY_ROLE_ORDER
from app.services.pack_publisher import (
    capture,
    cleanup_pack_assets,
    publish_projection,
    registered_assets,
    validate_snapshot,
)
from app.services.storage import StorageError


@dataclass
class Draft:
    account: AdminAccount
    tokens: AdminTokens
    id: int
    slug: str
    tag: str

    @property
    def path(self) -> str:
        return f"/packs/{self.id}"

    def edit(
        self,
        method: str,
        suffix: str,
        payload: object | None = None,
        *,
        tag: str | None = None,
    ) -> Reply:
        return self.account.request(
            method,
            self.path + suffix,
            tokens=self.tokens,
            payload=payload,
            headers={"If-Match": self.tag if tag is None else tag},
        )

    def accept(self, reply: Reply) -> dict[str, object]:
        data = admin_json(reply, 200)
        self.tag = reply.headers["etag"]
        return data

    def upload(
        self, kind: str, content: bytes, *, filename: str = "fixture.bin"
    ) -> Reply:
        return _upload(self, kind, content, filename=filename)


def _new_draft(account: AdminAccount, tokens: AdminTokens, suffix: str = "") -> Draft:
    public = ApiClient("127.0.0.1")
    categories = public.request("GET", "/api/v1/categories").json()
    assert isinstance(categories, list) and categories
    slug = account.marker + suffix
    reply = account.request(
        "POST",
        "/packs",
        tokens=tokens,
        payload={
            "title": "Managed integration pack",
            "slug": slug,
            "description": "",
            "category_id": categories[0]["id"],
        },
    )
    draft = admin_json(reply, 201)
    pack_id = draft["id"]
    assert isinstance(pack_id, int)
    assert reply.headers["location"] == f"/api/v1/admin/packs/{pack_id}"
    assert draft["thumbnail_url"] is None and draft["roles"] == []
    return Draft(account, tokens, pack_id, slug, reply.headers["etag"])


def _png(raster: Image.Image) -> bytes:
    output = BytesIO()
    raster.save(output, "PNG")
    return output.getvalue()


def _raster(size: int = 32) -> Image.Image:
    raster = Image.new("RGBA", (size, size), (23, 44, 66, 0))
    raster.putpixel((3, 4), (41, 222, 202, 128))
    return raster


def _multipart(
    kind: str, data: bytes, filename: str = "fixture.bin"
) -> tuple[bytes, str]:
    boundary = uuid4().hex
    initial = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n{kind}\r\n'
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    )
    return (
        initial.encode() + data + f"\r\n--{boundary}--\r\n".encode(),
        f"multipart/form-data; boundary={boundary}",
    )


def _upload(draft: Draft, kind: str, data: bytes, *, filename: str) -> Reply:
    body, media = _multipart(kind, data, filename)
    return draft.account.request(
        "POST",
        draft.path + "/assets",
        tokens=draft.tokens,
        body=body,
        headers={"Content-Type": media, "If-Match": draft.tag},
    )


def _id(asset: dict[str, object]) -> str:
    return str(asset["asset_id"])


def _pair(cursor: dict[str, object], preview: dict[str, object]) -> dict[str, object]:
    return {
        "asset_id": _id(cursor),
        "preview_asset_id": _id(preview),
        "hotspot_x": 3,
        "hotspot_y": 4,
    }


def _key(draft: Draft, asset: dict[str, object], kind: AssetKind) -> str:
    return asset_key(draft.id, UUID(_id(asset)), kind)


def _complete(draft: Draft) -> dict[AssetKind, dict[str, object]]:
    image = _raster()
    assets = {
        AssetKind.CURSOR: admin_json(
            draft.upload("cursor", encode_cur(image, 32, 3, 4)), 201
        ),
        AssetKind.PREVIEW: admin_json(draft.upload("preview", _png(image)), 201),
        AssetKind.THUMBNAIL: admin_json(draft.upload("thumbnail", _png(image)), 201),
    }
    draft.accept(
        draft.edit(
            "PATCH", "", {"thumbnail_asset_id": _id(assets[AssetKind.THUMBNAIL])}
        )
    )
    for role in CursorRole:
        draft.accept(
            draft.edit(
                "PUT",
                f"/roles/{role.value}",
                _pair(assets[AssetKind.CURSOR], assets[AssetKind.PREVIEW]),
            )
        )
    return assets


def test_admin_mutations_require_auth_and_csrf(admin_account: AdminAccount) -> None:
    tokens = admin_tokens(admin_account.login())
    draft = _new_draft(admin_account, tokens)
    routes = [
        ("POST", "/packs"),
        ("PATCH", draft.path),
        ("POST", draft.path + "/assets"),
        ("PUT", draft.path + "/roles/pointer"),
        ("POST", draft.path + "/validate"),
        ("POST", draft.path + "/publish"),
        ("POST", draft.path + "/unpublish"),
    ]
    for method, path in routes:
        admin_error(admin_account.request(method, path), 401, "AUTH_REQUIRED")
        admin_error(
            admin_account.request(method, path, tokens=AdminTokens(tokens.cookie, "")),
            403,
            "CSRF_FAILED",
        )
    admin_error(admin_account.request("GET", draft.path), 401, "AUTH_REQUIRED")
    admin_error(admin_account.request("GET", "/packs"), 401, "AUTH_REQUIRED")
    admin_error(
        admin_account.request(
            "PATCH",
            draft.path,
            tokens=tokens,
            payload={"title": "Missing tag"},
        ),
        428,
        "PRECONDITION_REQUIRED",
    )
    tag = draft.tag
    changed = draft.accept(draft.edit("PATCH", "", {"title": "Changed"}))
    assert changed["title"] == "Changed"
    admin_error(
        draft.edit("PATCH", "", {"title": "Stale"}, tag=tag), 409, "REVISION_CONFLICT"
    )
    admin_error(
        draft.edit("PATCH", "", {"status": "published"}), 422, "VALIDATION_ERROR"
    )


def test_upload_limits_and_role_asset_integrity(admin_account: AdminAccount) -> None:
    tokens = admin_tokens(admin_account.login())
    draft = _new_draft(admin_account, tokens)
    other = _new_draft(admin_account, tokens, "-other")
    image = _raster()
    preview_png = _png(image)
    good_cur = encode_cur(image, 32, 3, 4)
    cases = (
        ("preview", b"GIF89a", 415, "UNSUPPORTED_MEDIA_TYPE"),
        ("preview", preview_png[:-4], 415, "UNSUPPORTED_MEDIA_TYPE"),
        ("preview", preview_png + b"<html>", 415, "UNSUPPORTED_MEDIA_TYPE"),
        ("preview", b"x" * (2 * 1024 * 1024 + 1), 413, "PAYLOAD_TOO_LARGE"),
        ("cursor", good_cur[:-1], 415, "UNSUPPORTED_MEDIA_TYPE"),
        (
            "cursor",
            good_cur[:-1] + bytes([good_cur[-1] ^ 1]),
            415,
            "UNSUPPORTED_MEDIA_TYPE",
        ),
        (
            "thumbnail",
            _png(Image.new("1", (4000, 3001))),
            415,
            "UNSUPPORTED_MEDIA_TYPE",
        ),
    )
    for kind, payload, status, code in cases:
        admin_error(draft.upload(kind, payload), status, code)
    cursor = admin_json(draft.upload("cursor", good_cur), 201)
    preview = admin_json(
        draft.upload("preview", preview_png, filename="../../asset.png"), 201
    )
    foreign = admin_json(other.upload("preview", preview_png), 201)
    different = admin_json(draft.upload("preview", _png(_raster(48))), 201)
    modified = image.copy()
    modified.putpixel((3, 4), (41, 222, 202, 127))
    different_alpha = admin_json(draft.upload("preview", _png(modified)), 201)
    content_path = str(preview["content_url"]).removeprefix("/api/v1/admin")
    assert "storage_key" not in preview and cursor["content_url"] is None
    assert admin_account.request("GET", content_path, tokens=tokens).status == 200
    admin_error(admin_account.request("GET", content_path), 401, "AUTH_REQUIRED")
    admin_error(
        admin_account.request(
            "GET", content_path.replace(draft.path, other.path), tokens=tokens
        ),
        404,
        "NOT_FOUND",
    )
    for variant, outcome, code in (
        ({"preview_asset_id": _id(foreign)}, 404, "NOT_FOUND"),
        ({"preview_asset_id": _id(different)}, 422, "VALIDATION_ERROR"),
        ({"preview_asset_id": _id(different_alpha)}, 422, "VALIDATION_ERROR"),
        ({"preview_asset_id": _id(cursor)}, 422, "VALIDATION_ERROR"),
        ({"hotspot_x": 32}, 422, "VALIDATION_ERROR"),
        ({"hotspot_x": True}, 422, "VALIDATION_ERROR"),
    ):
        admin_error(
            draft.edit("PUT", "/roles/pointer", {**_pair(cursor, preview), **variant}),
            outcome,
            code,
        )
    body = draft.accept(draft.edit("PUT", "/roles/pointer", _pair(cursor, preview)))
    assert len(cast(list[object], body["roles"])) == 1


@pytest.mark.asyncio
async def test_publish_lifecycle_preserves_public_contracts(
    admin_account: AdminAccount, db: AsyncEngine
) -> None:
    tokens = admin_tokens(admin_account.login())
    draft = _new_draft(admin_account, tokens)
    public = ApiClient("127.0.0.1")
    before = admin_json(draft.edit("POST", "/validate"), 200)
    assert not before["valid"]
    assert set(cast(list[str], before["missing_roles"])) == set(CursorRole)
    assets = _complete(draft)
    location_data = encode_cur(_raster(), 32, 5, 6)
    location = admin_json(draft.upload("cursor", location_data), 201)
    draft.accept(
        draft.edit(
            "PUT",
            "/roles/location",
            {
                **_pair(location, assets[AssetKind.PREVIEW]),
                "hotspot_x": 5,
                "hotspot_y": 6,
            },
        )
    )
    urls = {
        kind: "/static/samples/" + _key(draft, asset, kind)
        for kind, asset in assets.items()
    }
    for path in urls.values():
        response = public.request("GET", path)
        assert (
            response.status == 404
            and response.headers["cdn-cache-control"] == "no-store"
        )
        assert public.request("HEAD", path).status == 404
    assert admin_json(draft.edit("POST", "/validate"), 200)["valid"] is True
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: draft.edit("POST", "/publish"), range(2)))
    assert sorted(reply.status for reply in outcomes) == [200, 409]
    draft.accept(next(reply for reply in outcomes if reply.status == 200))
    detail_path = f"/api/v1/packs/{draft.slug}"
    original = admin_json(public.request("GET", detail_path), 200)
    assert original["download_count"] == 0
    gallery = admin_json(public.request("GET", "/api/v1/packs"), 200)
    assert draft.id in {
        card["id"] for card in cast(list[dict[str, object]], gallery["items"])
    }
    for path in urls.values():
        body = public.request("GET", path)
        head = public.request("HEAD", path)
        assert body.status == head.status == 200 and head.body == b""
        assert int(head.headers["content-length"]) == len(body.body)
        assert all(
            body.headers[name] == "no-store"
            for name in (
                "cache-control",
                "cdn-cache-control",
                "cloudflare-cdn-cache-control",
            )
        )

    share = admin_json(
        public.post_json(
            "/api/v1/studio/share",
            {
                "title": f"{admin_account.marker} share",
                "config": {
                    "version": 1,
                    "roles": {"pointer": {"pack_id": draft.id, "role_type": "pointer"}},
                },
            },
        ),
        201,
    )
    share_path = f"/api/v1/studio/share/{share['share_code']}"
    assert public.request("GET", share_path).status == 200
    download = f"/api/v1/packs/{draft.id}/download"
    binary = public.request("GET", download)
    assert binary.status == 200
    with ZipFile(BytesIO(binary.body)) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == 11
        assert archive.read(f"{draft.slug}/location.cur") == location_data
        inf = archive.read(f"{draft.slug}/Install.inf").decode("ascii")
        scheme = inf.split("[CursorScheme]\r\n", 1)[1].splitlines()[0]
        paths = scheme.rsplit(',"', 1)[1].removesuffix('"').split(",")
        assert [path.rsplit("\\", 1)[-1] for path in paths] == [
            f"{LEGACY_ROLE_FALLBACKS.get(role, role) if role != 'location' else role}.cur"
            for _, role in REGISTRY_ROLE_ORDER
        ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: draft.edit("POST", "/unpublish"), range(2)))
    assert sorted(reply.status for reply in outcomes) == [200, 409]
    draft.accept(next(reply for reply in outcomes if reply.status == 200))
    assert public.request("GET", share_path).status == 410
    assert (
        public.request("GET", detail_path).status
        == public.request("GET", download).status
        == 404
    )
    for path in urls.values():
        for method in ("GET", "HEAD"):
            reply = public.request(method, path)
            assert (
                reply.status == 404 and reply.headers["cdn-cache-control"] == "no-store"
            )
    draft.accept(draft.edit("POST", "/publish"))
    restored = admin_json(public.request("GET", detail_path), 200)
    assert (
        restored["download_count"] == 1
        and restored["cursor_items"] == original["cursor_items"]
    )
    assert public.request("GET", share_path).status == 200

    async with db.connect() as connection:
        assert await connection.scalar(
            select(func.count())
            .select_from(CursorItem)
            .where(CursorItem.pack_id == draft.id)
        ) == len(CursorRole)


class _WriteFailsAfterPut(LocalPrivateAssets):
    async def put(self, key: str, asset: AssetBytes) -> None:
        await super().put(key, asset)
        raise StorageError("injected acknowledgement loss")


class _ReadUnavailable:
    async def read(self, key: str, *, max_bytes: int) -> bytes:
        raise StorageError("injected timeout")


@pytest.mark.asyncio
async def test_faults_roll_back_registry_and_public_projection(
    admin_account: AdminAccount,
    db: AsyncEngine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    integration_settings: Settings,
) -> None:
    draft = _new_draft(admin_account, admin_tokens(admin_account.login()))
    request = Request(
        {
            "type": "http",
            "headers": [(b"if-match", draft.tag.encode())],
            "state": {"admin_request_id": "a09-fault-fixture"},
        }
    )
    factory = async_sessionmaker(db, expire_on_commit=False)
    image = _png(_raster())

    for mode in ("write", "commit"):
        root = tmp_path / mode
        storage = (
            _WriteFailsAfterPut(root) if mode == "write" else LocalPrivateAssets(root)
        )
        async with factory() as session:
            injected = False

            def fail_commit(sync_session: object, directory: Path = root) -> None:
                nonlocal injected
                if not injected and any(directory.rglob("*.png")):
                    injected = True
                    raise RuntimeError("injected commit failure")

            if mode == "commit":
                event.listen(session.sync_session, "before_commit", fail_commit)
            with monkeypatch.context() as overrides:
                overrides.setattr(
                    "app.api.v1.admin_assets.private_storage",
                    lambda _, backend=storage: backend,
                )
                with pytest.raises(StorageError if mode == "write" else RuntimeError):
                    await _save(
                        session,
                        request,
                        draft.id,
                        admin_account.id,
                        AssetKind.PREVIEW,
                        image,
                    )
            assert not list(root.rglob("*.png"))
            async with session.begin():
                assert (
                    await session.scalar(
                        select(func.count())
                        .select_from(AdminAsset)
                        .where(AdminAsset.pack_id == draft.id)
                    )
                    == 0
                )

    completed = _complete(draft)
    key = _key(draft, completed[AssetKind.PREVIEW], AssetKind.PREVIEW)
    stored = admin_account.private_root / key
    original = stored.read_bytes()
    stored.unlink()
    missing = admin_json(draft.edit("POST", "/validate"), 200)
    assert missing["valid"] is False
    assert {
        item["code"] for item in cast(list[dict[str, object]], missing["errors"])
    } == {"ASSET_MISSING"}
    stored.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
    corrupt = admin_json(draft.edit("POST", "/validate"), 200)
    assert corrupt["valid"] is False
    assert {
        item["code"] for item in cast(list[dict[str, object]], corrupt["errors"])
    } == {"INVALID_ASSET"}
    invalid = draft.edit("POST", "/publish")
    admin_error(invalid, 422, "PACK_INVALID")
    details = cast(dict[str, object], admin_json(invalid, 422)["error"])["details"]
    assert len(cast(list[object], details)) == len(CursorRole)
    stored.write_bytes(original)
    async with factory() as session:
        async with session.begin():
            row = await session.get(CursorPack, draft.id)
            state = await session.get(AdminPackState, draft.id)
            assert row is not None and state is not None
            snapshot = await capture(session, row, state)
            assets = await registered_assets(session, snapshot)
        with monkeypatch.context() as overrides:
            overrides.setattr(
                "app.services.pack_publisher.private_storage",
                lambda _: _ReadUnavailable(),
            )
            with pytest.raises(AuthProblem) as failure:
                await _run_validation(snapshot, assets, True)
            assert (failure.value.status, failure.value.code) == (
                503,
                "STORAGE_UNAVAILABLE",
            )
        result = await validate_snapshot(snapshot, assets, True, integration_settings)
        assert result.report.valid
        with pytest.raises(RuntimeError, match="injected publish"):
            async with session.begin():
                pack = await session.get(CursorPack, draft.id, with_for_update=True)
                assert pack is not None
                await publish_projection(session, pack, result)
                await session.flush()
                raise RuntimeError("injected publish write failure")
        async with session.begin():
            saved = await session.get(CursorPack, draft.id)
            assert (
                saved is not None
                and saved.status == PackStatus.DRAFT
                and saved.download_count == 0
            )
            assert (
                await session.scalar(
                    select(func.count())
                    .select_from(CursorItem)
                    .where(CursorItem.pack_id == draft.id)
                )
                == 0
            )


@pytest.mark.asyncio
async def test_cleanup_reconciles_only_old_unbound_assets(
    admin_account: AdminAccount, db: AsyncEngine
) -> None:
    draft = _new_draft(admin_account, admin_tokens(admin_account.login()))
    image = _png(_raster())
    unbound = admin_json(draft.upload("preview", image), 201)
    recent = admin_json(draft.upload("preview", image), 201)
    thumbnail = admin_json(draft.upload("thumbnail", image), 201)
    draft.accept(draft.edit("PATCH", "", {"thumbnail_asset_id": _id(thumbnail)}))
    unbound_key = _key(draft, unbound, AssetKind.PREVIEW)
    thumb_key = _key(draft, thumbnail, AssetKind.THUMBNAIL)
    recent_path = admin_account.private_root / _key(draft, recent, AssetKind.PREVIEW)
    orphan_key = asset_key(draft.id, uuid4(), AssetKind.PREVIEW)
    storage = LocalPrivateAssets(admin_account.private_root)
    await storage.put(orphan_key, await validate_asset(AssetKind.PREVIEW, image))
    old = datetime.now(UTC) - timedelta(days=2)
    for key in (unbound_key, thumb_key, orphan_key):
        utime(admin_account.private_root / key, (old.timestamp(), old.timestamp()))
    async with db.begin() as connection:
        await connection.execute(
            update(AdminAsset)
            .where(AdminAsset.storage_key.in_([unbound_key, thumb_key]))
            .values(created_at=old.replace(tzinfo=None))
        )
    factory = async_sessionmaker(db, expire_on_commit=False)
    async with factory() as session:
        assert (
            await cleanup_pack_assets(
                session, storage, draft.id, request_id="a09-cleanup-fixture"
            )
            == 2
        )
    assert (admin_account.private_root / thumb_key).is_file() and recent_path.is_file()
    assert not (admin_account.private_root / orphan_key).exists()
    assert not (admin_account.private_root / unbound_key).exists()


@pytest.mark.asyncio
async def test_cursor_validator_rejects_mismatched_alpha_mask() -> None:
    data = bytearray(encode_cur(_raster(), 32, 3, 4))
    data[-1] ^= 1
    with pytest.raises(InvalidAsset, match="mask"):
        await validate_asset(AssetKind.CURSOR, bytes(data))
