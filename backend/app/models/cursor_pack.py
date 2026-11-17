"""Cursor pack ORM mapping for the cursor library."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    FetchedValue,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, ENUM, INTEGER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.category import Category


class PackStatus(StrEnum):
    """Publication status as stored in MySQL."""

    DRAFT = "draft"
    PUBLISHED = "published"


class CursorPack(Base):
    """A catalog pack belonging to a category."""

    __tablename__ = "cursor_packs"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_cursor_packs_slug"),
        Index(
            "idx_packs_category_status_newest",
            "category_id",
            "status",
            "created_at",
            "id",
        ),
        Index("idx_packs_status_popular", "status", "download_count", "id"),
        Index("idx_packs_status_newest", "status", "created_at", "id"),
        {
            "mysql_engine": "InnoDB",
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    category_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "categories.id",
            name="fk_packs_category",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )
    title: Mapped[str] = mapped_column(String(180))
    slug: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    thumbnail_url: Mapped[str] = mapped_column(String(1024))
    is_animated: Mapped[bool] = mapped_column(Boolean, server_default=text("FALSE"))
    is_premium: Mapped[bool] = mapped_column(Boolean, server_default=text("FALSE"))
    download_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), server_default=text("0")
    )
    status: Mapped[PackStatus] = mapped_column(
        ENUM(PackStatus, values_callable=lambda statuses: [s.value for s in statuses]),
        server_default=text("'draft'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=FetchedValue(),
    )

    category: Mapped[Category] = relationship("Category", back_populates="packs")
