"""Alembic environment for the async MySQL backend."""

from __future__ import annotations

import asyncio

from sqlalchemy.engine import Connection

from alembic import context
from app.core.config import Settings
from app.db.session import Base, create_engine

# Register every relationship target for metadata-based migrations.
from app.models import category, cursor_item, cursor_pack, custom_creation  # noqa: F401


def run_migrations_offline() -> None:
    """Render MySQL SQL without opening a connection."""
    context.configure(
        dialect_name="mysql", target_metadata=Base.metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Apply migrations using the application's async MySQL connection settings."""
    engine = create_engine(Settings.model_validate({}))
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_run_migrations)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
