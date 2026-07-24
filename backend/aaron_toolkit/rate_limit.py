from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from typing import Protocol

from redis.asyncio import Redis


class RateLimitExceeded(RuntimeError):
    def __init__(self, retry_after: int) -> None:
        super().__init__("rate limit exceeded")
        self.retry_after = retry_after


class RateLimiter(Protocol):
    async def check(self, key: str, *, limit: int, window_seconds: int) -> None: ...


class MemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str, *, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds
        async with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(events[0] + window_seconds - now))
                raise RateLimitExceeded(retry_after)
            events.append(now)


class RedisRateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def check(self, key: str, *, limit: int, window_seconds: int) -> None:
        redis_key = f"rate:{key}:{int(time.time()) // window_seconds}"
        value = await self._redis.incr(redis_key)
        if value == 1:
            await self._redis.expire(redis_key, window_seconds + 1)
        if value > limit:
            ttl = await self._redis.ttl(redis_key)
            raise RateLimitExceeded(max(1, ttl))
