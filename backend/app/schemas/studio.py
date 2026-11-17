"""Validation for Studio conversion geometry."""

from __future__ import annotations

from re import fullmatch
from typing import Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator


class ConvertGeometry(BaseModel):
    size: Literal[32, 48]
    hotspot_x: int = Field(ge=0)
    hotspot_y: int = Field(ge=0)

    @field_validator("size", "hotspot_x", "hotspot_y", mode="before")
    @classmethod
    def parse_decimal_integer(cls, value: object) -> int:
        if type(value) is int:
            return value
        if isinstance(value, str) and fullmatch(r"-?[0-9]{1,10}", value):
            return int(value)
        raise ValueError("must be a decimal integer")

    @field_validator("hotspot_x", "hotspot_y")
    @classmethod
    def check_canvas_bounds(cls, value: int, info: ValidationInfo) -> int:
        size = info.data.get("size")
        if size is not None and value >= size:
            raise ValueError("must be less than the canvas size")
        return value
