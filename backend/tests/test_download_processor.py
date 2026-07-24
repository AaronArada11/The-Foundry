import time
from pathlib import Path

import pytest
from aaron_toolkit.config import Settings
from aaron_toolkit.download_service import DownloadProcessor
from aaron_toolkit.jobs import DownloadJob, MemoryJobStore
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
