"""Remove expired User authentication records in bounded batches."""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.core.user_auth import cleanup_expired
from app.db.session import create_engine


async def _run() -> None:
    engine = create_engine(Settings.model_validate({}))
    try:
        async with async_sessionmaker(engine)() as db:
            await cleanup_expired(db)
    finally:
        await engine.dispose()


def main() -> int:
    try:
        asyncio.run(_run())
    except (SQLAlchemyError, ValueError):
        print("User authentication cleanup failed.", file=sys.stderr)
        return 1
    print("User authentication cleanup completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
