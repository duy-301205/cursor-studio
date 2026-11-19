"""Validate the supported Admin ANI cursor subset without invoking Windows."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from struct import Struct, unpack_from

from app.services.admin_assets import MAX_UPLOAD_BYTES, InvalidAsset, _validate_cursor

_CHUNK_HEADER = Struct("<4sI")
_ANIMATION_HEADER = Struct("<9I")
_ICON_FRAMES = 1
_SEQUENCE = 2
_MAX_FRAMES = 60
_MAX_STEPS = 120
_MAX_DURATION_JIFFIES = 30 * 60
_CHUNKS = {b"anih", b"rate", b"seq ", b"fram", b"INFO"}


@dataclass(frozen=True, slots=True)
class AniCursor:
    """Geometry shared by all frames and the first frame in playback order."""

    width: int
    height: int
    hotspot_x: int
    hotspot_y: int
    first_frame: bytes


def _chunks(container: memoryview) -> Iterator[tuple[bytes, memoryview]]:
    offset = 0
    while offset < len(container):
        if len(container) - offset < _CHUNK_HEADER.size:
            raise InvalidAsset("ANI chunk header is incomplete.")
        tag, length = _CHUNK_HEADER.unpack_from(container, offset)
        start = offset + _CHUNK_HEADER.size
        end = start + length
        offset = end + (length % 2)
        if offset > len(container):
            raise InvalidAsset("ANI chunk exceeds its container or lacks padding.")
        yield tag, container[start:end]


def _read_table(chunk: memoryview, count: int) -> tuple[int, ...]:
    if len(chunk) != count * 4:
        raise InvalidAsset("ANI playback table length must match the step count.")
    return tuple(value for (value,) in Struct("<I").iter_unpack(chunk))


def validate_ani_cursor(data: bytes) -> AniCursor:
    """Check one bounded RIFF/ACON file and return metadata for its preview."""
    if not 12 <= len(data) <= MAX_UPLOAD_BYTES:
        raise InvalidAsset("Invalid ANI byte count.")
    if data[:4] != b"RIFF" or data[8:12] != b"ACON":
        raise InvalidAsset("Expected an animated Windows ANI cursor.")
    if unpack_from("<I", data, 4)[0] != len(data) - 8:
        raise InvalidAsset("ANI container size does not match the file.")

    chunks: dict[bytes, memoryview] = {}
    for tag, payload in _chunks(memoryview(data)[12:]):
        if tag == b"LIST":
            if len(payload) < 4:
                raise InvalidAsset("ANI list type is missing.")
            tag, payload = bytes(payload[:4]), payload[4:]
            if tag not in {b"fram", b"INFO"}:
                raise InvalidAsset("Unsupported ANI list type.")
        elif tag in {b"fram", b"INFO"}:
            raise InvalidAsset("ANI list type must be wrapped in a LIST chunk.")
        if tag not in _CHUNKS or tag in chunks:
            raise InvalidAsset("Unsupported or duplicate ANI chunk.")
        if tag in {b"rate", b"seq ", b"fram"} and b"anih" not in chunks:
            raise InvalidAsset("ANI animation header must precede playback data.")
        chunks[tag] = payload

    header = chunks.get(b"anih")
    if header is None or len(header) != _ANIMATION_HEADER.size or b"fram" not in chunks:
        raise InvalidAsset("ANI requires a complete animation header and frame list.")
    size, frame_count, steps, width, height, depth, planes, default_rate, flags = (
        _ANIMATION_HEADER.unpack(header)
    )
    if (
        size != _ANIMATION_HEADER.size
        or flags not in {_ICON_FRAMES, _ICON_FRAMES | _SEQUENCE}
        or depth not in (0, 32)
        or planes not in (0, 1)
    ):
        raise InvalidAsset("Unsupported ANI animation header.")
    if not 1 <= frame_count <= _MAX_FRAMES or not 1 <= steps <= _MAX_STEPS:
        raise InvalidAsset("ANI frame or step count exceeds the supported range.")

    if flags & _SEQUENCE:
        if b"seq " not in chunks:
            raise InvalidAsset("ANI playback sequence is missing.")
        sequence = _read_table(chunks[b"seq "], steps)
        if any(index >= frame_count for index in sequence):
            raise InvalidAsset(
                "ANI playback references a frame outside the frame list."
            )
    else:
        if b"seq " in chunks or steps != frame_count:
            raise InvalidAsset("ANI playback without a sequence must visit each frame.")
        sequence = tuple(range(frame_count))

    rates = (
        _read_table(chunks[b"rate"], steps)
        if b"rate" in chunks
        else (default_rate,) * steps
    )
    if 0 in rates or sum(rates) > _MAX_DURATION_JIFFIES:
        raise InvalidAsset(
            "ANI playback must use positive delays and last at most 30 s."
        )

    if b"INFO" in chunks:
        for _ in _chunks(chunks[b"INFO"]):
            pass

    first_frame = b""
    geometry: tuple[int, int, int, int] | None = None
    frame_total = 0
    for index, (tag, payload) in enumerate(_chunks(chunks[b"fram"])):
        if tag != b"icon" or index >= frame_count:
            raise InvalidAsset("ANI frame list does not match its header.")
        frame = _validate_cursor(bytes(payload))
        if frame.hotspot_x is None or frame.hotspot_y is None:
            raise InvalidAsset("ANI frame has no cursor hotspot.")
        frame_geometry = (frame.width, frame.height, frame.hotspot_x, frame.hotspot_y)
        if geometry is None:
            geometry = frame_geometry
        elif geometry != frame_geometry:
            raise InvalidAsset("ANI frames must share dimensions and hotspot.")
        if index == sequence[0]:
            first_frame = frame.data
        frame_total += 1

    if frame_total != frame_count or geometry is None:
        raise InvalidAsset("ANI frame list does not match its header.")
    if width not in (0, geometry[0]) or height not in (0, geometry[1]):
        raise InvalidAsset("ANI header dimensions do not match its frames.")
    return AniCursor(*geometry, first_frame)
