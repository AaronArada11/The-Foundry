import time
from pathlib import Path

import aaron_toolkit.download_service as download_service
import pytest
from aaron_toolkit.config import Settings
from aaron_toolkit.download_service import DownloadProcessor
from aaron_toolkit.jobs import DownloadJob, MemoryJobStore
from aaron_toolkit.media_options import build_ydl_options
from aaron_toolkit.storage import Artifact


class FakeArtifactStore:
    async def put(self, source: Path, *, filename: str) -> Artifact:
        assert source.read_bytes() == b"media"
        return Artifact(
            id="artifact",
            filename=filename,
            download_url="https://storage.example/download",
            expires_at=9999999999,
        )


class StubDownloadProcessor(DownloadProcessor):
    def _download_blocking(self, job, directory, loop, stop_event):
        del job, loop, stop_event
        output = directory / "media.mp4"
        output.write_bytes(b"media")
        return {
            "path": output,
            "title": "Sample video",
            "duration": 120,
            "filename": "Sample_video.mp4",
        }


@pytest.mark.asyncio
async def test_processor_moves_job_through_ready_state():
    store = MemoryJobStore()
    job = await store.create(
        DownloadJob.create(
            owner_hash="owner",
            url="https://youtu.be/dQw4w9WgXcQ",
            output_format="mp4",
            ttl_seconds=3600,
        )
    )
    processor = StubDownloadProcessor(
        store=store,
        artifacts=FakeArtifactStore(),
        settings=Settings(),
    )

    await processor.process(job.id)

    ready = await store.get(job.id)
    assert ready
    assert ready.status == "ready"
    assert ready.progress == 100
    assert ready.download_url == "https://storage.example/download"


@pytest.mark.asyncio
async def test_processor_handles_tiktok_media_jobs():
    store = MemoryJobStore()
    job = await store.create(
        DownloadJob.create_tiktok(
            owner_hash="owner",
            url="https://www.tiktok.com/@creator/video/7461234567890123456",
            output_format="mp4",
            ttl_seconds=3600,
        )
    )
    processor = StubDownloadProcessor(
        store=store,
        artifacts=FakeArtifactStore(),
        settings=Settings(),
    )

    await processor.process(job.id)

    ready = await store.get(job.id)
    assert ready
    assert ready.kind == "tiktok-download"
    assert ready.status == "ready"
    assert ready.download_url == "https://storage.example/download"


class SlowDownloadProcessor(DownloadProcessor):
    def _download_blocking(self, job, directory, loop, stop_event):
        del job, directory, loop
        while not stop_event.is_set():
            time.sleep(0.005)
        return {}


@pytest.mark.asyncio
async def test_processor_fails_jobs_that_exceed_execution_timeout():
    store = MemoryJobStore()
    job = await store.create(
        DownloadJob.create(
            owner_hash="owner",
            url="https://youtu.be/dQw4w9WgXcQ",
            output_format="mp4",
            ttl_seconds=3600,
        )
    )
    settings = Settings()
    settings.media_timeout_seconds = 0.01
    processor = SlowDownloadProcessor(
        store=store,
        artifacts=FakeArtifactStore(),
        settings=settings,
    )

    await processor.process(job.id)

    failed = await store.get(job.id)
    assert failed
    assert failed.status == "failed"
    assert failed.error == "The media job exceeded the public execution time limit."


def test_long_video_defaults_allow_two_hour_jobs():
    settings = Settings()

    assert settings.max_media_duration_seconds == 2 * 60 * 60
    assert settings.media_timeout_seconds == 60 * 60
    assert settings.job_ttl_seconds > settings.media_timeout_seconds


@pytest.mark.asyncio
async def test_processor_accepts_a_ninety_minute_video(monkeypatch):
    store = MemoryJobStore()
    job = await store.create(
        DownloadJob.create(
            owner_hash="owner",
            url="https://youtu.be/dQw4w9WgXcQ",
            output_format="mp4",
            ttl_seconds=7200,
        )
    )

    class FakeYoutubeDL:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def extract_info(self, url, *, download):
            assert url == job.url
            assert download is True
            assert self.options["match_filter"](
                {"duration": 90 * 60}, incomplete=False
            ) is None
            output = Path(self.options["outtmpl"]).parent / "long-video.mp4"
            output.write_bytes(b"media")
            return {"title": "Long video", "duration": 90 * 60}

    monkeypatch.setattr(download_service, "YoutubeDL", FakeYoutubeDL)
    processor = DownloadProcessor(
        store=store,
        artifacts=FakeArtifactStore(),
        settings=Settings(),
    )

    await processor.process(job.id)

    ready = await store.get(job.id)
    assert ready
    assert ready.status == "ready"
    assert ready.duration_seconds == 90 * 60


def test_video_format_selection_reserves_space_for_audio():
    max_bytes = 500 * 1024 * 1024

    options = build_ydl_options(
        "mp4",
        outtmpl="%(title)s.%(ext)s",
        max_filesize=max_bytes,
    )

    assert options["format"] == (
        "bestvideo[filesize_approx<=?393216000]"
        "+bestaudio[filesize_approx<=?131072000]"
        "/best[filesize_approx<=?524288000]"
    )
