"""Async MySQL engine and request-scoped SQLAlchemy sessions."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TypedDict, cast

from fastapi import FastAPI, Request
from sqlalchemy import URL
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import Settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Shared metadata for future ORM models."""


class DatabaseState(TypedDict):
    """State shared by the lifespan and request dependencies."""

    db_sessions: async_sessionmaker[AsyncSession]


def create_engine(settings: Settings) -> AsyncEngine:
    """Create a lazy connection pool with UTC MySQL sessions."""
    url = URL.create(
        "mysql+asyncmy",
        username=settings.database_user,
        password=settings.database_password.get_secret_value(),
        host=settings.database_host,
        port=settings.database_port,
        database=settings.database_name,
    )
    return create_async_engine(
        url,
        connect_args={"init_command": "SET SESSION time_zone = '+00:00'"},
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=5,
        max_overflow=5,
        pool_timeout=30,
        hide_parameters=True,
    )


@asynccontextmanager
async def database_lifespan(_app: FastAPI) -> AsyncIterator[DatabaseState]:
    """Validate settings at startup and dispose of the pool at shutdown."""
    engine = create_engine(Settings.model_validate({}))
    try:
        yield {"db_sessions": async_sessionmaker(engine, expire_on_commit=False)}
    finally:
        await engine.dispose()


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield one session per request. Callers own their transaction boundaries."""
    sessions = cast("async_sessionmaker[AsyncSession]", request.state.db_sessions)
    async with sessions() as session:
        try:
            yield session
        except OperationalError as exc:
            if exc.orig is None or exc.orig.args[:1] != (1045,):
                raise
            message = "MySQL rejected the application credentials. Check DATABASE_USER and DATABASE_PASSWORD."
            logger.error(message, extra={"mysql_error_code": 1045})
            raise RuntimeError(message) from None
