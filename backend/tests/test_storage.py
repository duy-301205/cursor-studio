"""Storage policy and failure handling without a live R2 account."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ReadTimeoutError  # type: ignore[import-untyped]
from PIL import Image

from app.core.config import Settings
from app.services.cur_encoder import encode_cur, inspect_cur_header
from app.services.storage import (
    MAX_ASSET_BYTES,
    AssetTooLarge,
    InvalidAssetLocation,
    LocalStorage,
    R2Storage,
    StorageError,
    create_storage,
)

LOCAL = "http://localhost:8000/static/samples"
CDN = "https://cdn.example.test/cursors"


@pytest.mark.asyncio
async def test_read_sample_cur_by_validated_url(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path, LOCAL)
    filename = "Sample Pack/pointer.cur"
    path = tmp_path / filename
    path.parent.mkdir()
    binary = encode_cur(Image.new("RGBA", (32, 32), "red"), 32, 0, 0)
    path.write_bytes(binary)
    url = storage.public_url(filename)
    assert url == f"{LOCAL}/Sample%20Pack/pointer.cur"
    data = await storage.read_asset(url, max_bytes=len(binary))
    assert data == binary and inspect_cur_header(data) == (32, 32, 0, 0)


@pytest.mark.parametrize(
    "suffix",
    [
        "../outside.cur",
        "%2e%2e/outside.cur",
        "%252e%252e/outside.cur",
        "..%20/outside.cur",
        "sub%2Ffile.cur",
        "%5Coutside.cur",
        "C:/outside.cur",
        "/outside.cur",
        "item.cur?secret=value",
        "item.cur#fragment",
        "item.cur%00",
        "item.cur%FF",
    ],
)
@pytest.mark.asyncio
async def test_invalid_urls_fail_before_read(tmp_path: Path, suffix: str) -> None:
    client = Mock()
    for storage, base in (
        (LocalStorage(tmp_path, LOCAL), LOCAL),
        (R2Storage(client, "test-bucket", CDN), CDN),
    ):
        with pytest.raises(InvalidAssetLocation):
            await storage.read_asset(f"{base}/{suffix}", max_bytes=100)
    client.get_object.assert_not_called()


@pytest.mark.parametrize(
    "url",
    [
        "https://external.test/cursors/pointer.cur",
        "https://cdn.example.test.evil.test/cursors/pointer.cur",
        "https://cdn.example.test@external.test/cursors/pointer.cur",
        "https://cdn.example.test/cursors-backup/pointer.cur",
        "http://cdn.example.test/cursors/pointer.cur",
    ],
)
@pytest.mark.asyncio
async def test_r2_rejects_unconfigured_origins_and_prefixes(url: str) -> None:
    client = Mock()
    storage = R2Storage(client, "test-bucket", CDN)
    with pytest.raises(InvalidAssetLocation):
        await storage.read_asset(url, max_bytes=100)
    client.get_object.assert_not_called()


@pytest.mark.asyncio
async def test_local_rejects_symlink_escape_and_external_domain(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    root.mkdir()
    private = tmp_path / "private.cur"
    private.write_bytes(b"private")
    (root / "escape.cur").symlink_to(private)
    storage = LocalStorage(root, LOCAL)
    with pytest.raises(InvalidAssetLocation):
        await storage.read_asset(storage.public_url("escape.cur"), max_bytes=100)
    with pytest.raises(InvalidAssetLocation):
        await storage.read_asset(
            "http://evil.test/static/samples/escape.cur", max_bytes=100
        )
    with pytest.raises(InvalidAssetLocation):
        storage.public_url("../private.cur")


@pytest.mark.asyncio
async def test_local_reads_are_bounded(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path, LOCAL)
    path = tmp_path / "file.cur"
    path.write_bytes(b"12345")
    with pytest.raises(AssetTooLarge):
        await storage.read_asset(storage.public_url("file.cur"), max_bytes=4)
    with pytest.raises(StorageError, match="byte budget"):
        await storage.read_asset(
            storage.public_url("file.cur"), max_bytes=MAX_ASSET_BYTES + 1
        )
    with pytest.raises(StorageError, match="Unable to read local asset"):
        await storage.read_asset(storage.public_url("missing.cur"), max_bytes=4)


@pytest.mark.asyncio
async def test_r2_uses_fixed_bucket_and_reads_at_most_budget_plus_one() -> None:
    body = Mock(wraps=BytesIO(b"CUR"))
    client = Mock()
    client.get_object.return_value = {"Body": body, "ContentLength": 3}
    storage = R2Storage(client, "test-bucket", CDN)
    url = storage.public_url("sample/pointer.cur")
    assert url == f"{CDN}/sample/pointer.cur"
    assert await storage.read_asset(url, max_bytes=3) == b"CUR"
    client.get_object.assert_called_once_with(
        Bucket="test-bucket", Key="sample/pointer.cur"
    )
    body.read.assert_called_once_with(4)
    body.close.assert_called_once()


@pytest.mark.parametrize("announced_size", [3, 10])
@pytest.mark.asyncio
async def test_r2_rejects_oversized_payload_and_closes_stream(
    announced_size: int,
) -> None:
    body = Mock(wraps=BytesIO(b"0123456789"))
    client = Mock()
    client.get_object.return_value = {"Body": body, "ContentLength": announced_size}
    storage = R2Storage(client, "test-bucket", CDN)
    with pytest.raises(AssetTooLarge):
        await storage.read_asset(storage.public_url("file.cur"), max_bytes=3)
    if announced_size > 3:
        body.read.assert_not_called()
    else:
        body.read.assert_called_once_with(4)
    body.close.assert_called_once()


@pytest.mark.asyncio
async def test_r2_timeout_is_sanitized_and_closes_stream(
    caplog: pytest.LogCaptureFixture,
) -> None:
    secret = "t10-sensitive-test-value"
    body = Mock()
    body.read.side_effect = ReadTimeoutError(
        endpoint_url=f"https://r2.example.test/{secret}"
    )
    client = Mock()
    client.get_object.return_value = {"Body": body, "ContentLength": 3}
    storage = R2Storage(client, "test-bucket", CDN)
    url = storage.public_url("file.cur")
    with pytest.raises(StorageError, match="timed out") as error:
        await storage.read_asset(url, max_bytes=10)
    assert error.value.__suppress_context__
    assert (
        secret not in str(error.value)
        and secret not in url
        and secret not in caplog.text
    )
    body.close.assert_called_once()


def test_r2_factory_passes_credentials_only_to_fixed_sdk_client() -> None:
    settings = Settings.model_validate(
        {
            "DATABASE_NAME": "test",
            "DATABASE_USER": "test",
            "DATABASE_PASSWORD": "unused",
            "storage_backend": "r2",
            "r2_endpoint": "https://account.r2.example.test",
            "r2_bucket": "test-bucket",
            "r2_access_key_id": "test-key",
            "r2_secret_access_key": "test-secret",
            "public_cdn_base_url": CDN,
        }
    )
    with patch("app.services.storage.boto3.client") as make_client:
        storage = create_storage(settings)
    assert make_client.call_args.args == ("s3",)
    options = make_client.call_args.kwargs
    assert options["endpoint_url"] == "https://account.r2.example.test"
    assert options["aws_access_key_id"] == "test-key"
    assert options["aws_secret_access_key"] == "test-secret"
    assert options["config"].connect_timeout == 3
    assert options["config"].read_timeout == 5
    assert storage.public_url("file.cur") == f"{CDN}/file.cur"
