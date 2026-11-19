"""Internal account bootstrap, recovery, and bounded maintenance commands."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import re
import sys
import warnings
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps.admin import audit_event
from app.core.admin_auth import hash_password, utc_now
from app.core.config import Settings
from app.db.session import create_engine
from app.models import category, cursor_pack  # noqa: F401 -- resolve catalog ORM relationships
from app.models.admin_user import AdminSession, AdminUser

_USERNAME = re.compile(r"[a-z0-9][a-z0-9._-]{2,99}")


class CommandError(Exception):
    """A CLI error that can safely be displayed."""


def _password(from_stdin: bool) -> bytes:
    try:
        if from_stdin:
            raw = sys.stdin.buffer.readline(515)
            if raw.endswith(b"\n"):
                raw = raw[:-1].removesuffix(b"\r")
            value = raw.decode("utf-8")
        else:
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                value = getpass.getpass("Admin password: ")
                if value != getpass.getpass("Confirm password: "):
                    raise CommandError("Passwords do not match.")
        password = value.encode("utf-8")
    except (EOFError, UnicodeError, getpass.GetPassWarning):
        raise CommandError("Unable to read a password securely.") from None
    if not 6 <= len(value) <= 128 or len(password) > 512:
        raise CommandError(
            "Password must have 6–128 characters and at most 512 UTF-8 bytes."
        )
    return password


async def _change_account(
    db: AsyncSession, args: argparse.Namespace, request_id: str
) -> None:
    username = args.username.strip().lower()
    if not _USERNAME.fullmatch(username):
        raise CommandError("Invalid admin username.")
    command = args.command
    encoded = (
        await hash_password(_password(args.password_stdin))
        if command in {"create", "reset"}
        else None
    )
    async with db.begin():
        if command == "create":
            assert encoded is not None
            user = AdminUser(username=username, password_hash=encoded)
            db.add(user)
            await db.flush()
        else:
            account = await db.scalar(
                select(AdminUser)
                .where(AdminUser.username == username)
                .with_for_update()
            )
            if account is None:
                raise CommandError("Admin account does not exist.")
            user = account
            if encoded is not None:
                user.password_hash = encoded
            else:
                user.is_active = False
            await db.execute(
                update(AdminSession)
                .where(
                    AdminSession.admin_user_id == user.id,
                    AdminSession.revoked_at.is_(None),
                )
                .values(revoked_at=utc_now())
            )
        audit_event(db, f"account_{command}", "success", request_id, target_id=user.id)


async def _cleanup(db: AsyncSession, days: int, request_id: str) -> None:
    if days < 90:
        raise CommandError("Audit retention must be at least 90 days.")
    now = utc_now()
    if days > (now - datetime(1000, 1, 1)).days:
        raise CommandError("Audit retention exceeds the supported date range.")
    async with db.begin():
        await db.execute(
            text(
                "DELETE FROM admin_rate_limits WHERE expires_at <= :now ORDER BY expires_at LIMIT 500"
            ),
            {"now": now},
        )
        session_cutoff = now - timedelta(days=7)
        await db.execute(
            text(
                "DELETE FROM admin_sessions WHERE expires_at <= :cutoff ORDER BY expires_at LIMIT 500"
            ),
            {"cutoff": session_cutoff},
        )
        await db.execute(
            text(
                "DELETE FROM admin_sessions WHERE revoked_at <= :cutoff ORDER BY revoked_at LIMIT 500"
            ),
            {"cutoff": session_cutoff},
        )
        await db.execute(
            text(
                "DELETE FROM admin_audit_events WHERE created_at <= :cutoff ORDER BY created_at LIMIT 500"
            ),
            {"cutoff": now - timedelta(days=days)},
        )
        audit_event(db, "cleanup", "success", request_id)


async def _run(args: argparse.Namespace) -> None:
    engine = create_engine(Settings.model_validate({}))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    request_id = f"cli_{uuid4().hex}"
    try:
        async with sessions() as db:
            if args.command == "cleanup":
                await _cleanup(db, args.audit_retention_days, request_id)
            else:
                await _change_account(db, args, request_id)
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("create", "reset", "disable"):
        command = commands.add_parser(name)
        command.add_argument("username")
        if name != "disable":
            command.add_argument("--password-stdin", action="store_true")
    cleanup = commands.add_parser("cleanup")
    cleanup.add_argument("--audit-retention-days", type=int, default=90)
    args = parser.parse_args()
    try:
        asyncio.run(_run(args))
    except CommandError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except IntegrityError as exc:
        message = (
            "Admin username already exists."
            if args.command == "create"
            and exc.orig is not None
            and exc.orig.args[:1] == (1062,)
            else "Admin database operation failed."
        )
        print(message, file=sys.stderr)
        return 1
    except (SQLAlchemyError, ValueError):
        print("Admin configuration or database operation failed.", file=sys.stderr)
        return 1
    print("Admin operation completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
