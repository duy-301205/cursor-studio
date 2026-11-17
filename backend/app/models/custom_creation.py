"""ORM mapping for shared cursor configurations."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, INTEGER, JSON, VARCHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class CustomCreation(Base):
    """A saved cursor configuration with UTC creation and expiry times."""

    __tablename__ = "custom_creations"
    __table_args__ = (
        UniqueConstraint("share_code", name="uq_creation_share_code"),
        Index("idx_creation_expiry", "expires_at"),
        Index("idx_creation_created", "created_at"),
        CheckConstraint(
            "CHAR_LENGTH(share_code) BETWEEN 8 AND 12", name="chk_share_code_length"
        ),
        CheckConstraint("expires_at > created_at", name="chk_creation_expiry"),
        {
            "mysql_engine": "InnoDB",
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    share_code: Mapped[str] = mapped_column(
        VARCHAR(12, charset="ascii", collation="ascii_bin")
    )
    title: Mapped[str] = mapped_column(String(180))
    config_json: Mapped[dict[str, object]] = mapped_column(JSON(none_as_null=True))
    download_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), server_default=text("0")
    )
    expires_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
