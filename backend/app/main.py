"""Minimal ASGI application for the backend container."""

from __future__ import annotations

from fastapi import FastAPI

from app.db.session import database_lifespan

app = FastAPI(
    title="Custom Cursor Studio & Library",
    lifespan=database_lifespan,
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
)
