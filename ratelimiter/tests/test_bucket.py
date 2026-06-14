from ratelimiter import TokenBucketLimiter


def test_first_acquire_succeeds():
    b = TokenBucketLimiter(capacity=3, refill_window_ms=1000)
    assert b.acquire(now=0.0) is True
