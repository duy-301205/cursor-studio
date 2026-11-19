"""Add public User account, session and rate-limit tables."""

from __future__ import annotations

from sqlalchemy import text

from alembic import context, op

revision = "0003_user_auth"
down_revision = "0002_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create User tables independently of Admin and catalog."""
    op.execute(
        """
        CREATE TABLE users (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          email_normalized VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                     ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_users_email_normalized (email_normalized)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE user_sessions (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          token_hash BINARY(32) NOT NULL,
          csrf_token_hash BINARY(32) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          expires_at DATETIME(6) NOT NULL,
          revoked_at DATETIME(6) NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_user_sessions_token_hash (token_hash),
          KEY idx_user_sessions_user_expiry (user_id, expires_at),
          KEY idx_user_sessions_expiry (expires_at),
          CONSTRAINT fk_user_sessions_user
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    op.execute(
        """
        CREATE TABLE user_rate_limits (
          scope VARCHAR(32) NOT NULL,
          subject_hash BINARY(32) NOT NULL,
          window_start DATETIME(6) NOT NULL,
          counter INT UNSIGNED NOT NULL,
          expires_at DATETIME(6) NOT NULL,
          PRIMARY KEY (scope, subject_hash, window_start),
          KEY idx_user_rate_limits_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )


def downgrade() -> None:
    """Remove the User schema after taking User writers offline."""
    if context.is_offline_mode():
        raise RuntimeError("User downgrade requires an online account check")
    account = op.get_bind().execute(text("SELECT id FROM users LIMIT 1")).first()
    if account is not None:
        raise RuntimeError(
            "Cannot downgrade while User accounts exist. "
            "Export and restore using an approved rollback plan."
        )
    op.drop_table("user_rate_limits")
    op.drop_table("user_sessions")
    op.drop_table("users")
