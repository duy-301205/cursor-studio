"""Create the canonical MySQL catalog and share schema."""

from __future__ import annotations

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create tables in foreign-key dependency order."""
    op.execute(
        """
        CREATE TABLE categories (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL,
          slug VARCHAR(120) NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_categories_slug (slug),
          KEY idx_categories_order (sort_order, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE cursor_packs (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          category_id BIGINT UNSIGNED NOT NULL,
          title VARCHAR(180) NOT NULL,
          slug VARCHAR(200) NOT NULL,
          description TEXT NOT NULL,
          thumbnail_url VARCHAR(1024) NOT NULL,
          is_animated BOOLEAN NOT NULL DEFAULT FALSE,
          is_premium BOOLEAN NOT NULL DEFAULT FALSE,
          download_count INT UNSIGNED NOT NULL DEFAULT 0,
          status ENUM('draft','published') NOT NULL DEFAULT 'draft',
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                     ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_cursor_packs_slug (slug),
          KEY idx_packs_category_status_newest (category_id, status, created_at, id),
          KEY idx_packs_status_popular (status, download_count, id),
          KEY idx_packs_status_newest (status, created_at, id),
          CONSTRAINT fk_packs_category
            FOREIGN KEY (category_id) REFERENCES categories(id)
            ON UPDATE RESTRICT ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE cursor_items (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          pack_id BIGINT UNSIGNED NOT NULL,
          role_type ENUM(
            'pointer','link','text','busy','working',
            'precision','unavailable','move'
          ) NOT NULL,
          preview_png_url VARCHAR(1024) NOT NULL,
          cursor_file_url VARCHAR(1024) NOT NULL,
          hotspot_x TINYINT UNSIGNED NOT NULL DEFAULT 0,
          hotspot_y TINYINT UNSIGNED NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          UNIQUE KEY uq_item_pack_role (pack_id, role_type),
          KEY idx_items_role (role_type),
          CONSTRAINT fk_items_pack
            FOREIGN KEY (pack_id) REFERENCES cursor_packs(id)
            ON UPDATE RESTRICT ON DELETE CASCADE,
          CONSTRAINT chk_item_hotspot_x CHECK (hotspot_x BETWEEN 0 AND 47),
          CONSTRAINT chk_item_hotspot_y CHECK (hotspot_y BETWEEN 0 AND 47)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE custom_creations (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          share_code VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          title VARCHAR(180) NOT NULL,
          config_json JSON NOT NULL,
          download_count INT UNSIGNED NOT NULL DEFAULT 0,
          expires_at DATETIME(6) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_creation_share_code (share_code),
          KEY idx_creation_expiry (expires_at),
          KEY idx_creation_created (created_at),
          CONSTRAINT chk_share_code_length
            CHECK (CHAR_LENGTH(share_code) BETWEEN 8 AND 12),
          CONSTRAINT chk_creation_expiry CHECK (expires_at > created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )


def downgrade() -> None:
    """Drop the initial schema in reverse dependency order."""
    op.drop_table("custom_creations")
    op.drop_table("cursor_items")
    op.drop_table("cursor_packs")
    op.drop_table("categories")
