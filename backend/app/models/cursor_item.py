"""ORM mapping for individual cursor roles in a pack."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, ENUM, TINYINT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.cursor_pack import CursorPack


class CursorRole(StrEnum):
    """Product roles stored in the cursor catalog."""

    POINTER = "pointer"
    LINK = "link"
    TEXT = "text"
    BUSY = "busy"
    WORKING = "working"
    PRECISION = "precision"
    UNAVAILABLE = "unavailable"
    MOVE = "move"


class CursorItem(Base):
    """A pack's asset URLs and hotspot for one product role."""

    __tablename__ = "cursor_items"
    __table_args__ = (
        UniqueConstraint("pack_id", "role_type", name="uq_item_pack_role"),
        Index("idx_items_role", "role_type"),
        CheckConstraint("hotspot_x BETWEEN 0 AND 47", name="chk_item_hotspot_x"),
        CheckConstraint("hotspot_y BETWEEN 0 AND 47", name="chk_item_hotspot_y"),
        {
            "mysql_engine": "InnoDB",
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    pack_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "cursor_packs.id",
            name="fk_items_pack",
            onupdate="RESTRICT",
            ondelete="CASCADE",
        ),
    )
    role_type: Mapped[CursorRole] = mapped_column(
        ENUM(CursorRole, values_callable=lambda roles: [role.value for role in roles])
    )
    preview_png_url: Mapped[str] = mapped_column(String(1024))
    cursor_file_url: Mapped[str] = mapped_column(String(1024))
    hotspot_x: Mapped[int] = mapped_column(
        TINYINT(unsigned=True), server_default=text("0")
    )
    hotspot_y: Mapped[int] = mapped_column(
        TINYINT(unsigned=True), server_default=text("0")
    )

    pack: Mapped[CursorPack] = relationship("CursorPack")
