from __future__ import annotations

import asyncio
import hashlib
import hmac
import re
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from yt_dlp import DownloadError, YoutubeDL
from yt_dlp.utils import sanitize_filename

from .config import Settings
from .jobs import MEDIA_JOB_KINDS, TERMINAL_STATUSES, DownloadJob, JobStore
from .media_options import build_ydl_options
from .storage import ArtifactStore

ALLOWED_YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
}
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
ALLOWED_TIKTOK_HOSTS = {
    "tiktok.com",
    "www.tiktok.com",
    "m.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
}
TIKTOK_VIDEO_PATH = re.compile(r"^/@[^/]+/video/(?P<id>[0-9]{6,32})/?$")
TIKTOK_SHORT_PATH = re.compile(r"^/(?:t/)?[A-Za-z0-9_-]{5,32}/?$")


class MediaValidationError(ValueError):
    pass


class DownloadCancelled(RuntimeError):
    pass


def validate_youtube_url(value: str) -> str:
    url = value.strip()
    if len(url) > 2048:
        raise MediaValidationError("URL must be 2,048 characters or fewer.")
    parsed = urlparse(url)
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname not in ALLOWED_YOUTUBE_HOSTS
        or parsed.username
        or parsed.password
        or parsed.port not in {None, 80, 443}
    ):
        raise MediaValidationError("Enter a valid YouTube or youtu.be video URL.")
    query = parse_qs(parsed.query)
    if "list" in query:
        raise MediaValidationError("Playlists are not supported. Use one video URL.")

    video_id = None
    if parsed.hostname in {"youtu.be", "www.youtu.be"}:
        video_id = parsed.path.strip("/").split("/", 1)[0]
    elif parsed.path == "/watch":
        video_id = query.get("v", [None])[0]
    elif parsed.path.startswith(("/shorts/", "/live/", "/embed/")):
        parts = parsed.path.strip("/").split("/")
        video_id = parts[1] if len(parts) > 1 else None
    if not video_id or not VIDEO_ID.fullmatch(video_id):
        raise MediaValidationError("Use a direct, individual YouTube video URL.")
    return url


def validate_tiktok_url(value: str) -> str:
    url = value.strip()
    if len(url) > 2048:
        raise MediaValidationError("URL must be 2,048 characters or fewer.")
    parsed = urlparse(url)
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname not in ALLOWED_TIKTOK_HOSTS
        or parsed.username
        or parsed.password
        or parsed.port not in {None, 80, 443}
    ):
        raise MediaValidationError("Enter a valid TikTok video URL.")

    is_canonical_video = bool(TIKTOK_VIDEO_PATH.fullmatch(parsed.path))
    is_short_share = parsed.hostname in {"vm.tiktok.com", "vt.tiktok.com"} and bool(
        TIKTOK_SHORT_PATH.fullmatch(parsed.path)
    )
    is_web_share = parsed.hostname in {"tiktok.com", "www.tiktok.com"} and bool(
        re.fullmatch(r"/t/[A-Za-z0-9_-]{5,32}/?", parsed.path)
    )
    if not (is_canonical_video or is_short_share or is_web_share):
        raise MediaValidationError("Use a direct, individual TikTok video URL.")
    return url


def owner_hash(ip_address: str, secret: str) -> str:
    return hmac.new(secret.encode(), ip_address.encode(), hashlib.sha256).hexdigest()


class DownloadProcessor:
    def __init__(
        self,
        *,
        store: JobStore,
        artifacts: ArtifactStore,
        settings: Settings,
    ) -> None:
        self.store = store
        self.artifacts = artifacts
        self.settings = settings

    async def process(self, job_id: str) -> None:
        job = await self.store.get(job_id)
        if not job or job.kind not in MEDIA_JOB_KINDS or job.status in TERMINAL_STATUSES:
            return
        if job.cancel_requested:
            await self.store.update(job_id, status="cancelled")
            return

        await self.store.update(job_id, status="downloading", progress=1)
        loop = asyncio.get_running_loop()
        stop_event = threading.Event()
        try:
            with tempfile.TemporaryDirectory(prefix=f"aaron-toolkit-{job_id[:8]}-") as temp:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        self._download_blocking,
                        job,
                        Path(temp),
                        loop,
                        stop_event,
                    ),
                    timeout=self.settings.media_timeout_seconds,
                )
                current = await self.store.get(job_id)
                if current and current.cancel_requested:
                    raise DownloadCancelled
                await self.store.update(job_id, status="processing", progress=96)
                artifact = await self.artifacts.put(
                    result["path"],
                    filename=result["filename"],
                )
                await self.store.update(
                    job_id,
                    status="ready",
                    progress=100,
                    title=result["title"],
                    duration_seconds=result["duration"],
                    filename=artifact.filename,
                    download_url=artifact.download_url,
                    artifact_expires_at=artifact.expires_at,
                )
        except TimeoutError:
            stop_event.set()
            await self.store.update(
                job_id,
                status="failed",
                error="The media job exceeded the public execution time limit.",
                download_url=None,
            )
        except DownloadCancelled:
            stop_event.set()
            await self.store.update(
                job_id,
                status="cancelled",
                error="The job was cancelled.",
                download_url=None,
            )
        except (DownloadError, OSError, ValueError) as error:
            await self.store.update(
                job_id,
                status="failed",
                error=self._public_error(error),
                download_url=None,
            )

    def _download_blocking(
        self,
        job: DownloadJob,
        directory: Path,
        loop: asyncio.AbstractEventLoop,
        stop_event: threading.Event,
    ) -> dict[str, object]:
        if not job.url or not job.output_format:
            raise ValueError("The media job is missing its source or output format.")
        last_update = 0.0

        def sync_update(**changes: object) -> None:
            future = asyncio.run_coroutine_threadsafe(
                self.store.update(job.id, **changes),
                loop,
            )
            future.result(timeout=5)

        def check_cancelled() -> None:
            if stop_event.is_set():
                raise DownloadCancelled
            future = asyncio.run_coroutine_threadsafe(self.store.get(job.id), loop)
            current = future.result(timeout=5)
            if current and current.cancel_requested:
                raise DownloadCancelled

        def progress_hook(payload: dict[str, object]) -> None:
            nonlocal last_update
            check_cancelled()
            status = payload.get("status")
            if status == "downloading":
                now = time.monotonic()
                if now - last_update < 0.4:
                    return
                last_update = now
                downloaded = float(payload.get("downloaded_bytes") or 0)
                total = float(
                    payload.get("total_bytes") or payload.get("total_bytes_estimate") or 0
                )
                percent = min(94.0, max(1.0, downloaded / total * 94)) if total else 5.0
                sync_update(status="downloading", progress=percent)
            elif status == "finished":
                sync_update(status="processing", progress=95)

        def match_filter(info: dict[str, object], *, incomplete: bool) -> str | None:
            del incomplete
            duration = info.get("duration")
            if duration and float(duration) > self.settings.max_media_duration_seconds:
                minutes = self.settings.max_media_duration_seconds // 60
                return f"Videos longer than {minutes} minutes are not supported."
            return None

        outtmpl = str(directory / "%(title).180B [%(id)s].%(ext)s")
        options = build_ydl_options(
            job.output_format,
            outtmpl=outtmpl,
            progress_hooks=[progress_hook],
            match_filter=match_filter,
            max_filesize=self.settings.max_media_bytes,
        )

        with YoutubeDL(options) as downloader:
            info = downloader.extract_info(job.url, download=True)
        check_cancelled()
        candidates = [
            path
            for path in directory.iterdir()
            if path.is_file()
            and path.suffix.lower() == f".{job.output_format}"
            and path.stat().st_size <= self.settings.max_media_bytes
        ]
        if not candidates:
            raise ValueError("The requested output file was not produced.")
        output = max(candidates, key=lambda path: path.stat().st_mtime)
        title = str(info.get("title") or "media")[:180]
        safe_title = sanitize_filename(title, restricted=True)[:120] or "media"
        filename = f"{safe_title}.{job.output_format}"
        return {
            "path": output,
            "title": title,
            "duration": int(info.get("duration") or 0) or None,
            "filename": filename,
        }

    @staticmethod
    def _public_error(error: Exception) -> str:
        message = str(error)
        if "longer than" in message:
            return message.split("ERROR:", 1)[-1].strip()
        if "File is larger" in message or "max-filesize" in message:
            return "The resulting file exceeds the public download limit."
        return "The media could not be processed. Check the URL and try again."
