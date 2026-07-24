import pytest
from aaron_toolkit.rate_limit import MemoryRateLimiter, RateLimitExceeded


@pytest.mark.asyncio
async def test_memory_rate_limiter_enforces_window():
    limiter = MemoryRateLimiter()
    await limiter.check("client", limit=2, window_seconds=60)
    await limiter.check("client", limit=2, window_seconds=60)

    with pytest.raises(RateLimitExceeded) as error:
        await limiter.check("client", limit=2, window_seconds=60)

    assert error.value.retry_after >= 1
