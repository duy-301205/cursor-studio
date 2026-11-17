"""Independent byte-level checks for the Windows CUR encoder."""

from __future__ import annotations

from struct import pack_into, unpack_from

import pytest
from PIL import Image, ImageDraw

from app.services.cur_encoder import encode_cur, inspect_cur_header


@pytest.mark.parametrize(("size", "x", "y"), [(32, 0, 0), (32, 31, 31), (48, 47, 47)])
def test_cur_headers(size: int, x: int, y: int) -> None:
    binary = encode_cur(Image.new("RGBA", (size, size)), size, x, y)
    and_stride = 4 if size == 32 else 8
    bitmap_size = size * size * 4 + size * and_stride

    assert binary[:6] == b"\x00\x00\x02\x00\x01\x00"
    assert unpack_from("<BBBBHHII", binary, 6) == (
        size,
        size,
        0,
        0,
        x,
        y,
        40 + bitmap_size,
        22,
    )
    assert unpack_from("<IiiHHIIiiII", binary, 22) == (
        40,
        size,
        size * 2,
        1,
        32,
        0,
        bitmap_size,
        0,
        0,
        0,
        0,
    )
    assert len(binary) == 62 + bitmap_size
    assert inspect_cur_header(binary) == (size, size, x, y)


def test_bgra_bottom_up_and_padded_transparency_mask() -> None:
    image = Image.new("RGBA", (48, 48))
    ImageDraw.Draw(image).ellipse((10, 10, 38, 38), fill=(20, 40, 80, 128))
    image.putpixel((47, 47), (1, 2, 3, 255))
    image.putpixel((0, 0), (4, 5, 6, 255))
    binary = encode_cur(image, 48, 0, 0)
    xor = binary[62 : 62 + 48 * 48 * 4]
    mask = binary[62 + 48 * 48 * 4 :]
    rgba = image.tobytes()

    assert xor[47 * 4 : 48 * 4] == bytes((3, 2, 1, 255))
    assert xor[-48 * 4 : -47 * 4] == bytes((6, 5, 4, 255))
    for y in range(48):
        row = mask[(47 - y) * 8 : (48 - y) * 8]
        assert row[6:] == b"\x00\x00"
        for x in range(48):
            pixel = (47 - y) * 48 + x
            source = (y * 48 + x) * 4
            red, green, blue, alpha = rgba[source : source + 4]
            assert xor[pixel * 4 : (pixel + 1) * 4] == bytes((blue, green, red, alpha))
            assert bool(row[x // 8] & (0x80 >> (x % 8))) == (alpha == 0)


@pytest.mark.parametrize("orientation", [1, 6])
def test_contain_resize_with_exif_orientation(orientation: int) -> None:
    image = Image.new("RGB", (80, 40), (10, 20, 30))
    image.getexif()[274] = orientation
    binary = encode_cur(image, 32, 31, 31)
    raster = Image.frombytes(
        "RGBA", (32, 32), binary[62 : 62 + 32 * 32 * 4], "raw", "BGRA", 0, -1
    )
    assert raster.getbbox() == ((0, 8, 32, 24) if orientation == 1 else (8, 0, 24, 32))
    assert image.size == (80, 40)
    assert image.getexif()[274] == orientation
    assert inspect_cur_header(binary) == (32, 32, 31, 31)


@pytest.mark.parametrize(
    ("size", "x", "y"),
    [
        (0, 0, 0),
        (64, 0, 0),
        (32.0, 0, 0),
        (32, -1, 0),
        (32, 0, 32),
        (48, 48, 0),
        (32, 1.5, 0),
        (32, 0, True),
    ],
)
def test_reject_invalid_geometry(size: int, x: int, y: int) -> None:
    with pytest.raises(ValueError):
        encode_cur(Image.new("RGBA", (1, 1)), size, x, y)


@pytest.mark.parametrize("field", [14, 18])
def test_inspector_rejects_invalid_length_or_offset(field: int) -> None:
    binary = bytearray(encode_cur(Image.new("RGBA", (1, 1)), 32, 0, 0))
    pack_into("<I", binary, field, 0)
    with pytest.raises(ValueError):
        inspect_cur_header(bytes(binary))


def test_inspector_rejects_wrong_type_and_truncation() -> None:
    binary = encode_cur(Image.new("RGBA", (1, 1)), 32, 0, 0)
    with pytest.raises(ValueError):
        inspect_cur_header(binary[:21])
    with pytest.raises(ValueError):
        inspect_cur_header(b"\x00\x00\x01" + binary[3:])
