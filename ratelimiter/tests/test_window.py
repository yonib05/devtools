from ratelimiter import SlidingWindowLimiter


def test_allows_under_limit():
    lim = SlidingWindowLimiter(max_events=2, window_seconds=10.0)
    assert lim.allow(now=0.0) is True
    assert lim.allow(now=1.0) is True
    assert lim.allow(now=2.0) is False


def test_window_expiry_frees_capacity():
    lim = SlidingWindowLimiter(max_events=1, window_seconds=5.0)
    assert lim.allow(now=0.0) is True
    assert lim.allow(now=4.0) is False
    assert lim.allow(now=6.0) is True
