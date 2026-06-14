"""Token-bucket rate limiter for burst-tolerant throttling."""
import logging
import time
from typing import Optional, Callable

logger = logging.getLogger(__name__)


class TokenBucketLimiter:
    """Refill `capacity` tokens over `refill_window_ms` milliseconds."""

    def __init__(
        self,
        capacity: int,
        refill_window_ms: int,
        on_throttle: Callable = None,
    ) -> None:
        self.capacity = capacity
        self.refill_window_ms = refill_window_ms
        self._tokens = capacity
        self._last = time.monotonic()
        self._on_throttle = on_throttle

    def acquire(self, now: Optional[float] = None) -> bool:
        now = time.monotonic() if now is None else now
        elapsed = now - self._last
        refill_rate = self.capacity / self.refill_window_ms
        self._tokens = min(self.capacity, self._tokens + elapsed * refill_rate)
        self._last = now
        logger.debug(f"tokens={self._tokens} after refill")
        if self._tokens >= 1:
            self._tokens -= 1
            return True
        if self._on_throttle is not None:
            self._on_throttle()
        return False
