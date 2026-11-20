"""Create and resolve time-limited shares of published cursor roles."""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta
from string import ascii_letters, digits
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
    field_validator,
    model_validator,
)
from sqlalchemy import select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.cursor_item import CursorItem, CursorRole
from app.models.cursor_pack import CursorPack, PackStatus
from app.models.custom_creation import CustomCreation
from app.schemas.catalog import UtcDateTime
from app.services.storage import StorageError, _base_url, _key_from_url

MAX_SHARE_BYTES = 8 * 1024
_BASE62 = ascii_letters + digits
_SHARE_CODE = re.compile(r"[A-Za-z0-9]{8,12}")
ShareRole = Literal[
    "pointer", "link", "text", "busy", "working", "precision", "unavailable", "move"
]


class ShareError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class ShareSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pack_id: int = Field(strict=True, gt=0, le=(1 << 64) - 1)
    role_type: ShareRole


class ShareConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    roles: dict[ShareRole, ShareSource] = Field(min_length=1, max_length=8)

    @field_validator("version", mode="before")
    @classmethod
    def require_integer_version(cls, value: object) -> object:
        if type(value) is not int:
            raise ValueError("version must be the integer 1")
        return value

    @model_validator(mode="after")
    def match_roles(self) -> Self:
        if any(target != source.role_type for target, source in self.roles.items()):
            raise ValueError("role_type must match its target role")
        return self


class ShareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)
    ]
    config: ShareConfig

    @field_validator("title")
    @classmethod
    def require_plain_title(cls, value: str) -> str:
        if any(char in "<>" or ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("title must be plain text")
        return value


class ShareCreated(BaseModel):
    share_code: str
    share_url: str
    expires_at: UtcDateTime


class ResolvedItem(BaseModel):
    target_role: CursorRole
    pack_id: int
    pack_title: str
    role_type: CursorRole
    preview_png_url: str
    hotspot_x: int
    hotspot_y: int


class ShareView(BaseModel):
    share_code: str
    title: str
    config: ShareConfig
    resolved_items: list[ResolvedItem]
    expires_at: UtcDateTime


def _new_code() -> str:
    return "".join(secrets.choice(_BASE62) for _ in range(10))


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _preview_prefix(settings: Settings) -> str:
    if settings.storage_backend == "local":
        return _base_url(
            f"{str(settings.public_api_base_url).rstrip('/')}/static/samples"
        )
    return _base_url(str(settings.public_cdn_base_url))


async def _resolve(
    session: AsyncSession, config: ShareConfig, prefix: str
) -> list[ResolvedItem]:
    rows = await session.execute(
        select(CursorItem, CursorPack.title)
        .join(CursorPack, CursorPack.id == CursorItem.pack_id)
        .where(
            CursorPack.status == PackStatus.PUBLISHED,
            tuple_(CursorItem.pack_id, CursorItem.role_type).in_(
                [(source.pack_id, source.role_type) for source in config.roles.values()]
            ),
        )
    )
    resolved: dict[CursorRole, ResolvedItem] = {}
    for item, title in rows:
        try:
            key = _key_from_url(item.preview_png_url, prefix)
        except StorageError:
            continue
        if not key.lower().endswith(".png"):
            continue
        resolved[item.role_type] = ResolvedItem(
            target_role=item.role_type,
            pack_id=item.pack_id,
            pack_title=title,
            role_type=item.role_type,
            preview_png_url=item.preview_png_url,
            hotspot_x=item.hotspot_x,
            hotspot_y=item.hotspot_y,
        )
    return [resolved[role] for role in CursorRole if role in resolved]


async def create_share(
    session: AsyncSession, payload: ShareRequest, settings: Settings
) -> ShareCreated:
    frontend = _base_url(str(settings.public_frontend_base_url))
    prefix = _preview_prefix(settings)
    async with session.begin():
        items = await _resolve(session, payload.config, prefix)
        if len(items) != len(payload.config.roles):
            raise ShareError(
                422, "INVALID_SHARE_CONFIG", "A selected cursor is unavailable."
            )
        now = _utc_now()
        expires_at = now + timedelta(days=90)
        for _ in range(5):
            code = _new_code()
            try:
                async with session.begin_nested():
                    session.add(
                        CustomCreation(
                            share_code=code,
                            title=payload.title,
                            config_json=payload.config.model_dump(mode="json"),
                            created_at=now,
                            expires_at=expires_at,
                        )
                    )
                    await session.flush()
            except IntegrityError as error:
                if (
                    error.orig is None
                    or error.orig.args[:1] != (1062,)
                    or "uq_creation_share_code" not in str(error.orig)
                ):
                    raise
            else:
                return ShareCreated(
                    share_code=code,
                    share_url=f"{frontend}mix/{code}",
                    expires_at=expires_at,
                )
        raise ShareError(500, "INTERNAL_ERROR", "Unable to create the share.")


async def get_share(session: AsyncSession, code: str, settings: Settings) -> ShareView:
    share = (
        await session.scalar(
            select(CustomCreation).where(CustomCreation.share_code == code)
        )
        if _SHARE_CODE.fullmatch(code)
        else None
    )
    if share is None:
        raise ShareError(404, "SHARE_NOT_FOUND", "Share not found.")
    if share.expires_at <= _utc_now():
        raise ShareError(410, "SHARE_EXPIRED", "This share has expired.")
    try:
        config = ShareConfig.model_validate(share.config_json)
    except ValidationError:
        raise ShareError(
            410, "SHARE_ASSET_UNAVAILABLE", "Shared cursors are unavailable."
        ) from None
    items = await _resolve(session, config, _preview_prefix(settings))
    if len(items) != len(config.roles):
        raise ShareError(
            410, "SHARE_ASSET_UNAVAILABLE", "Shared cursors are unavailable."
        )
    return ShareView(
        share_code=share.share_code,
        title=share.title,
        config=config,
        resolved_items=items,
        expires_at=share.expires_at,
    )
