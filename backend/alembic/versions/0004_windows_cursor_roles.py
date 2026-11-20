"""Expand both cursor role columns and backfill existing Windows assignments."""

from __future__ import annotations

from sqlalchemy import text

from alembic import op

revision = "0004_windows_cursor_roles"
down_revision = "0003_user_auth"
branch_labels = None
depends_on = None

_BASE = (
    "pointer",
    "link",
    "text",
    "busy",
    "working",
    "precision",
    "unavailable",
    "move",
)
_FALLBACKS = {
    "help": "pointer",
    "handwriting": "pointer",
    "resize_vertical": "move",
    "resize_horizontal": "move",
    "resize_diagonal_nwse": "move",
    "resize_diagonal_nesw": "move",
    "alternate": "pointer",
    "location": "link",
    "person": "link",
}
_TABLES = {
    "cursor_items": ("preview_png_url", "cursor_file_url", "hotspot_x", "hotspot_y"),
    "admin_pack_roles": ("asset_id", "preview_asset_id", "hotspot_x", "hotspot_y"),
}


def _enum(roles: tuple[str, ...]) -> str:
    return "ENUM(" + ", ".join(repr(role) for role in roles) + ")"


def upgrade() -> None:
    """Preserve existing assets and fill missing slots from their legacy roles."""
    roles = _enum((*_BASE, *_FALLBACKS))
    base_roles = ", ".join(repr(role) for role in _BASE)
    for table, columns in _TABLES.items():
        op.execute(f"ALTER TABLE {table} MODIFY COLUMN role_type {roles} NOT NULL")
        fields = ", ".join(columns)
        source_fields = ", ".join(f"source.{column}" for column in columns)
        for target, fallback in _FALLBACKS.items():
            op.execute(
                text(
                    f"""
                    INSERT INTO {table} (pack_id, role_type, {fields})
                    SELECT source.pack_id, :target, {source_fields}
                    FROM {table} AS source
                    JOIN (
                        SELECT pack_id FROM {table}
                        WHERE role_type IN ({base_roles})
                        GROUP BY pack_id HAVING COUNT(*) = {len(_BASE)}
                    ) AS complete ON complete.pack_id = source.pack_id
                    LEFT JOIN {table} AS existing
                      ON existing.pack_id = source.pack_id AND existing.role_type = :target
                    WHERE source.role_type = :fallback AND existing.pack_id IS NULL
                    """
                ).bindparams(target=target, fallback=fallback)
            )


def downgrade() -> None:
    """Remove expanded assignments and keep all original roles and stored assets."""
    new_roles = ", ".join(repr(role) for role in _FALLBACKS)
    for table in _TABLES:
        op.execute(f"DELETE FROM {table} WHERE role_type IN ({new_roles})")
        op.execute(
            f"ALTER TABLE {table} MODIFY COLUMN role_type {_enum(_BASE)} NOT NULL"
        )
