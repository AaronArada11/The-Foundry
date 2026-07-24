import pytest
from aaron_toolkit.jobs import (
    ActiveJobError,
    DownloadJob,
    MemoryJobStore,
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
