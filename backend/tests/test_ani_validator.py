"""Exercise the supported ANI container and its playback metadata."""

from __future__ import annotations

from struct import pack
from typing import TypedDict

import pytest
from PIL import Image

from app.services.admin_assets import InvalidAsset
from app.services.ani_validator import validate_ani_cursor
from app.services.cur_encoder import encode_cur


class PlaybackOptions(TypedDict, total=False):
    sequence: tuple[int, ...]
    rates: tuple[int, ...]
    default_rate: int
    declared_frames: int


def _chunk(tag: bytes, payload: bytes) -> bytes:
    return tag + pack("<I", len(payload)) + payload + b"\0" * (len(payload) % 2)


def _frame(size: int = 32, hotspot: int = 3, color: str = "red") -> bytes:
    return encode_cur(Image.new("RGBA", (size, size), color), size, hotspot, hotspot)


def _animation(
    frames: tuple[bytes, ...],
    *,
    sequence: tuple[int, ...] | None = None,
    rates: tuple[int, ...] | None = None,
    default_rate: int = 6,
    declared_frames: int | None = None,
) -> bytes:
    steps = len(frames) if sequence is None else len(sequence)
    frame_count = len(frames) if declared_frames is None else declared_frames
    flags = 1 if sequence is None else 3
    body = b"ACON" + _chunk(
        b"anih", pack("<9I", 36, frame_count, steps, 0, 0, 0, 0, default_rate, flags)
    )
    if sequence is not None:
        body += _chunk(b"seq ", pack(f"<{len(sequence)}I", *sequence))
    if rates is not None:
        body += _chunk(b"rate", pack(f"<{len(rates)}I", *rates))
    body += _chunk(
        b"LIST", b"fram" + b"".join(_chunk(b"icon", frame) for frame in frames)
    )
    return _chunk(b"RIFF", body)


@pytest.mark.parametrize("size", [32, 48])
def test_reads_default_playback(size: int) -> None:
    first = _frame(size)
    animation = validate_ani_cursor(_animation((first, _frame(size, color="blue"))))
    assert (animation.width, animation.height) == (size, size)
    assert (animation.hotspot_x, animation.hotspot_y) == (3, 3)
    assert animation.first_frame == first


def test_preview_uses_first_played_frame() -> None:
    red, blue = _frame(), _frame(color="blue")
    animation = validate_ani_cursor(
        _animation((red, blue), sequence=(1, 0, 1), rates=(4, 6, 5))
    )
    assert animation.first_frame == blue


@pytest.mark.parametrize(
    ("options", "message"),
    [
        ({"sequence": (0, 2)}, "outside the frame list"),
        ({"rates": (3,)}, "table length"),
        ({"rates": (3, 0)}, "positive delays"),
        ({"default_rate": 901}, "at most 30 s"),
        ({"declared_frames": 61}, "supported range"),
        ({"declared_frames": 3, "sequence": (0, 1)}, "does not match its header"),
    ],
)
def test_rejects_invalid_playback(options: PlaybackOptions, message: str) -> None:
    frames = (_frame(), _frame(color="blue"))
    with pytest.raises(InvalidAsset, match=message):
        validate_ani_cursor(_animation(frames, **options))


def test_rejects_different_frame_hotspots() -> None:
    with pytest.raises(InvalidAsset, match="share dimensions and hotspot"):
        validate_ani_cursor(_animation((_frame(), _frame(hotspot=4))))


def test_rejects_wrong_extent_and_empty_container() -> None:
    with pytest.raises(InvalidAsset, match="container size"):
        validate_ani_cursor(_animation((_frame(),))[:-1])
    with pytest.raises(InvalidAsset, match="header and frame list"):
        validate_ani_cursor(_chunk(b"RIFF", b"ACON"))


def test_requires_animation_header_before_playback_chunks() -> None:
    with pytest.raises(InvalidAsset, match="header must precede playback data"):
        validate_ani_cursor(_chunk(b"RIFF", b"ACON" + _chunk(b"rate", pack("<I", 6))))
