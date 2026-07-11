"""Wall-clock helpers for delisting_calcs.

@stalequant - 2026-04-30
"""

from __future__ import annotations

import time

__all__ = ["utc_ms"]


def utc_ms() -> int:
    """Return current Unix timestamp in milliseconds."""
    return int(time.time() * 1000)
