"""Bounded multipart upload and Windows cursor conversion."""

from __future__ import annotations

import json
import warnings
from collections.abc import AsyncGenerator, Callable, Coroutine
from datetime import UTC, datetime
from io import BytesIO
from typing import Annotated
from uuid import uuid4

from anyio import CapacityLimiter, fail_after, to_thread
from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from PIL import Image
from pydantic import ValidationError
from python_multipart.exceptions import MultipartParseError
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.requests import ClientDisconnect
from starlette.types import Message

from app.core.config import Settings
from app.db.session import get_db
from app.schemas.catalog import CatalogError, ErrorDetail, ErrorResponse
from app.schemas.studio import ConvertGeometry
from app.services.cur_encoder import encode_cur
from app.services.share_service import (
    MAX_SHARE_BYTES,
    ShareCreated,
    ShareError,
    ShareRequest,
    ShareView,
    create_share,
    get_share,
)
from app.services.storage import StorageError

MAX_UPLOAD_BYTES = 2_097_152
MAX_IMAGE_PIXELS = 12_000_000
_MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 16_384
_CONVERSIONS = CapacityLimiter(4)
_FIELDS = {"file", "size", "hotspot_x", "hotspot_y"}
_RESPONSE_HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
warnings.filterwarnings("error", category=Image.DecompressionBombWarning)


class _ConversionError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details or []


class _MultipartTooLarge(MultiPartException):
    pass


class _MemoryMultipartParser(MultiPartParser):
    spool_max_size = _MAX_MULTIPART_BYTES


def _peer_ip(request: Request) -> str:
    # The ASGI server applies proxy trust policy before setting the client address.
    return request.client.host if request.client else "unknown"


_limiter = Limiter(key_func=_peer_ip, key_style="endpoint")
Session = Annotated[AsyncSession, Depends(get_db)]


def _error_response(error: _ConversionError, request_id: str) -> JSONResponse:
    return JSONResponse(
        ErrorResponse(
            error=CatalogError(
                code=error.code,
                message=str(error),
                details=error.details,
                request_id=request_id,
            )
        ).model_dump(mode="json"),
        status_code=error.status,
        headers=_RESPONSE_HEADERS,
    )


class StudioRoute(APIRoute):
    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[object, object, Response]]:
        handler = super().get_route_handler()

        async def handle(request: Request) -> Response:
            request_id = f"req_{uuid4().hex}"
            try:
                if request.method == "POST" and self.path.endswith("/share"):
                    request = await _bounded_share_request(request)
                response = await handler(request)
            except RateLimitExceeded:
                response = _error_response(
                    _ConversionError(429, "RATE_LIMITED", "Too many requests."),
                    request_id,
                )
                response.headers["Retry-After"] = "60"
            except RequestValidationError:
                response = _error_response(
                    _ConversionError(422, "VALIDATION_ERROR", "Invalid share request."),
                    request_id,
                )
            except ShareError as error:
                response = _error_response(
                    _ConversionError(error.status, error.code, str(error)), request_id
                )
            except _ConversionError as error:
                response = _error_response(error, request_id)
            except (SQLAlchemyError, StorageError, RuntimeError):
                response = _error_response(
                    _ConversionError(
                        500, "INTERNAL_ERROR", "Unable to complete the Studio request."
                    ),
                    request_id,
                )
            response.headers["X-Request-ID"] = request_id
            return response

        return handle


router = APIRouter(prefix="/api/v1/studio", tags=["studio"], route_class=StudioRoute)


async def _limited_stream(request: Request) -> AsyncGenerator[bytes, None]:
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > _MAX_MULTIPART_BYTES:
            raise _MultipartTooLarge("Multipart body exceeds the byte budget")
        yield chunk


def _too_large() -> _ConversionError:
    return _ConversionError(413, "FILE_TOO_LARGE", "Image must be at most 2 MiB.")


async def _read_upload(request: Request) -> tuple[bytes, ConvertGeometry]:
    media_type = request.headers.get("content-type", "").split(";", 1)[0]
    if media_type.strip().lower() != "multipart/form-data":
        raise _ConversionError(
            415, "UNSUPPORTED_MEDIA_TYPE", "Expected a multipart upload."
        )
    length = request.headers.get("content-length")
    if (
        length is not None
        and length.isascii()
        and length.isdecimal()
        and (len(length) > 10 or int(length) > _MAX_MULTIPART_BYTES)
    ):
        raise _too_large()
    parser = _MemoryMultipartParser(
        request.headers,
        _limited_stream(request),
        max_files=1,
        max_fields=3,
        max_part_size=64,
    )
    try:
        form = await parser.parse()
    except _MultipartTooLarge:
        raise _too_large() from None
    except (MultiPartException, MultipartParseError, ClientDisconnect):
        raise _ConversionError(
            422, "VALIDATION_ERROR", "Invalid multipart upload."
        ) from None

    try:
        file = form.get("file")
        if (
            set(form) != _FIELDS
            or len(form.multi_items()) != len(_FIELDS)
            or not isinstance(file, UploadFile)
        ):
            raise _ConversionError(
                422, "VALIDATION_ERROR", "Expected file, size and both hotspots."
            )
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise _too_large()
        try:
            geometry = ConvertGeometry.model_validate(
                {key: form[key] for key in ("size", "hotspot_x", "hotspot_y")}
            )
        except ValidationError as error:
            fields = {item["loc"][0] for item in error.errors() if item["loc"]}
            code = (
                "INVALID_HOTSPOT"
                if fields & {"hotspot_x", "hotspot_y"} and "size" not in fields
                else "VALIDATION_ERROR"
            )
            details = [
                ErrorDetail(field=str(item["loc"][0]), reason=item["msg"])
                for item in error.errors()
                if item["loc"]
            ]
            raise _ConversionError(
                422, code, "Invalid conversion geometry.", details
            ) from None
        return data, geometry
    finally:
        await form.close()


def _image_format(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if data.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "WEBP"
    raise _ConversionError(
        415, "UNSUPPORTED_MEDIA_TYPE", "Only PNG, JPEG and WebP are supported."
    )


def _convert_image(data: bytes, geometry: ConvertGeometry) -> bytes:
    expected = _image_format(data)
    try:
        with Image.open(BytesIO(data), formats=[expected]) as probe:
            if probe.format != expected:
                raise _ConversionError(
                    415,
                    "UNSUPPORTED_MEDIA_TYPE",
                    "Image format does not match its signature.",
                )
            if probe.width * probe.height > MAX_IMAGE_PIXELS or getattr(
                probe, "is_animated", False
            ):
                raise _ConversionError(
                    422,
                    "CORRUPT_IMAGE",
                    "Image exceeds the pixel limit or is animated.",
                )
            probe.verify()
        with Image.open(BytesIO(data), formats=[expected]) as image:
            image.load()
            return encode_cur(
                image, geometry.size, geometry.hotspot_x, geometry.hotspot_y
            )
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        ValueError,
        SyntaxError,
        EOFError,
    ):
        raise _ConversionError(
            422,
            "CORRUPT_IMAGE",
            "Image could not be decoded within the supported limits.",
        ) from None


@router.post(
    "/convert",
    response_class=Response,
    responses={
        200: {
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "format": "binary"}
                }
            }
        },
        413: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
    },
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": sorted(_FIELDS),
                        "properties": {
                            "file": {"type": "string", "format": "binary"},
                            "size": {"type": "integer", "enum": [32, 48]},
                            "hotspot_x": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 47,
                            },
                            "hotspot_y": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 47,
                            },
                        },
                    }
                }
            },
        }
    },
)
@_limiter.limit("10/minute")
async def convert(request: Request) -> Response:
    data, geometry = await _read_upload(request)
    try:
        with fail_after(10):
            binary = await to_thread.run_sync(
                _convert_image, data, geometry, limiter=_CONVERSIONS
            )
    except TimeoutError:
        raise _ConversionError(
            422, "CORRUPT_IMAGE", "Image conversion timed out."
        ) from None
    return Response(
        binary,
        media_type="application/octet-stream",
        headers={
            **_RESPONSE_HEADERS,
            "Content-Disposition": 'attachment; filename="custom-cursor.cur"',
        },
    )


def _unique_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ValueError("Duplicate JSON key")
    return result


@_limiter.limit("5/minute")
async def _bounded_share_request(request: Request) -> Request:
    media_type = request.headers.get("content-type", "").split(";", 1)[0]
    if media_type.strip().lower() != "application/json":
        raise ShareError(
            415, "UNSUPPORTED_MEDIA_TYPE", "Expected a JSON share request."
        )
    body = bytearray()
    try:
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_SHARE_BYTES:
                raise ShareError(
                    413, "PAYLOAD_TOO_LARGE", "Share request must be at most 8 KiB."
                )
            body.extend(chunk)
        json.loads(body.decode("utf-8"), object_pairs_hook=_unique_json_keys)
    except (ValueError, RecursionError, ClientDisconnect):
        raise ShareError(422, "VALIDATION_ERROR", "Invalid share JSON.") from None

    async def receive() -> Message:
        return {"type": "http.request", "body": bytes(body), "more_body": False}

    return Request(request.scope, receive=receive)


@router.post(
    "/share",
    status_code=201,
    responses={
        status: {"model": ErrorResponse} for status in (413, 415, 422, 429, 500)
    },
)
async def post_share(
    response: Response, payload: ShareRequest, session: Session
) -> ShareCreated:
    created = await create_share(session, payload, Settings.model_validate({}))
    response.headers["Cache-Control"] = "no-store"
    return created


@router.get(
    "/share/{code}",
    responses={404: {"model": ErrorResponse}, 410: {"model": ErrorResponse}},
)
async def view_share(code: str, response: Response, session: Session) -> ShareView:
    share = await get_share(session, code, Settings.model_validate({}))
    remaining = (share.expires_at - datetime.now(UTC)).total_seconds()
    response.headers["Cache-Control"] = (
        f"public, max-age={max(0, min(30, int(remaining)))}"
    )
    return share
