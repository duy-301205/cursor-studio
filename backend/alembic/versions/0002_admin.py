"""Add the Admin identity, asset registry, and publication foundations."""

from __future__ import annotations

from sqlalchemy import text

from alembic import context, op

revision = "0002_admin"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create only the Admin tables, then attach the cyclic thumbnail FK."""
    op.execute(
        """
        CREATE TABLE admin_users (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          username VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          is_active BOOL NOT NULL DEFAULT TRUE,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          CONSTRAINT uq_admin_users_username UNIQUE (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE admin_sessions (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          admin_user_id BIGINT UNSIGNED NOT NULL,
          token_hash BINARY(32) NOT NULL,
          csrf_token_hash BINARY(32) NOT NULL,
          expires_at DATETIME(6) NOT NULL,
          revoked_at DATETIME(6),
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          CONSTRAINT uq_admin_sessions_token_hash UNIQUE (token_hash),
          CONSTRAINT fk_admin_sessions_user
            FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE,
          KEY idx_admin_sessions_expiry (expires_at),
          KEY idx_admin_sessions_user_expiry (admin_user_id, expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE admin_pack_state (
          pack_id BIGINT UNSIGNED NOT NULL,
          revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
          thumbnail_asset_id BINARY(16),
          PRIMARY KEY (pack_id),
          CONSTRAINT fk_admin_pack_state_pack
            FOREIGN KEY (pack_id) REFERENCES cursor_packs (id) ON DELETE RESTRICT,
          KEY idx_admin_pack_thumbnail (pack_id, thumbnail_asset_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE admin_assets (
          id BINARY(16) NOT NULL,
          pack_id BIGINT UNSIGNED NOT NULL,
          kind ENUM('preview','thumbnail','cursor') NOT NULL,
          storage_key VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          mime_type VARCHAR(64) NOT NULL,
          byte_size INTEGER UNSIGNED NOT NULL,
          sha256 BINARY(32) NOT NULL,
          width SMALLINT UNSIGNED NOT NULL,
          height SMALLINT UNSIGNED NOT NULL,
          hotspot_x TINYINT UNSIGNED,
          hotspot_y TINYINT UNSIGNED,
          created_by_admin_id BIGINT UNSIGNED NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          CONSTRAINT uq_admin_assets_storage_key UNIQUE (storage_key),
          CONSTRAINT uq_admin_assets_pack_id UNIQUE (pack_id, id),
          CONSTRAINT fk_admin_assets_pack
            FOREIGN KEY (pack_id) REFERENCES admin_pack_state (pack_id) ON DELETE RESTRICT,
          CONSTRAINT fk_admin_assets_creator
            FOREIGN KEY (created_by_admin_id) REFERENCES admin_users (id) ON DELETE RESTRICT,
          KEY idx_admin_assets_creator (created_by_admin_id),
          KEY idx_admin_assets_pack_created (pack_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE admin_pack_roles (
          pack_id BIGINT UNSIGNED NOT NULL,
          role_type ENUM('pointer','link','text','busy','working','precision','unavailable','move') NOT NULL,
          asset_id BINARY(16) NOT NULL,
          preview_asset_id BINARY(16) NOT NULL,
          hotspot_x TINYINT UNSIGNED NOT NULL,
          hotspot_y TINYINT UNSIGNED NOT NULL,
          PRIMARY KEY (pack_id, role_type),
          CONSTRAINT fk_admin_roles_cursor
            FOREIGN KEY (pack_id, asset_id) REFERENCES admin_assets (pack_id, id) ON DELETE RESTRICT,
          CONSTRAINT fk_admin_roles_preview
            FOREIGN KEY (pack_id, preview_asset_id) REFERENCES admin_assets (pack_id, id) ON DELETE RESTRICT,
          CONSTRAINT chk_admin_roles_hotspot_x CHECK (hotspot_x BETWEEN 0 AND 47),
          CONSTRAINT chk_admin_roles_hotspot_y CHECK (hotspot_y BETWEEN 0 AND 47),
          CONSTRAINT fk_admin_roles_pack
            FOREIGN KEY (pack_id) REFERENCES admin_pack_state (pack_id) ON DELETE RESTRICT,
          KEY idx_admin_roles_cursor (pack_id, asset_id),
          KEY idx_admin_roles_preview (pack_id, preview_asset_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE admin_audit_events (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          actor_admin_id BIGINT UNSIGNED,
          action VARCHAR(48) NOT NULL,
          target_type VARCHAR(32) NOT NULL,
          target_id VARCHAR(64),
          outcome VARCHAR(24) NOT NULL,
          request_id VARCHAR(64) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          CONSTRAINT fk_admin_audit_actor
            FOREIGN KEY (actor_admin_id) REFERENCES admin_users (id) ON DELETE SET NULL,
          KEY idx_admin_audit_actor (actor_admin_id),
          KEY idx_admin_audit_created (created_at, id),
          KEY idx_admin_audit_target (target_type, target_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE admin_rate_limits (
          scope VARCHAR(32) NOT NULL,
          subject_hash BINARY(32) NOT NULL,
          window_start DATETIME(6) NOT NULL,
          counter INTEGER UNSIGNED NOT NULL,
          expires_at DATETIME(6) NOT NULL,
          PRIMARY KEY (scope, subject_hash, window_start),
          KEY idx_admin_rate_limits_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        ALTER TABLE admin_pack_state ADD CONSTRAINT fk_admin_pack_thumbnail
          FOREIGN KEY (pack_id, thumbnail_asset_id) REFERENCES admin_assets (pack_id, id)
          ON DELETE RESTRICT
        """
    )


def downgrade() -> None:
    """Remove the Admin schema after taking Admin writers offline."""
    if context.is_offline_mode():
        raise RuntimeError("Admin downgrade requires an online managed-pack check")

    managed_pack = (
        op.get_bind()
        .execute(text("SELECT pack_id FROM admin_pack_state LIMIT 1"))
        .first()
    )
    if managed_pack is not None:
        raise RuntimeError(
            "Cannot downgrade while managed packs exist. "
            "Export and restore using an approved rollback plan."
        )

    op.drop_constraint(
        "fk_admin_pack_thumbnail", "admin_pack_state", type_="foreignkey"
    )
    op.drop_table("admin_rate_limits")
    op.drop_table("admin_audit_events")
    op.drop_table("admin_pack_roles")
    op.drop_table("admin_assets")
    op.drop_table("admin_pack_state")
    op.drop_table("admin_sessions")
    op.drop_table("admin_users")
