from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, replace
from typing import Literal, Protocol

from redis.asyncio import Redis

JobStatus = Literal[
    "queued",
    "downloading",
    "processing",
    "ready",
    "failed",
    "expired",
    "cancelled",
]
TERMINAL_STATUSES = {"ready", "failed", "expired", "cancelled"}


class ActiveJobError(RuntimeError):
    pass


@dataclass(frozen=True)
class DownloadJob:
    id: str
    owner_hash: str
    url: str
    output_format: Literal["mp4", "mp3", "mov"]
    status: JobStatus
    progress: float
    title: str | None
    duration_seconds: int | None
    filename: str | None
    download_url: str | None
    artifact_expires_at: float | None
    error: str | None
    cancel_requested: bool
    created_at: float
    updated_at: float
    expires_at: float

    @classmethod
    def create(
        cls,
        *,
        owner_hash: str,
        url: str,
        output_format: Literal["mp4", "mp3", "mov"],
        ttl_seconds: int,
    ) -> DownloadJob:
        now = time.time()
        return cls(
            id=str(uuid.uuid4()),
            owner_hash=owner_hash,
            url=url,
            output_format=output_format,
            status="queued",
            progress=0,
            title=None,
            duration_seconds=None,
            filename=None,
            download_url=None,
            artifact_expires_at=None,
            error=None,
            cancel_requested=False,
            created_at=now,
            updated_at=now,
            expires_at=now + ttl_seconds,
        )

    def public_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "format": self.output_format,
            "status": self.status,
            "progress": round(self.progress, 1),
            "title": self.title,
            "durationSeconds": self.duration_seconds,
            "filename": self.filename,
            "downloadUrl": self.download_url,
            "artifactExpiresAt": self.artifact_expires_at,
            "error": self.error,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "expiresAt": self.expires_at,
        }


class JobStore(Protocol):
    async def create(self, job: DownloadJob) -> DownloadJob: ...

    async def get(self, job_id: str) -> DownloadJob | None: ...

    async def update(self, job_id: str, **changes: object) -> DownloadJob: ...

    async def enqueue(self, job_id: str) -> None: ...

    async def dequeue(self, timeout: int = 5) -> str | None: ...

    async def request_cancel(self, job_id: str) -> DownloadJob | None: ...


class MemoryJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, DownloadJob] = {}
        self._active_owner: dict[str, str] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._lock = asyncio.Lock()

    async def create(self, job: DownloadJob) -> DownloadJob:
        async with self._lock:
            active_id = self._active_owner.get(job.owner_hash)
            if active_id:
                active = self._jobs.get(active_id)
                if active and active.status not in TERMINAL_STATUSES:
                    raise ActiveJobError("one active media job is allowed per visitor")
            self._jobs[job.id] = job
            self._active_owner[job.owner_hash] = job.id
        return job

    async def get(self, job_id: str) -> DownloadJob | None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job and job.expires_at <= time.time() and job.status != "expired":
                job = replace(
                    job,
                    status="expired",
                    download_url=None,
                    updated_at=time.time(),
                )
                self._jobs[job_id] = job
                self._active_owner.pop(job.owner_hash, None)
            return job

    async def update(self, job_id: str, **changes: object) -> DownloadJob:
        async with self._lock:
            job = self._jobs[job_id]
            updated = replace(job, updated_at=time.time(), **changes)
            self._jobs[job_id] = updated
            if updated.status in TERMINAL_STATUSES:
                self._active_owner.pop(updated.owner_hash, None)
            return updated

    async def enqueue(self, job_id: str) -> None:
        await self._queue.put(job_id)

    async def dequeue(self, timeout: int = 5) -> str | None:
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except TimeoutError:
            return None

    async def request_cancel(self, job_id: str) -> DownloadJob | None:
        job = await self.get(job_id)
        if not job or job.status in TERMINAL_STATUSES:
            return job
        status: JobStatus = "cancelled" if job.status == "queued" else job.status
        return await self.update(job_id, cancel_requested=True, status=status)


class RedisJobStore:
    def __init__(self, redis: Redis, *, ttl_seconds: int) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds

    @staticmethod
    def _job_key(job_id: str) -> str:
        return f"job:{job_id}"

    @staticmethod
    def _owner_key(owner_hash: str) -> str:
        return f"job-owner:{owner_hash}"

    async def create(self, job: DownloadJob) -> DownloadJob:
        claimed = await self._redis.set(
            self._owner_key(job.owner_hash),
            job.id,
            ex=self._ttl_seconds,
            nx=True,
        )
        if not claimed:
            raise ActiveJobError("one active media job is allowed per visitor")
        await self._redis.set(
            self._job_key(job.id),
            json.dumps(job.__dict__),
            ex=self._ttl_seconds,
        )
        return job

    async def get(self, job_id: str) -> DownloadJob | None:
        raw = await self._redis.get(self._job_key(job_id))
        if not raw:
            return None
        payload = json.loads(raw)
        job = DownloadJob(**payload)
        if job.expires_at <= time.time() and job.status != "expired":
            job = await self.update(job_id, status="expired", download_url=None)
        return job

    async def update(self, job_id: str, **changes: object) -> DownloadJob:
        raw = await self._redis.get(self._job_key(job_id))
        if not raw:
            raise KeyError(job_id)
        job = DownloadJob(**json.loads(raw))
        updated = replace(job, updated_at=time.time(), **changes)
        await self._redis.set(
            self._job_key(job_id),
            json.dumps(updated.__dict__),
            ex=max(1, int(updated.expires_at - time.time())),
        )
        if updated.status in TERMINAL_STATUSES:
            await self._redis.delete(self._owner_key(updated.owner_hash))
        return updated

    async def enqueue(self, job_id: str) -> None:
        await self._redis.lpush("download-jobs", job_id)

    async def dequeue(self, timeout: int = 5) -> str | None:
        item = await self._redis.brpop("download-jobs", timeout=timeout)
        if not item:
            return None
        return item[1].decode() if isinstance(item[1], bytes) else item[1]

    async def request_cancel(self, job_id: str) -> DownloadJob | None:
        job = await self.get(job_id)
        if not job or job.status in TERMINAL_STATUSES:
            return job
        status: JobStatus = "cancelled" if job.status == "queued" else job.status
        return await self.update(job_id, cancel_requested=True, status=status)
