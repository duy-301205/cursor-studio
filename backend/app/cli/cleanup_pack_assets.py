"""Reconcile unbound and orphaned assets for a single managed pack."""

from __future__ import annotations

import argparse
import asyncio
import sys
from uuid import uuid4

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import create_engine
from app.schemas.admin_pack import MAX_SAFE_ID
from app.services.admin_assets import private_storage
from app.services.pack_publisher import cleanup_pack_assets
from app.services.storage import StorageError


async def _run(pack_id: int) -> int:
    settings = Settings.model_validate({})
    engine = create_engine(settings)
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            return await cleanup_pack_assets(
                db, private_storage(settings), pack_id, request_id=f"cli_{uuid4().hex}"
            )
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack_id", type=int)
    args = parser.parse_args()
    if not 1 <= args.pack_id <= MAX_SAFE_ID:
        parser.error("Invalid managed pack ID.")
    try:
        count = asyncio.run(_run(args.pack_id))
    except (StorageError, SQLAlchemyError, ValueError):
        print(
            "Asset cleanup could not complete. Retry after checking the pack and storage.",
            file=sys.stderr,
        )
        return 1
    print(f"Removed {count} old orphan object(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
