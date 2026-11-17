"""Typed backend settings from the environment and local dotenv files."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import (
    AliasChoices,
    AnyHttpUrl,
    Field,
    SecretStr,
    StringConstraints,
    TypeAdapter,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

NonEmptyString = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
_http_url = TypeAdapter(AnyHttpUrl)
_local_frontend = "http://localhost:5173"


class Settings(BaseSettings):
    """Validated service configuration. Process environment overrides dotenv."""

    model_config = SettingsConfigDict(
        env_file=(Path(__file__).resolve().parents[3] / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    app_env: Literal["development", "production"] = "development"
    auto_seed: bool = False

    database_host: NonEmptyString = "127.0.0.1"
    database_port: int = Field(default=3307, ge=1, le=65535)
    database_name: NonEmptyString = Field(
        validation_alias=AliasChoices("DATABASE_NAME", "MYSQL_DATABASE")
    )
    database_user: NonEmptyString = Field(
        validation_alias=AliasChoices("DATABASE_USER", "MYSQL_USER")
    )
    database_password: SecretStr = Field(
        validation_alias=AliasChoices("DATABASE_PASSWORD", "MYSQL_PASSWORD"),
        repr=False,
    )

    public_api_base_url: AnyHttpUrl = AnyHttpUrl("http://localhost:8000")
    public_frontend_base_url: AnyHttpUrl = AnyHttpUrl(_local_frontend)
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [_local_frontend], min_length=1
    )
    storage_backend: Literal["local", "r2"] = "local"
    r2_endpoint: AnyHttpUrl | None = None
    r2_bucket: NonEmptyString | None = None
    r2_access_key_id: SecretStr | None = Field(default=None, repr=False)
    r2_secret_access_key: SecretStr | None = Field(default=None, repr=False)
    public_cdn_base_url: AnyHttpUrl | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        return value.split(",") if isinstance(value, str) else value

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, values: list[str]) -> list[str]:
        origins: list[str] = []
        for value in values:
            url = _http_url.validate_python(value.strip())
            if (
                url.path != "/"
                or url.username is not None
                or url.password is not None
                or url.query is not None
                or url.fragment is not None
            ):
                raise ValueError("CORS_ORIGINS must contain HTTP(S) origins")
            origins.append(str(url).removesuffix("/"))
        return origins

    @field_validator("database_password", "r2_access_key_id", "r2_secret_access_key")
    @classmethod
    def reject_blank_secret(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not value.get_secret_value().strip():
            raise ValueError("credential must not be blank")
        return value

    @model_validator(mode="after")
    def validate_environment(self) -> Self:
        if self.app_env == "production":
            required = (
                "database_host",
                "database_port",
                "public_api_base_url",
                "public_frontend_base_url",
                "cors_origins",
            )
            missing = [
                name.upper() for name in required if name not in self.model_fields_set
            ]
            if missing:
                raise ValueError(f"production requires {', '.join(missing)}")
            if self.auto_seed:
                raise ValueError("AUTO_SEED must be false in production")
            if (
                self.public_api_base_url.scheme != "https"
                or self.public_frontend_base_url.scheme != "https"
                or any(
                    not origin.startswith("https://") for origin in self.cors_origins
                )
            ):
                raise ValueError(
                    "production public URLs and CORS origins must use HTTPS"
                )
            if self.storage_backend != "r2":
                raise ValueError("production requires STORAGE_BACKEND=r2")

        if self.storage_backend == "r2":
            required_r2 = (
                "r2_endpoint",
                "r2_bucket",
                "r2_access_key_id",
                "r2_secret_access_key",
                "public_cdn_base_url",
            )
            missing = [
                name.upper() for name in required_r2 if getattr(self, name) is None
            ]
            if missing:
                raise ValueError(f"R2 storage requires {', '.join(missing)}")
        return self
