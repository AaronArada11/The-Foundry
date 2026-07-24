from __future__ import annotations

from typing import Protocol

from .jobs import JobKind, JobStore


class JobProcessor(Protocol):
    async def process(self, job_id: str) -> None: ...


class ToolJobDispatcher:
    def __init__(self, store: JobStore, processors: dict[JobKind, JobProcessor]) -> None:
        self.store = store
        self.processors = processors

    async def process(self, job_id: str) -> None:
        job = await self.store.get(job_id)
        if not job:
            return
        processor = self.processors.get(job.kind)
        if not processor:
            await self.store.update(
                job_id,
                status="failed",
                error="This tool is temporarily unavailable. Please try again later.",
            )
            return
        await processor.process(job_id)
