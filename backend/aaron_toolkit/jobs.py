from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import asdict, dataclass, replace
from typing import Literal, Protocol

from redis.asyncio import Redis

MediaJobKind = Literal["youtube-download", "tiktok-download"]
JobKind = Literal["youtube-download", "tiktok-download", "pdf-to-word"]
MEDIA_JOB_KINDS = frozenset({"youtube-download", "tiktok-download"})
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
CURRENT_JOB_VERSION = 2


class ActiveJobError(RuntimeError):
    pass


@dataclass(frozen=True)
class ToolJob:
    id: str
    owner_hash: str
    kind: JobKind
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
    version: int = CURRENT_JOB_VERSION
    url: str | None = None
    output_format: Literal["mp4", "mp3", "mov"] | None = None
    input_key: str | None = None
    source_filename: str | None = None

    @classmethod
    def create(
        cls,
        *,
        owner_hash: str,
        url: str,
        output_format: Literal["mp4", "mp3", "mov"],
        ttl_seconds: int,
    ) -> ToolJob:
        return cls.create_media(
            owner_hash=owner_hash,
            kind="youtube-download",
            url=url,
            output_format=output_format,
            ttl_seconds=ttl_seconds,
        )

    @classmethod
    def create_tiktok(
        cls,
        *,
        owner_hash: str,
        url: str,
        output_format: Literal["mp4", "mp3", "mov"],
        ttl_seconds: int,
    ) -> ToolJob:
        return cls.create_media(
            owner_hash=owner_hash,
            kind="tiktok-download",
            url=url,
            output_format=output_format,
            ttl_seconds=ttl_seconds,
        )

    @classmethod
    def create_media(
        cls,
        *,
        owner_hash: str,
        kind: MediaJobKind,
        url: str,
        output_format: Literal["mp4", "mp3", "mov"],
        ttl_seconds: int,
    ) -> ToolJob:
        return cls._new(
            owner_hash=owner_hash,
            kind=kind,
            ttl_seconds=ttl_seconds,
            url=url,
            output_format=output_format,
        )

    @classmethod
    def create_pdf(
        cls,
        *,
        owner_hash: str,
        input_key: str,
        source_filename: str,
        ttl_seconds: int,
    ) -> ToolJob:
        return cls._new(
            owner_hash=owner_hash,
            kind="pdf-to-word",
            ttl_seconds=ttl_seconds,
            input_key=input_key,
            source_filename=source_filename,
        )

    @classmethod
    def _new(
        cls,
        *,
        owner_hash: str,
        kind: JobKind,
        ttl_seconds: int,
        url: str | None = None,
        output_format: Literal["mp4", "mp3", "mov"] | None = None,
        input_key: str | None = None,
        source_filename: str | None = None,
    ) -> ToolJob:
        now = time.time()
        return cls(
            id=str(uuid.uuid4()),
            owner_hash=owner_hash,
            kind=kind,
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
            url=url,
            output_format=output_format,
            input_key=input_key,
            source_filename=source_filename,
        )

    @classmethod
    def from_payload(cls, payload: dict[str, object]) -> ToolJob:
        if "kind" not in payload:
            payload = {
                **payload,
                "version": 1,
                "kind": "youtube-download",
                "input_key": None,
                "source_filename": None,
            }
        return cls(**payload)  # type: ignore[arg-type]

    @property
    def owner_scope(self) -> str:
        return f"{self.kind}:{self.owner_hash}"

    @property
    def active_job_message(self) -> str:
        label = "media" if self.kind in MEDIA_JOB_KINDS else "PDF conversion"
        return f"one active {label} job is allowed per visitor"

    def public_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "id": self.id,
            "status": self.status,
            "progress": round(self.progress, 1),
            "filename": self.filename,
            "downloadUrl": self.download_url,
            "artifactExpiresAt": self.artifact_expires_at,
            "error": self.error,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "expiresAt": self.expires_at,
        }
        if self.kind in MEDIA_JOB_KINDS:
            payload.update(
                {
                    "format": self.output_format,
                    "title": self.title,
                    "durationSeconds": self.duration_seconds,
                }
            )
            if self.kind == "tiktok-download":
                payload["kind"] = self.kind
        else:
            payload.update({"kind": self.kind, "sourceFilename": self.source_filename})
        return payload

    def storage_dict(self) -> dict[str, object]:
        return asdict(self)


# Backward-compatible import used by the existing media service and callers.
DownloadJob = ToolJob


class JobStore(Protocol):
    async def create(self, job: ToolJob) -> ToolJob: ...

    async def get(self, job_id: str) -> ToolJob | None: ...

    async def update(self, job_id: str, **changes: object) -> ToolJob: ...

    async def enqueue(self, job_id: str) -> None: ...

    async def dequeue(self, timeout: int = 5) -> str | None: ...

    async def request_cancel(self, job_id: str) -> ToolJob | None: ...


class MemoryJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, ToolJob] = {}
        self._active_owner: dict[str, str] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._lock = asyncio.Lock()

    async def create(self, job: ToolJob) -> ToolJob:
        async with self._lock:
            active_id = self._active_owner.get(job.owner_scope)
            if active_id:
                active = self._jobs.get(active_id)
                if active and active.status not in TERMINAL_STATUSES:
                    raise ActiveJobError(job.active_job_message)
            self._jobs[job.id] = job
            self._active_owner[job.owner_scope] = job.id
        return job

    async def get(self, job_id: str) -> ToolJob | None:
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
                self._active_owner.pop(job.owner_scope, None)
            return job

    async def update(self, job_id: str, **changes: object) -> ToolJob:
        async with self._lock:
            job = self._jobs[job_id]
            updated = replace(job, updated_at=time.time(), **changes)
            self._jobs[job_id] = updated
            if updated.status in TERMINAL_STATUSES:
                self._active_owner.pop(updated.owner_scope, None)
            return updated

    async def enqueue(self, job_id: str) -> None:
        await self._queue.put(job_id)

    async def dequeue(self, timeout: int = 5) -> str | None:
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except TimeoutError:
            return None

    async def request_cancel(self, job_id: str) -> ToolJob | None:
        job = await self.get(job_id)
        if not job or job.status in TERMINAL_STATUSES:
            return job
        status: JobStatus = "cancelled" if job.status == "queued" else job.status
        return await self.update(job_id, cancel_requested=True, status=status)


class RedisJobStore:
    QUEUE_NAME = "tool-jobs"
    LEGACY_QUEUE_NAME = "download-jobs"

    def __init__(self, redis: Redis, *, ttl_seconds: int) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds

    @staticmethod
    def _job_key(job_id: str) -> str:
        return f"job:{job_id}"

    @staticmethod
    def _owner_key(owner_scope: str) -> str:
        return f"job-owner:{owner_scope}"

    async def create(self, job: ToolJob) -> ToolJob:
        claimed = await self._redis.set(
            self._owner_key(job.owner_scope),
            job.id,
            ex=self._ttl_seconds,
            nx=True,
        )
        if not claimed:
            raise ActiveJobError(job.active_job_message)
        await self._redis.set(
            self._job_key(job.id),
            json.dumps(job.storage_dict()),
            ex=self._ttl_seconds,
        )
        return job

    async def get(self, job_id: str) -> ToolJob | None:
        raw = await self._redis.get(self._job_key(job_id))
        if not raw:
            return None
        payload = json.loads(raw)
        job = ToolJob.from_payload(payload)
        if job.expires_at <= time.time() and job.status != "expired":
            job = await self.update(job_id, status="expired", download_url=None)
        return job

    async def update(self, job_id: str, **changes: object) -> ToolJob:
        raw = await self._redis.get(self._job_key(job_id))
        if not raw:
            raise KeyError(job_id)
        job = ToolJob.from_payload(json.loads(raw))
        was_legacy = job.version == 1
        updated = replace(job, updated_at=time.time(), version=CURRENT_JOB_VERSION, **changes)
        await self._redis.set(
            self._job_key(job_id),
            json.dumps(updated.storage_dict()),
            ex=max(1, int(updated.expires_at - time.time())),
        )
        if updated.status in TERMINAL_STATUSES:
            await self._redis.delete(self._owner_key(updated.owner_scope))
            if was_legacy:
                await self._redis.delete(self._owner_key(updated.owner_hash))
        return updated

    async def enqueue(self, job_id: str) -> None:
        await self._redis.lpush(self.QUEUE_NAME, job_id)

    async def dequeue(self, timeout: int = 5) -> str | None:
        item = await self._redis.brpop(
            [self.QUEUE_NAME, self.LEGACY_QUEUE_NAME],
            timeout=timeout,
        )
        if not item:
            return None
        value = item[1]
        return value.decode() if isinstance(value, bytes) else value

    async def request_cancel(self, job_id: str) -> ToolJob | None:
        job = await self.get(job_id)
        if not job or job.status in TERMINAL_STATUSES:
            return job
        status: JobStatus = "cancelled" if job.status == "queued" else job.status
        return await self.update(job_id, cancel_requested=True, status=status)
