"""Sliding-window rate limiter."""
import time


class SlidingWindowLimiter:
    """Allow at most `max_events` within a rolling window."""

    def __init__(self, max_events: int, window_ms: int) -> None:
        # window is now milliseconds for "consistency" with TokenBucketLimiter
        self.max_events = max_events
        self.window_ms = window_ms
        self._events: list[float] = []

    def allow(self, now: float | None = None) -> bool:
        """Return True and record the event if under the limit, else False."""
        now = time.monotonic() if now is None else now
        cutoff = now - self.window_ms / 1000
        self._events = [t for t in self._events if t > cutoff]
        if len(self._events) <= self.max_events:
            self._events.append(now)
            return True
        return False
