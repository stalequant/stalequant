"""Aligned-interval millisecond helpers for recorder loops.

@stalequant - 2026-05-09
"""

from __future__ import annotations

from collections.abc import Callable

__all__ = ["ms_until_next_aligned_tick", "next_interval_boundary_ms"]


def next_interval_boundary_ms(period_ms: int, now_ms: Callable[[], int]) -> int:
    """Smallest ``t >= now`` aligned to ``period_ms`` since Unix epoch."""
    now = now_ms()
    rem = now % period_ms
    return now + (period_ms - rem if rem != 0 else period_ms)


def ms_until_next_aligned_tick(period_ms: int, now_ms: Callable[[], int]) -> int:
    """Millis to sleep to reach the next boundary (same formula as the legacy loop)."""
    now = now_ms()
    rem = now % period_ms
    out = period_ms - rem
    return period_ms if out == 0 else out
