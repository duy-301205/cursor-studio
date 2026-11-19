"""Persistence models for public User accounts, sessions, and throttling."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    FetchedValue,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, BINARY, DATETIME, INTEGER, VARCHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

_TABLE_OPTIONS = {
    "mysql_engine": "InnoDB",
    "mysql_charset": "utf8mb4",
    "mysql_collate": "utf8mb4_unicode_ci",
}


class User(Base):
    """A registered customer identity with a normalized email."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email_normalized", name="uq_users_email_normalized"),
        _TABLE_OPTIONS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    email_normalized: Mapped[str] = mapped_column(
        VARCHAR(254, charset="ascii", collation="ascii_bin")
    )
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"))
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=FetchedValue(),
    )


class UserSession(Base):
    """A revocable session identified by token digests."""

    __tablename__ = "user_sessions"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_user_sessions_token_hash"),
        Index("idx_user_sessions_user_expiry", "user_id", "expires_at"),
        Index("idx_user_sessions_expiry", "expires_at"),
        _TABLE_OPTIONS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", name="fk_user_sessions_user", ondelete="CASCADE"),
    )
    token_hash: Mapped[bytes] = mapped_column(BINARY(32))
    csrf_token_hash: Mapped[bytes] = mapped_column(BINARY(32))
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    expires_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
    revoked_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6))


class UserRateLimit(Base):
    """Shared counter for one authentication policy window."""

    __tablename__ = "user_rate_limits"
    __table_args__ = (
        Index("idx_user_rate_limits_expiry", "expires_at"),
        _TABLE_OPTIONS,
    )

    scope: Mapped[str] = mapped_column(String(32), primary_key=True)
    subject_hash: Mapped[bytes] = mapped_column(BINARY(32), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DATETIME(fsp=6), primary_key=True)
    counter: Mapped[int] = mapped_column(INTEGER(unsigned=True))
    expires_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
