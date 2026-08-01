from __future__ import annotations

import asyncio
import json
import tempfile
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import unquote

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import get_settings
from .download_service import (
    MediaValidationError,
    owner_hash,
    validate_tiktok_url,
    validate_youtube_url,
)
from .image_service import ImageFormat, ImageValidationError, convert_image
from .jobs import (
    TERMINAL_STATUSES,
    ActiveJobError,
    DownloadJob,
    JobKind,
    MediaJobKind,
    ToolJob,
)
from .manifests import load_tool_manifests
from .pdf_service import PDFValidationError, validate_pdf
from .qr_service import QRValidationError, generate_qr_png
from .rate_limit import RateLimitExceeded
from .services import Services, build_services
from .storage import LocalArtifactStore
from .uploads import UploadTooLargeError, save_upload
from .verification import VerificationError, verify_turnstile

settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    application.state.services = await build_services(
        settings,
        start_local_worker=True,
    )
    yield
    await application.state.services.close()


app = FastAPI(
    title="Aaron Toolkit API",
    version="1.0.0",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url=None,
    lifespan=lifespan,
)


def services(request: Request) -> Services:
    return request.app.state.services


def client_ip(request: Request) -> str:
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://challenges.cloudflare.com; "
        "frame-src https://challenges.cloudflare.com; "
        "connect-src 'self' https://challenges.cloudflare.com; "
        "style-src 'self' 'unsafe-inline'; "
        "font-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'self'"
    )
    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_: Request, error: RateLimitExceeded):
    return Response(
        content=json.dumps(
            {
                "detail": {
                    "message": "Too many requests. Please wait and try again.",
                    "retryAfter": error.retry_after,
                }
            }
        ),
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        media_type="application/json",
        headers={"Retry-After": str(error.retry_after)},
    )


class QRRequest(BaseModel):
    link: str
    foreground: str = "#1A3C2B"
    background: str = "#FFFFFF"
    filename: str | None = Field(default=None, max_length=120)


class DownloadRequest(BaseModel):
    url: str
    format: Literal["mp4", "mp3", "mov"]
    turnstile_token: str | None = Field(default=None, alias="turnstileToken")
    permission_confirmed: bool = Field(alias="permissionConfirmed")


async def create_media_download_job(
    payload: DownloadRequest,
    request: Request,
    *,
    kind: MediaJobKind,
    validate_url: Callable[[str], str],
    rate_scope: str,
    rate_limit: int,
    endpoint: str,
) -> dict[str, object]:
    current = services(request)
    ip = client_ip(request)
    if not payload.permission_confirmed:
        raise HTTPException(
            status_code=422,
            detail="Confirm that you have permission to download this media.",
        )
    try:
        url = validate_url(payload.url)
        await verify_turnstile(
            payload.turnstile_token,
            remote_ip=ip,
            secret=current.settings.turnstile_secret_key,
            production=current.settings.is_production,
        )
    except (MediaValidationError, VerificationError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    await current.rate_limiter.check(
        f"{rate_scope}:{ip}",
        limit=rate_limit,
        window_seconds=3600,
    )
    job = DownloadJob.create_media(
        owner_hash=owner_hash(ip, current.settings.signing_secret),
        kind=kind,
        url=url,
        output_format=payload.format,
        ttl_seconds=current.settings.job_ttl_seconds,
    )
    try:
        await current.jobs.create(job)
    except ActiveJobError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    await current.jobs.enqueue(job.id)
    return {
        **job.public_dict(),
        "statusUrl": f"{endpoint}/{job.id}",
        "eventsUrl": f"{endpoint}/{job.id}/events",
    }


async def get_tool_job(
    request: Request,
    job_id: str,
    kind: JobKind,
) -> ToolJob:
    job = await services(request).jobs.get(job_id)
    if not job or job.kind != kind:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return job


async def tool_job_events(
    request: Request,
    job_id: str,
    kind: JobKind,
) -> StreamingResponse:
    store = services(request).jobs
    await get_tool_job(request, job_id, kind)

    async def stream() -> AsyncIterator[str]:
        last_version = ""
        while not await request.is_disconnected():
            job = await store.get(job_id)
            if not job or job.kind != kind:
                yield 'event: expired\ndata: {"status":"expired"}\n\n'
                return
            version = f"{job.updated_at}:{job.status}:{job.progress}"
            if version != last_version:
                yield f"data: {json.dumps(job.public_dict())}\n\n"
                last_version = version
            if job.status in TERMINAL_STATUSES:
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/health")
async def health(request: Request) -> dict[str, object]:
    current = services(request)
    redis_ok = True
    if current.redis:
        try:
            redis_ok = bool(await current.redis.ping())
        except Exception:
            redis_ok = False
    return {
        "status": "online" if redis_ok else "degraded",
        "queue": "redis" if current.redis else "local",
        "storage": "s3" if current.settings.has_s3 else "local",
    }


@app.get("/api/tools")
async def tools() -> list[dict[str, object]]:
    return [manifest.model_dump(by_alias=True) for manifest in load_tool_manifests()]


@app.post("/api/qr-codes")
async def create_qr(payload: QRRequest, request: Request) -> Response:
    current = services(request)
    ip = client_ip(request)
    await current.rate_limiter.check(
        f"qr:{ip}",
        limit=current.settings.qr_requests_per_minute,
        window_seconds=60,
    )
    try:
        result = generate_qr_png(
            payload.link,
            foreground=payload.foreground,
            background=payload.background,
            filename=payload.filename,
        )
    except QRValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return Response(
        content=result.content,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "X-Artifact-Filename": result.filename,
            "Cache-Control": "no-store",
        },
    )


@app.post("/api/image-conversions")
async def create_image_conversion(
    request: Request,
    file: Annotated[UploadFile, File()],
    target_format: Annotated[ImageFormat, Form(alias="format")],
    quality: Annotated[int, Form(ge=1, le=95)] = 85,
    background: Annotated[str, Form()] = "#FFFFFF",
) -> Response:
    current = services(request)
    ip = client_ip(request)
    await current.rate_limiter.check(
        f"image:{ip}",
        limit=current.settings.image_conversions_per_minute,
        window_seconds=60,
    )
    try:
        content = await file.read(current.settings.max_image_bytes + 1)
        result = convert_image(
            content,
            source_filename=file.filename,
            target=target_format,
            quality=quality,
            background=background,
            max_bytes=current.settings.max_image_bytes,
            max_pixels=current.settings.max_image_pixels,
        )
    except ImageValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await file.close()
    return Response(
        content=result.content,
        media_type=result.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "X-Artifact-Filename": result.filename,
            "X-Image-Width": str(result.width),
            "X-Image-Height": str(result.height),
            "Cache-Control": "no-store",
        },
    )


@app.post("/api/download-jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_download_job(
    payload: DownloadRequest,
    request: Request,
) -> dict[str, object]:
    current = services(request)
    return await create_media_download_job(
        payload,
        request,
        kind="youtube-download",
        validate_url=validate_youtube_url,
        rate_scope="media",
        rate_limit=current.settings.media_jobs_per_hour,
        endpoint="/api/download-jobs",
    )


@app.get("/api/download-jobs/{job_id}")
async def get_download_job(job_id: str, request: Request) -> dict[str, object]:
    job = await get_tool_job(request, job_id, "youtube-download")
    return job.public_dict()


@app.get("/api/download-jobs/{job_id}/events")
async def download_job_events(job_id: str, request: Request) -> StreamingResponse:
    return await tool_job_events(request, job_id, "youtube-download")


@app.delete("/api/download-jobs/{job_id}")
async def cancel_download_job(job_id: str, request: Request) -> dict[str, object]:
    await get_tool_job(request, job_id, "youtube-download")
    job = await services(request).jobs.request_cancel(job_id)
    assert job
    return job.public_dict()


@app.post("/api/tiktok-download-jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_tiktok_download_job(
    payload: DownloadRequest,
    request: Request,
) -> dict[str, object]:
    current = services(request)
    return await create_media_download_job(
        payload,
        request,
        kind="tiktok-download",
        validate_url=validate_tiktok_url,
        rate_scope="tiktok-media",
        rate_limit=current.settings.tiktok_jobs_per_hour,
        endpoint="/api/tiktok-download-jobs",
    )


@app.get("/api/tiktok-download-jobs/{job_id}")
async def get_tiktok_download_job(job_id: str, request: Request) -> dict[str, object]:
    job = await get_tool_job(request, job_id, "tiktok-download")
    return job.public_dict()


@app.get("/api/tiktok-download-jobs/{job_id}/events")
async def tiktok_download_job_events(job_id: str, request: Request) -> StreamingResponse:
    return await tool_job_events(request, job_id, "tiktok-download")


@app.delete("/api/tiktok-download-jobs/{job_id}")
async def cancel_tiktok_download_job(job_id: str, request: Request) -> dict[str, object]:
    await get_tool_job(request, job_id, "tiktok-download")
    job = await services(request).jobs.request_cancel(job_id)
    assert job
    return job.public_dict()


@app.post("/api/pdf-to-word-jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_pdf_to_word_job(
    request: Request,
    file: Annotated[UploadFile, File()],
    turnstile_token: Annotated[str | None, Form(alias="turnstileToken")] = None,
) -> dict[str, object]:
    current = services(request)
    ip = client_ip(request)
    try:
        await verify_turnstile(
            turnstile_token,
            remote_ip=ip,
            secret=current.settings.turnstile_secret_key,
            production=current.settings.is_production,
        )
    except VerificationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    await current.rate_limiter.check(
        f"pdf:{ip}",
        limit=current.settings.pdf_jobs_per_hour,
        window_seconds=3600,
    )

    stored = None
    try:
        with tempfile.TemporaryDirectory(prefix="aaron-toolkit-upload-") as temp:
            source = Path(temp) / "source.pdf"
            await save_upload(
                file,
                source,
                max_bytes=current.settings.max_pdf_bytes,
            )
            validate_pdf(
                source,
                max_bytes=current.settings.max_pdf_bytes,
                max_pages=current.settings.max_pdf_pages,
            )
            stored = await current.artifacts.put_input(
                source,
                filename=file.filename or "document.pdf",
            )
    except UploadTooLargeError as error:
        size_mb = current.settings.max_pdf_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"PDF files must be {size_mb} MB or smaller.",
        ) from error
    except PDFValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await file.close()

    assert stored
    job = ToolJob.create_pdf(
        owner_hash=owner_hash(ip, current.settings.signing_secret),
        input_key=stored.key,
        source_filename=stored.filename,
        ttl_seconds=current.settings.job_ttl_seconds,
    )
    try:
        await current.jobs.create(job)
    except ActiveJobError as error:
        await current.artifacts.delete_input(stored.key)
        raise HTTPException(status_code=409, detail=str(error)) from error
    await current.jobs.enqueue(job.id)
    return {
        **job.public_dict(),
        "statusUrl": f"/api/pdf-to-word-jobs/{job.id}",
        "eventsUrl": f"/api/pdf-to-word-jobs/{job.id}/events",
    }


@app.get("/api/pdf-to-word-jobs/{job_id}")
async def get_pdf_to_word_job(job_id: str, request: Request) -> dict[str, object]:
    job = await get_tool_job(request, job_id, "pdf-to-word")
    return job.public_dict()


@app.get("/api/pdf-to-word-jobs/{job_id}/events")
async def pdf_to_word_job_events(job_id: str, request: Request) -> StreamingResponse:
    return await tool_job_events(request, job_id, "pdf-to-word")


@app.delete("/api/pdf-to-word-jobs/{job_id}")
async def cancel_pdf_to_word_job(job_id: str, request: Request) -> dict[str, object]:
    current = services(request)
    existing = await get_tool_job(request, job_id, "pdf-to-word")
    job = await current.jobs.request_cancel(job_id)
    assert job
    if job.status == "cancelled" and existing.input_key:
        await current.artifacts.delete_input(existing.input_key)
        job = await current.jobs.update(job_id, input_key=None)
    return job.public_dict()


@app.get("/api/artifacts/{artifact_id}")
async def local_artifact(
    artifact_id: str,
    request: Request,
    expires: Annotated[int, Query(gt=0)],
    signature: Annotated[str, Query(min_length=64, max_length=64)],
    filename: str = Query(default="download"),
) -> FileResponse:
    artifact_store = services(request).artifacts
    if not isinstance(artifact_store, LocalArtifactStore):
        raise HTTPException(status_code=404, detail="Artifact not found.")
    path = artifact_store.resolve(
        artifact_id,
        expires=expires,
        signature=signature,
    )
    if not path:
        raise HTTPException(status_code=410, detail="Artifact link expired.")
    safe_filename = Path(unquote(filename)).name[:180] or "download"
    return FileResponse(
        path,
        filename=safe_filename,
        media_type="application/octet-stream",
        headers={"Cache-Control": "private, no-store"},
    )


web_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
if web_dist.is_dir():
    assets = web_dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa_fallback(path: str) -> FileResponse:
        candidate = (web_dist / path).resolve()
        if path and candidate.is_file() and web_dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(web_dist / "index.html")
