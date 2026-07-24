from __future__ import annotations

import asyncio
import signal

from .config import get_settings
from .services import build_services


async def run_worker() -> None:
    settings = get_settings()
    services = await build_services(settings, start_local_worker=False)
    if services.redis is None:
        raise RuntimeError("The distributed worker requires REDIS_URL.")

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    async def consume() -> None:
        while not stop.is_set():
            job_id = await services.jobs.dequeue(timeout=2)
            if job_id:
                await services.processor.process(job_id)

    tasks = [
        asyncio.create_task(consume(), name=f"worker-{index}")
        for index in range(max(1, settings.worker_concurrency))
    ]
    await stop.wait()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await services.close()


if __name__ == "__main__":
    asyncio.run(run_worker())
