"""Persistence models for Admin identity and cursor pack management."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    FetchedValue,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import (
    BIGINT,
    BINARY,
    DATETIME,
    ENUM,
    INTEGER,
    SMALLINT,
    TINYINT,
    VARCHAR,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.cursor_item import CursorRole

_TABLE_OPTIONS = {
    "mysql_engine": "InnoDB",
    "mysql_charset": "utf8mb4",
    "mysql_collate": "utf8mb4_unicode_ci",
}


class AssetKind(StrEnum):
    PREVIEW = "preview"
    THUMBNAIL = "thumbnail"
    CURSOR = "cursor"


class AdminUser(Base):
    """An internal account with an encoded password hash."""

    __tablename__ = "admin_users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_admin_users_username"),
        _TABLE_OPTIONS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    username: Mapped[str] = mapped_column(
        VARCHAR(100, charset="ascii", collation="ascii_bin")
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


class AdminSession(Base):
    """An opaque session identified by a digest, with revocation and expiry."""

    __tablename__ = "admin_sessions"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_admin_sessions_token_hash"),
        Index("idx_admin_sessions_user_expiry", "admin_user_id", "expires_at"),
        Index("idx_admin_sessions_expiry", "expires_at"),
        _TABLE_OPTIONS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    admin_user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("admin_users.id", name="fk_admin_sessions_user", ondelete="CASCADE"),
    )
    token_hash: Mapped[bytes] = mapped_column(BINARY(32))
    csrf_token_hash: Mapped[bytes] = mapped_column(BINARY(32))
    expires_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
    revoked_at: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6))
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )


class AdminPackState(Base):
    """Revision and optional thumbnail binding for an Admin-managed pack."""

    __tablename__ = "admin_pack_state"
    __table_args__ = (
        Index("idx_admin_pack_thumbnail", "pack_id", "thumbnail_asset_id"),
        ForeignKeyConstraint(
            ("pack_id", "thumbnail_asset_id"),
            ("admin_assets.pack_id", "admin_assets.id"),
            name="fk_admin_pack_thumbnail",
            ondelete="RESTRICT",
            use_alter=True,
        ),
        _TABLE_OPTIONS,
    )

    pack_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "cursor_packs.id", name="fk_admin_pack_state_pack", ondelete="RESTRICT"
        ),
        primary_key=True,
    )
    revision: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), server_default=text("1")
    )
    thumbnail_asset_id: Mapped[bytes | None] = mapped_column(BINARY(16))


class AdminAsset(Base):
    """Immutable storage and format metadata scoped to one managed pack."""

    __tablename__ = "admin_assets"
    __table_args__ = (
        UniqueConstraint("storage_key", name="uq_admin_assets_storage_key"),
        UniqueConstraint("pack_id", "id", name="uq_admin_assets_pack_id"),
        Index("idx_admin_assets_pack_created", "pack_id", "created_at"),
        Index("idx_admin_assets_creator", "created_by_admin_id"),
        _TABLE_OPTIONS,
    )

    id: Mapped[bytes] = mapped_column(BINARY(16), primary_key=True)
    pack_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "admin_pack_state.pack_id", name="fk_admin_assets_pack", ondelete="RESTRICT"
        ),
    )
    kind: Mapped[AssetKind] = mapped_column(
        ENUM(AssetKind, values_callable=lambda kinds: [kind.value for kind in kinds])
    )
    storage_key: Mapped[str] = mapped_column(
        VARCHAR(255, charset="ascii", collation="ascii_bin")
    )
    mime_type: Mapped[str] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(INTEGER(unsigned=True))
    sha256: Mapped[bytes] = mapped_column(BINARY(32))
    width: Mapped[int] = mapped_column(SMALLINT(unsigned=True))
    height: Mapped[int] = mapped_column(SMALLINT(unsigned=True))
    hotspot_x: Mapped[int | None] = mapped_column(TINYINT(unsigned=True))
    hotspot_y: Mapped[int | None] = mapped_column(TINYINT(unsigned=True))
    created_by_admin_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "admin_users.id", name="fk_admin_assets_creator", ondelete="RESTRICT"
        ),
    )
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )


class AdminPackRole(Base):
    """A draft role bound to two assets that belong to its pack."""

    __tablename__ = "admin_pack_roles"
    __table_args__ = (
        Index("idx_admin_roles_cursor", "pack_id", "asset_id"),
        Index("idx_admin_roles_preview", "pack_id", "preview_asset_id"),
        ForeignKeyConstraint(
            ("pack_id", "asset_id"),
            ("admin_assets.pack_id", "admin_assets.id"),
            name="fk_admin_roles_cursor",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ("pack_id", "preview_asset_id"),
            ("admin_assets.pack_id", "admin_assets.id"),
            name="fk_admin_roles_preview",
            ondelete="RESTRICT",
        ),
        CheckConstraint("hotspot_x BETWEEN 0 AND 47", name="chk_admin_roles_hotspot_x"),
        CheckConstraint("hotspot_y BETWEEN 0 AND 47", name="chk_admin_roles_hotspot_y"),
        _TABLE_OPTIONS,
    )

    pack_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "admin_pack_state.pack_id", name="fk_admin_roles_pack", ondelete="RESTRICT"
        ),
        primary_key=True,
    )
    role_type: Mapped[CursorRole] = mapped_column(
        ENUM(CursorRole, values_callable=lambda roles: [role.value for role in roles]),
        primary_key=True,
    )
    asset_id: Mapped[bytes] = mapped_column(BINARY(16))
    preview_asset_id: Mapped[bytes] = mapped_column(BINARY(16))
    hotspot_x: Mapped[int] = mapped_column(TINYINT(unsigned=True))
    hotspot_y: Mapped[int] = mapped_column(TINYINT(unsigned=True))


class AdminAuditEvent(Base):
    """An audit record containing only operational metadata."""

    __tablename__ = "admin_audit_events"
    __table_args__ = (
        Index("idx_admin_audit_actor", "actor_admin_id"),
        Index("idx_admin_audit_created", "created_at", "id"),
        Index("idx_admin_audit_target", "target_type", "target_id", "created_at"),
        _TABLE_OPTIONS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    actor_admin_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("admin_users.id", name="fk_admin_audit_actor", ondelete="SET NULL"),
    )
    action: Mapped[str] = mapped_column(String(48))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(64))
    outcome: Mapped[str] = mapped_column(String(24))
    request_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )


class AdminRateLimit(Base):
    """Shared rate-limit counter for a bounded time window."""

    __tablename__ = "admin_rate_limits"
    __table_args__ = (
        Index("idx_admin_rate_limits_expiry", "expires_at"),
        _TABLE_OPTIONS,
    )

    scope: Mapped[str] = mapped_column(String(32), primary_key=True)
    subject_hash: Mapped[bytes] = mapped_column(BINARY(32), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DATETIME(fsp=6), primary_key=True)
    counter: Mapped[int] = mapped_column(INTEGER(unsigned=True))
    expires_at: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
