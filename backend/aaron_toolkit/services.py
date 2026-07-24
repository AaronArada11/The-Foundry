from __future__ import annotations

import asyncio
from dataclasses import dataclass

from redis.asyncio import Redis

from .config import Settings
from .download_service import DownloadProcessor
from .job_dispatcher import ToolJobDispatcher
from .jobs import JobStore, MemoryJobStore, RedisJobStore
from .rate_limit import MemoryRateLimiter, RateLimiter, RedisRateLimiter
from .storage import ArtifactStore, LocalArtifactStore, S3ArtifactStore


@dataclass
class Services:
    settings: Settings
    jobs: JobStore
    artifacts: ArtifactStore
    rate_limiter: RateLimiter
    processor: ToolJobDispatcher
    redis: Redis | None
    local_worker_tasks: list[asyncio.Task[None]]

    async def close(self) -> None:
        for task in self.local_worker_tasks:
            task.cancel()
        if self.local_worker_tasks:
            await asyncio.gather(*self.local_worker_tasks, return_exceptions=True)
        if self.redis:
            await self.redis.aclose()


async def build_services(settings: Settings, *, start_local_worker: bool) -> Services:
    redis_client: Redis | None = None
    if settings.redis_url:
        redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
        try:
            await redis_client.ping()
        except Exception:
            await redis_client.aclose()
            if settings.is_production:
                raise
            redis_client = None

    if redis_client:
        jobs: JobStore = RedisJobStore(
            redis_client,
            ttl_seconds=settings.job_ttl_seconds,
        )
        rate_limiter: RateLimiter = RedisRateLimiter(redis_client)
    else:
        jobs = MemoryJobStore()
        rate_limiter = MemoryRateLimiter()

    if settings.has_s3:
        artifacts: ArtifactStore = S3ArtifactStore(
            endpoint_url=settings.s3_endpoint_url,
            region=settings.s3_region,
            bucket=settings.s3_bucket or "",
            access_key_id=settings.s3_access_key_id or "",
            secret_access_key=settings.s3_secret_access_key or "",
            ttl_seconds=settings.artifact_ttl_seconds,
            input_ttl_seconds=settings.job_ttl_seconds,
        )
    else:
        artifacts = LocalArtifactStore(
            settings.artifact_directory,
            public_base_url=settings.public_base_url,
            signing_secret=settings.signing_secret,
            ttl_seconds=settings.artifact_ttl_seconds,
            input_ttl_seconds=settings.job_ttl_seconds,
        )

    download_processor = DownloadProcessor(
        store=jobs,
        artifacts=artifacts,
        settings=settings,
    )
    processor = ToolJobDispatcher(
        jobs,
        {"youtube-download": download_processor},
    )
    services = Services(
        settings=settings,
        jobs=jobs,
        artifacts=artifacts,
        rate_limiter=rate_limiter,
        processor=processor,
        redis=redis_client,
        local_worker_tasks=[],
    )
    if start_local_worker and isinstance(jobs, MemoryJobStore):
        services.local_worker_tasks = [
            asyncio.create_task(_worker_loop(services), name=f"local-worker-{index}")
            for index in range(max(1, settings.worker_concurrency))
        ]
    return services


async def _worker_loop(services: Services) -> None:
    while True:
        job_id = await services.jobs.dequeue(timeout=2)
        if job_id:
            await services.processor.process(job_id)
