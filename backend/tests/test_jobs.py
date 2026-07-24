import pytest
from aaron_toolkit.jobs import (
    ActiveJobError,
    DownloadJob,
    MemoryJobStore,
    ToolJob,
)


def make_job(owner: str = "owner") -> DownloadJob:
    return DownloadJob.create(
        owner_hash=owner,
        url="https://youtu.be/dQw4w9WgXcQ",
        output_format="mp4",
        ttl_seconds=3600,
    )


@pytest.mark.asyncio
async def test_one_active_job_per_owner_then_release_on_terminal_status():
    store = MemoryJobStore()
    first = await store.create(make_job())

    with pytest.raises(ActiveJobError):
        await store.create(make_job())

    await store.update(first.id, status="ready")
    second = await store.create(make_job())
    assert second.id != first.id


@pytest.mark.asyncio
async def test_queue_and_cancelled_queued_job():
    store = MemoryJobStore()
    job = await store.create(make_job())
    await store.enqueue(job.id)

    assert await store.dequeue(timeout=1) == job.id
    cancelled = await store.request_cancel(job.id)
    assert cancelled
    assert cancelled.status == "cancelled"
    assert cancelled.cancel_requested


@pytest.mark.asyncio
async def test_owner_can_have_one_active_job_of_each_kind():
    store = MemoryJobStore()
    await store.create(make_job())
    pdf = ToolJob.create_pdf(
        owner_hash="owner",
        input_key="input-key",
        source_filename="document.pdf",
        ttl_seconds=3600,
    )

    created = await store.create(pdf)

    assert created.kind == "pdf-to-word"


def test_legacy_job_payload_is_read_as_youtube_job():
    job = make_job()
    payload = job.storage_dict()
    for key in ("kind", "version", "input_key", "source_filename"):
        payload.pop(key)

    restored = ToolJob.from_payload(payload)

    assert restored.kind == "youtube-download"
    assert restored.version == 1
    assert "kind" not in restored.public_dict()
