"""Request and response models for the public gallery API."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.models.cursor_item import CursorRole


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


UtcDateTime = Annotated[datetime, AfterValidator(_as_utc)]
SearchText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class CatalogQuery(BaseModel):
    category: str = Field(default="", max_length=120)
    sort: Literal["popular", "newest"] = "popular"
    q: SearchText = ""
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=12, ge=1, le=48)


class CategoryRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class CategoryEntry(CategoryRef):
    sort_order: int
    pack_count: int


class CursorAsset(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role_type: CursorRole
    preview_png_url: str
    cursor_file_url: str
    hotspot_x: int
    hotspot_y: int


class PackCursor(CursorAsset):
    id: int


class PackSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: CategoryRef
    title: str
    slug: str
    description: str
    thumbnail_url: str
    is_animated: bool
    is_premium: bool
    download_count: int
    created_at: UtcDateTime


class PackCard(PackSummary):
    pointer: CursorAsset


class PackDetail(PackSummary):
    updated_at: UtcDateTime
    cursor_items: list[PackCursor]


class Pagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool


class PackPage(BaseModel):
    items: list[PackCard]
    pagination: Pagination


class ErrorDetail(BaseModel):
    field: str
    reason: str


class CatalogError(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)
    request_id: str


class ErrorResponse(BaseModel):
    error: CatalogError
