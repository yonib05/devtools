"""Sliding-window rate limiter."""
import time


class SlidingWindowLimiter:
    """Allow at most `max_events` within a rolling `window_seconds` window."""

    def __init__(self, max_events: int, window_seconds: float) -> None:
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._events: list[float] = []

    def allow(self, now: float | None = None) -> bool:
        """Return True and record the event if under the limit, else False."""
        now = time.monotonic() if now is None else now
        cutoff = now - self.window_seconds
        self._events = [t for t in self._events if t > cutoff]
        if len(self._events) < self.max_events:
            self._events.append(now)
            return True
        return False
