"""Validate trusted cursor assets and assemble Windows packs in memory."""

from __future__ import annotations

import re
from collections.abc import Iterator, Mapping
from io import BytesIO
from struct import unpack_from
from unicodedata import normalize
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile

from anyio import to_thread

from app.models.cursor_item import CursorRole
from app.services.cur_encoder import inspect_cur_header
from app.services.inf_builder import (
    INSTALL_README,
    REGISTRY_ROLE_ORDER,
    build_install_inf,
)
from app.services.storage import MAX_ASSET_BYTES, Storage, StorageError

MAX_PACK_BYTES = 50 * 1024 * 1024


class PackIncomplete(Exception):
    """The pack does not have one asset per canonical role."""


class AssetUnavailable(Exception):
    """A required asset is missing, invalid or exceeds the byte budget."""


def _chunks(data: memoryview) -> Iterator[tuple[bytes, memoryview]]:
    position = 0
    while position < len(data):
        if position + 8 > len(data):
            raise AssetUnavailable("Truncated ANI chunk")
        tag, size = unpack_from("<4sI", data, position)
        start = position + 8
        end = start + size
        position = end + (size % 2)
        if position > len(data):
            raise AssetUnavailable("ANI chunk exceeds its container")
        yield tag, data[start:end]


def _validate_ani(data: bytes) -> None:
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"ACON":
        raise AssetUnavailable("Invalid ANI signature")
    if unpack_from("<I", data, 4)[0] != len(data) - 8:
        raise AssetUnavailable("Invalid ANI extent")

    declared_frames = None
    frames = None
    for tag, chunk in _chunks(memoryview(data)[12:]):
        if tag == b"anih":
            if declared_frames is not None or len(chunk) != 36:
                raise AssetUnavailable("Invalid ANI animation header")
            header_size, declared_frames, steps = unpack_from("<III", chunk)
            if header_size != 36 or not declared_frames or not steps:
                raise AssetUnavailable("Invalid ANI animation metadata")
        elif tag == b"LIST" and bytes(chunk[:4]) == b"fram":
            if frames is not None:
                raise AssetUnavailable("Duplicate ANI frame list")
            frames = 0
            for frame_tag, image in _chunks(chunk[4:]):
                if frame_tag != b"icon" or len(image) < 22:
                    raise AssetUnavailable("Invalid ANI frame")
                reserved, kind, count = unpack_from("<HHH", image)
                directory_end = 6 + count * 16
                if (
                    reserved
                    or kind not in (1, 2)
                    or not count
                    or directory_end > len(image)
                ):
                    raise AssetUnavailable("Invalid ANI frame directory")
                for entry in range(6, directory_end, 16):
                    size, offset = unpack_from("<II", image, entry + 8)
                    if not size or offset < directory_end or offset + size > len(image):
                        raise AssetUnavailable("Invalid ANI frame resource extent")
                frames += 1
    if not frames or frames != declared_frames:
        raise AssetUnavailable("ANI frame count does not match its header")


def _validate_cur(data: bytes) -> None:
    try:
        width, height, x, y = inspect_cur_header(data)
    except ValueError:
        raise AssetUnavailable("Invalid CUR directory") from None
    if width not in (32, 48) or height != width or x >= width or y >= height:
        raise AssetUnavailable("Invalid CUR dimensions or hotspot")
    header_size, dib_width, dib_height, planes, depth, compression = unpack_from(
        "<IiiHHI", data, 22
    )
    mask_stride = ((width + 31) // 32) * 4
    if (header_size, dib_width, dib_height, planes, depth, compression) != (
        40,
        width,
        height * 2,
        1,
        32,
        0,
    ) or len(data) != 62 + width * height * 4 + mask_stride * height:
        raise AssetUnavailable("Invalid CUR bitmap")


def _asset_extension(url: str) -> str:
    try:
        suffix = urlsplit(url).path.rsplit(".", 1)[-1].lower()
    except ValueError:
        raise AssetUnavailable("Invalid cursor asset location") from None
    if suffix not in {"cur", "ani"}:
        raise AssetUnavailable("Unsupported cursor asset extension")
    return suffix


def _archive_slug(slug: str) -> str:
    ascii_slug = normalize("NFKD", slug).encode("ascii", "ignore").decode("ascii")
    safe = re.sub(r"[^a-z0-9]+", "-", ascii_slug.lower()).strip("-")[:80].rstrip("-")
    if not safe or re.fullmatch(r"con|prn|aux|nul|com[1-9]|lpt[1-9]", safe):
        return f"cursor-pack-{safe}" if safe else "cursor-pack"
    return safe


def _write_archive(
    title: str, root: str, filenames: Mapping[str, str], assets: Mapping[str, bytes]
) -> bytes:
    inf = build_install_inf(title, filenames)
    scheme = inf.split("[CursorScheme]\r\n", 1)[1].splitlines()[0]
    paths = scheme.rsplit(',"', 1)[1].removesuffix('"').split(",")
    expected = [rf"%10%\%CUR_DIR%\{filenames[role]}" for _, role in REGISTRY_ROLE_ORDER]
    if paths != expected or {path.rsplit("\\", 1)[-1] for path in paths} != set(assets):
        raise RuntimeError("Install.inf does not match the ZIP manifest")

    manifest = {
        f"{root}/Install.inf": inf.encode("ascii"),
        f"{root}/README.txt": INSTALL_README.encode("ascii"),
        **{f"{root}/{filename}": content for filename, content in assets.items()},
    }
    with BytesIO() as buffer:
        with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
            for name, content in manifest.items():
                archive.writestr(name, content)
        buffer.seek(0)
        with ZipFile(buffer) as archive:
            if archive.namelist() != list(manifest):
                raise RuntimeError("Written ZIP does not match its manifest")
        return buffer.getvalue()


async def build_pack_zip(
    title: str, slug: str, urls: Mapping[str, str], storage: Storage
) -> tuple[str, bytes]:
    """Validate all eight assets before returning a filename and its ZIP data."""
    if set(urls) != {role.value for role in CursorRole}:
        raise PackIncomplete("Pack lacks one or more cursor roles")
    remaining = MAX_PACK_BYTES
    filenames: dict[str, str] = {}
    assets: dict[str, bytes] = {}
    for role in CursorRole:
        url = urls[role]
        extension = _asset_extension(url)
        if remaining <= 0:
            raise AssetUnavailable("Pack exceeds the byte budget")
        budget = min(MAX_ASSET_BYTES, remaining)
        try:
            data = await storage.read_asset(url, max_bytes=budget)
        except StorageError:
            raise AssetUnavailable("Cursor asset could not be read") from None
        if len(data) > budget:
            raise AssetUnavailable("Cursor asset exceeds the byte budget")
        validator = _validate_cur if extension == "cur" else _validate_ani
        await to_thread.run_sync(validator, data)
        filename = f"{role}.{extension}"
        filenames[role] = filename
        assets[filename] = data
        remaining -= len(data)

    root = _archive_slug(slug)
    archive = await to_thread.run_sync(_write_archive, title, root, filenames, assets)
    return f"{root}-windows.zip", archive
