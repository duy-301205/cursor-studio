"""Encode a Pillow raster as a single-image Windows cursor."""

from __future__ import annotations

from struct import Struct

from PIL import Image, ImageOps

_ICONDIR = Struct("<HHH")
_ENTRY = Struct("<BBBBHHII")
_DIB = Struct("<IiiHHIIiiII")
_CUR_HEADER = _ICONDIR.pack(0, 2, 1)
_IMAGE_OFFSET = _ICONDIR.size + _ENTRY.size


def encode_cur(source: Image.Image, size: int, hotspot_x: int, hotspot_y: int) -> bytes:
    """Center an aspect-preserving raster and encode a hotspot on the final canvas."""
    if type(size) is not int or size not in (32, 48):
        raise ValueError("size must be 32 or 48")
    if any(
        type(axis) is not int or not 0 <= axis < size for axis in (hotspot_x, hotspot_y)
    ):
        raise ValueError("hotspot must contain integer coordinates within the canvas")

    rgba = ImageOps.exif_transpose(source).convert("RGBA")
    rgba.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(rgba, ((size - rgba.width) // 2, (size - rgba.height) // 2))

    xor_bitmap = canvas.tobytes("raw", "BGRA", 0, -1)
    and_stride = ((size + 31) // 32) * 4
    and_bitmap = bytearray(and_stride * size)
    for i, alpha in enumerate(canvas.getchannel("A").tobytes()):
        if alpha == 0:
            y, x = divmod(i, size)
            and_bitmap[(size - 1 - y) * and_stride + x // 8] |= 0x80 >> (x % 8)

    bitmap_size = len(xor_bitmap) + len(and_bitmap)
    dib = _DIB.pack(_DIB.size, size, size * 2, 1, 32, 0, bitmap_size, 0, 0, 0, 0)
    entry = _ENTRY.pack(
        size, size, 0, 0, hotspot_x, hotspot_y, len(dib) + bitmap_size, _IMAGE_OFFSET
    )
    return _CUR_HEADER + entry + dib + xor_bitmap + and_bitmap


def inspect_cur_header(binary: bytes) -> tuple[int, int, int, int]:
    """Read the dimensions and hotspot from a single-image CUR header."""
    if len(binary) < _IMAGE_OFFSET or not binary.startswith(_CUR_HEADER):
        raise ValueError("not a single-image CUR")
    width, height, _, _, hotspot_x, hotspot_y, length, offset = _ENTRY.unpack_from(
        binary, _ICONDIR.size
    )
    if offset != _IMAGE_OFFSET or length < _DIB.size or offset + length != len(binary):
        raise ValueError("invalid CUR payload offset or length")
    return width, height, hotspot_x, hotspot_y
