"""Spawn long-running recorder loops (hourly HL, mark poll, quarter-hour batch).

Heavier work units live in :mod:`recording.cycles`; interval math in :mod:`recording.timing`.

@stalequant - 2026-04-30
"""

from __future__ import annotations

import logging
from asyncio import gather
from asyncio import sleep

from ..clients.hyperliquid import fetch_all_dex_mark_snapshots
from ..config import hl_mark_prices_path
from ..config import INTERVAL_MS
from ..config import PRICE_POLL_INTERVAL_S
from ..structured_logging import configure_logging
from .cycles import refresh_hl_hourly_dump_and_runtime
from .cycles import run_quarter_hour_cycle
from .cycles import sleep_until_next_hour_boundary
from .runtime_state import RecorderState
from .runtime_state import default_recorder_state
from .timing import ms_until_next_aligned_tick
from .writers import append_price_line

__all__ = ["record_iter", "run_forever"]

logger = logging.getLogger(__name__)


async def _hourly_hl_raw_loop(state: RecorderState) -> None:
    """Hour-aligned refresh after launch (caller runs first refresh before spawning)."""
    while True:
        await sleep_until_next_hour_boundary(state.now_ms)
        logger.info(
            "Hour boundary reached; refreshing HL meta/context and HLP OI",
            extra={"subsystem": "HLHR"},
        )
        try:
            await refresh_hl_hourly_dump_and_runtime(state)
        except Exception as exc:
            logger.error(
                "Hourly HL refresh failed; continuing recorder loop",
                extra={
                    "subsystem": "HLHR",
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                },
            )


async def _mark_prices_loop(state: RecorderState) -> None:
    """Poll mark prices every ``PRICE_POLL_INTERVAL_S`` using cached HIP-3 dex names."""
    path = hl_mark_prices_path(state.output_dir)
    while True:
        ts = state.now_ms()
        try:
            rows = await fetch_all_dex_mark_snapshots(state.hl_runtime.hip3_dex_names)
            for dex, prices in rows:
                append_price_line({"ts": ts, "dex": dex, "prices": prices}, path)
        except Exception as exc:
            logger.error(
                "Mark price poll failed; continuing recorder loop",
                extra={
                    "subsystem": "MARK",
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                },
            )

        await sleep(float(PRICE_POLL_INTERVAL_S))


async def _fifteen_minute_loop(state: RecorderState) -> None:
    """Aligned quarter-hour cycles until process exit."""
    while True:
        await run_quarter_hour_cycle(state)
        await sleep(ms_until_next_aligned_tick(INTERVAL_MS, state.now_ms) / 1000.0)


async def run_forever(state: RecorderState | None = None) -> None:
    """Hourly HL meta/ctx + HLP OI; mark JSONL poll; quarter-hour L2 + listings + candles."""
    configure_logging()
    logging.getLogger("delisting_calcs").info(
        "Starting continuous delisting data recorder",
        extra={"subsystem": "MAIN"},
    )
    resolved = state if state is not None else default_recorder_state()
    resolved.output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(
        "Running initial HL meta/context and HLP OI refresh",
        extra={"subsystem": "RECD", "output_dir": str(resolved.output_dir)},
    )
    while True:
        try:
            await refresh_hl_hourly_dump_and_runtime(resolved)
            break
        except Exception as exc:
            logger.error(
                "Initial HL refresh failed; retrying in 30 seconds",
                extra={
                    "subsystem": "RECD",
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                },
            )
            await sleep(30.0)

    logger.info(
        "Starting recorder loops: hourly HL refresh, mark polling, and quarter-hour data pulls",
        extra={"subsystem": "RECD"},
    )
    _ = await gather(
        _hourly_hl_raw_loop(resolved),
        _mark_prices_loop(resolved),
        _fifteen_minute_loop(resolved),
    )


async def record_iter(state: RecorderState | None = None) -> None:
    """One-shot hourly refresh plus one quarter-hour batch (tests / manual runs)."""
    configure_logging()
    resolved = state if state is not None else default_recorder_state()
    resolved.output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(
        "Running one-shot recorder iteration: hourly refresh followed by quarter-hour batch",
        extra={"subsystem": "RECD"},
    )
    await refresh_hl_hourly_dump_and_runtime(resolved)
    await run_quarter_hour_cycle(resolved)
