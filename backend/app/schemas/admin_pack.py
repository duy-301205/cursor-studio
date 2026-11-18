"""Typed Admin catalog input and response models."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)

from app.models.admin_user import AssetKind
from app.models.cursor_item import CursorRole
from app.models.cursor_pack import PackStatus

MAX_SAFE_ID = 2**53 - 1
SafeId = Annotated[int, Field(ge=1, le=MAX_SAFE_ID)]
Revision = Annotated[int, Field(ge=1, le=2**64 - 1)]
Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)
]
Slug = Annotated[
    str, StringConstraints(max_length=200, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
]
Description = Annotated[str, StringConstraints(max_length=4000)]


class PackMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)

    title: Title
    slug: Slug
    category_id: SafeId
    description: Description
    is_premium: bool = False
    is_animated: Literal[False] = False

    @field_validator("is_animated", mode="before")
    @classmethod
    def reject_non_static(cls, value: object) -> object:
        if value is not False:
            raise ValueError("Only static packs are supported")
        return value


class PackPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)

    title: Title | None = None
    slug: Slug | None = None
    category_id: SafeId | None = None
    description: Description | None = None
    is_premium: bool | None = None
    is_animated: Literal[False] | None = None
    thumbnail_asset_id: UUID | None = None

    @field_validator("is_animated", mode="before")
    @classmethod
    def reject_non_static(cls, value: object) -> object:
        return PackMetadata.reject_non_static(value)

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> Self:
        if any(
            getattr(self, field) is None
            for field in self.model_fields_set - {"thumbnail_asset_id"}
        ):
            raise ValueError("Metadata fields cannot be null")
        return self


class RoleAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)

    asset_id: UUID
    preview_asset_id: UUID
    hotspot_x: Annotated[int, Field(ge=0, le=47)]
    hotspot_y: Annotated[int, Field(ge=0, le=47)]


class PackQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    status: PackStatus | None = None
    q: Annotated[str, StringConstraints(max_length=100)] = ""
    page: SafeId = 1
    limit: Annotated[int, Field(ge=1, le=48)] = 12


class PackSummary(BaseModel):
    id: SafeId
    title: str
    slug: str
    category_id: SafeId
    description: str
    is_premium: bool
    is_animated: bool
    status: PackStatus
    managed: bool
    revision: Revision | None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at", when_used="json")
    def utc_timestamp(self, value: datetime) -> str:
        return value.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


class PackAsset(BaseModel):
    asset_id: UUID
    kind: AssetKind
    mime_type: str
    byte_size: int
    sha256: str
    width: int
    height: int
    hotspot_x: int | None
    hotspot_y: int | None
    content_url: str | None


class PackRole(BaseModel):
    role_type: CursorRole
    asset_id: UUID | None
    preview_asset_id: UUID | None
    hotspot_x: int
    hotspot_y: int
    preview_url: str


class PackDetail(PackSummary):
    thumbnail: PackAsset | None
    thumbnail_url: str | None
    roles: list[PackRole]
    assets: list[PackAsset]


class PackPagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool


class PackPage(BaseModel):
    items: list[PackSummary]
    pagination: PackPagination
