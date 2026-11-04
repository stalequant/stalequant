"""Entrypoint for the delisting data recording loop.

@stalequant - 2026-04-30
"""

from __future__ import annotations

import asyncio

from .recording.scheduler import run_forever

if __name__ == "__main__":
    asyncio.run(run_forever())

    msg = "Indefinitely looping delisting recording process unexpectedly completed"
    raise AssertionError(msg)
