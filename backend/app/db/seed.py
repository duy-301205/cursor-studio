"""Generate the development catalog and its local sample assets."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile

from anyio import to_thread
from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.session import Base
from app.models.category import Category
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack, PackStatus
from app.models.custom_creation import CustomCreation
from app.services.cur_encoder import encode_cur
from app.services.inf_builder import LEGACY_ROLE_FALLBACKS

SAMPLES_DIRECTORY = Path(__file__).resolve().parents[1] / "static" / "samples"

_CATEGORIES = (
    ("minimal", "Minimal"),
    ("cute-kawaii", "Cute & Kawaii"),
    ("gaming", "Gaming"),
    ("anime-inspired", "Anime Inspired"),
    ("neon-cyber", "Neon & Cyber"),
)
_PACKS = (
    ("sample-minimal", "minimal", "Minimal Graphite", "#252b3c", "#e2e8f0"),
    ("sample-neon", "neon-cyber", "Neon Circuit", "#713eff", "#54f5d3"),
)
_HOTSPOTS: dict[CursorRole, tuple[int, int]] = {
    CursorRole.POINTER: (3, 3),
    CursorRole.LINK: (11, 4),
    CursorRole.TEXT: (16, 16),
    CursorRole.BUSY: (16, 16),
    CursorRole.WORKING: (3, 3),
    CursorRole.PRECISION: (16, 16),
    CursorRole.UNAVAILABLE: (16, 16),
    CursorRole.MOVE: (16, 16),
}


def _draw_cursor(role: CursorRole, fill: str, accent: str) -> Image.Image:
    image = Image.new("RGBA", (32, 32))
    draw = ImageDraw.Draw(image)
    match role:
        case CursorRole.POINTER | CursorRole.WORKING:
            draw.polygon(
                [(3, 3), (3, 25), (9, 19), (13, 28), (17, 26), (13, 17), (22, 17)],
                fill=fill,
                outline=accent,
                width=2,
            )
            if role is CursorRole.WORKING:
                draw.ellipse((20, 18, 30, 28), fill=fill, outline=accent, width=2)
        case CursorRole.LINK:
            draw.rounded_rectangle((9, 4, 14, 19), radius=2, fill=accent)
            draw.rounded_rectangle((9, 14, 24, 26), radius=4, fill=fill, outline=accent)
        case CursorRole.TEXT:
            draw.line((16, 5, 16, 27), fill=fill, width=4)
            draw.line((10, 5, 22, 5), fill=accent, width=3)
            draw.line((10, 27, 22, 27), fill=accent, width=3)
        case CursorRole.BUSY:
            draw.arc((5, 5, 27, 27), 45, 315, fill=fill, width=5)
            draw.arc((5, 5, 27, 27), 315, 405, fill=accent, width=5)
        case CursorRole.PRECISION:
            draw.ellipse((7, 7, 25, 25), outline=fill, width=2)
            draw.line((16, 3, 16, 29), fill=accent, width=2)
            draw.line((3, 16, 29, 16), fill=accent, width=2)
        case CursorRole.UNAVAILABLE:
            draw.ellipse((5, 5, 27, 27), outline=fill, width=4)
            draw.line((9, 23, 23, 9), fill=accent, width=4)
        case CursorRole.MOVE:
            draw.line((16, 4, 16, 28), fill=fill, width=3)
            draw.line((4, 16, 28, 16), fill=fill, width=3)
            draw.polygon(((16, 3), (12, 8), (20, 8)), fill=accent)
            draw.polygon(((16, 29), (12, 24), (20, 24)), fill=accent)
            draw.polygon(((3, 16), (8, 12), (8, 20)), fill=accent)
            draw.polygon(((29, 16), (24, 12), (24, 20)), fill=accent)
    return image


def _save_sample(path: Path, content: bytes) -> None:
    try:
        if path.read_bytes() == content:
            return
    except FileNotFoundError:
        pass
    with NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
            stream.close()
            temporary.chmod(0o644)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def _generate_samples(directory: Path) -> None:
    for slug, _, _, fill, accent in _PACKS:
        pack_directory = directory / slug
        pack_directory.mkdir(parents=True, exist_ok=True)
        for role, (x, y) in _HOTSPOTS.items():
            image = _draw_cursor(role, fill, accent)
            with BytesIO() as output:
                image.save(output, format="PNG")
                _save_sample(pack_directory / f"{role}.png", output.getvalue())
            _save_sample(pack_directory / f"{role}.cur", encode_cur(image, 32, x, y))
            if role is CursorRole.POINTER:
                with BytesIO() as output:
                    image.save(output, format="WEBP", lossless=True)
                    _save_sample(pack_directory / "thumbnail.webp", output.getvalue())


async def seed_development(
    sessions: async_sessionmaker[AsyncSession], public_api_base_url: str
) -> None:
    """Create the development schema and upsert the generated sample catalog."""
    async with sessions.begin() as session:
        connection = await session.connection()
        await connection.run_sync(
            lambda sync: Base.metadata.create_all(
                sync,
                tables=[
                    Base.metadata.tables[model.__tablename__]
                    for model in (Category, CursorPack, CursorItem, CustomCreation)
                ],
            )
        )

    await to_thread.run_sync(_generate_samples, SAMPLES_DIRECTORY)
    asset_root = f"{public_api_base_url.rstrip('/')}/static/samples"
    async with sessions.begin() as session:
        for order, (slug, name) in enumerate(_CATEGORIES):
            category = insert(Category).values(slug=slug, name=name, sort_order=order)
            await session.execute(
                category.on_duplicate_key_update(name=name, sort_order=order)
            )

        for slug, category_slug, title, _, _ in _PACKS:
            category_id = (
                await session.execute(
                    select(Category.id).where(Category.slug == category_slug)
                )
            ).scalar_one()
            assets = f"{asset_root}/{slug}"
            pack = insert(CursorPack).values(
                slug=slug, category_id=category_id, download_count=0
            )
            values = {
                "category_id": category_id,
                "title": title,
                "description": f"Original {title} sample cursor set.",
                "thumbnail_url": f"{assets}/thumbnail.webp",
                "is_animated": False,
                "is_premium": False,
                "status": PackStatus.PUBLISHED,
            }
            await session.execute(
                pack.values(**values).on_duplicate_key_update(**values)
            )
            pack_id = (
                await session.execute(
                    select(CursorPack.id).where(CursorPack.slug == slug)
                )
            ).scalar_one()
            for role in CursorRole:
                source = CursorRole(LEGACY_ROLE_FALLBACKS.get(role, role))
                x, y = _HOTSPOTS[source]
                item = insert(CursorItem).values(pack_id=pack_id, role_type=role)
                item_values = {
                    "preview_png_url": f"{assets}/{source}.png",
                    "cursor_file_url": f"{assets}/{source}.cur",
                    "hotspot_x": x,
                    "hotspot_y": y,
                }
                await session.execute(
                    item.values(**item_values).on_duplicate_key_update(**item_values)
                )
