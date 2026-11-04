"""Hourly and quarter-hour recorder work units (fetch + append + runtime refresh).

Quarter-hour tasks run concurrently with per-task exception guards. A failure
in one refresh (for example CMC) therefore does not cancel sibling tasks (L2,
candles, CoinGecko).

@stalequant - 2026-05-09
"""

from __future__ import annotations

import logging
import json
import random
from asyncio import gather
from asyncio import sleep
from asyncio import to_thread
from collections.abc import Awaitable
from collections.abc import Callable
from pathlib import Path
from traceback import format_exc
from typing import Any
from typing import cast

from ..clients.ccxt_candles import fetch_hyperliquid_spot_purr_data
from ..clients.ccxt_candles import fetch_reference_exchange_data
from ..clients.ccxt_orderbooks import fetch_orderbook_depth
from ..clients.hyperliquid import collect_hl_wire_symbols_by_normalized_coin_from_dex_details
from ..clients.hyperliquid import collect_normalized_hl_coins_from_dex_details
from ..clients.hyperliquid import fetch_hlp_oi
from ..clients.hyperliquid import fetch_raw_hl_meta_ctx_bundle
from ..clients.hyperliquid import hip3_dex_names_from_rows
from ..clients.hyperliquid import validated_perp_dex_rows
from ..clients.market_sources import fetch_cmc_listings_latest_rows
from ..clients.market_sources import fetch_coincap_assets_rows
from ..clients.market_sources import fetch_coingecko_markets_rows
from ..config import cmc_listings_path
from ..config import coincap_assets_path
from ..config import coingecko_markets_path
from ..config import candle_cache_path
from ..config import HL_RAW_DUMP_INTERVAL_MS
from ..config import hl_raw_dex_meta_ctx_path
from ..config import hl_raw_historic_hlp_oi_path
from ..config import hl_spot_candles_path
from ..config import INTERVAL_MS
from ..config import L2_DEADLINE_BEFORE_INTERVAL_MS
from ..config import MAX_CANDLE_AGE_MS
from ..config import MAX_COINCAP_CACHE_AGE_MS
from ..config import MAX_MARKET_SOURCES_CACHE_AGE_MS
from ..config import orderbook_depth_path
from ..symbols import clean_symbol
from ..scoring.cutoffs import MIN_NON_HL_MARKET_CAP_USD
from ..scoring.cutoffs import SCORE_EXCLUDED_SYMBOLS
from ..venues import REFERENCE_CCXT_SETUPS
from .runtime_state import RecorderState
from .runtime_state import apply_hl_runtime_refresh
from .timing import ms_until_next_aligned_tick
from .timing import next_interval_boundary_ms
from .writers import append_raw_snapshot_jsonl
from .writers import wrapped_json_is_current
from .writers import write_wrapped_json

__all__ = [
    "refresh_hl_hourly_dump_and_runtime",
    "run_quarter_hour_cycle",
    "sleep_until_next_hour_boundary",
]

logger = logging.getLogger(__name__)


async def sleep_until_next_hour_boundary(now_ms: Callable[[], int]) -> None:
    """Sleep until the next hour boundary (uses :data:`~..config.HL_RAW_DUMP_INTERVAL_MS`)."""
    hour_ms = HL_RAW_DUMP_INTERVAL_MS
    await sleep(ms_until_next_aligned_tick(hour_ms, now_ms) / 1000.0)


async def refresh_hl_hourly_dump_and_runtime(state: RecorderState) -> None:
    """Hourly batch: raw HL meta/ctx, HLP OI snapshot, and HL runtime snapshot refresh."""
    bundle, hlp_oi = await gather(
        fetch_raw_hl_meta_ctx_bundle(),
        fetch_hlp_oi(),
    )
    recorded_at_ms = state.now_ms()
    append_raw_snapshot_jsonl(
        cast("dict[str, Any]", bundle),
        hl_raw_dex_meta_ctx_path(state.output_dir),
        recorded_at_ms=recorded_at_ms,
        now_ms=state.now_ms,
    )
    append_raw_snapshot_jsonl(
        cast("dict[str, Any]", hlp_oi),
        hl_raw_historic_hlp_oi_path(state.output_dir),
        recorded_at_ms=recorded_at_ms,
        now_ms=state.now_ms,
    )
    dex_info: object = bundle["dex_info"]
    hip3 = hip3_dex_names_from_rows(validated_perp_dex_rows(dex_info))
    coins = collect_normalized_hl_coins_from_dex_details(bundle["dex_details"])
    hl_wire_symbols = collect_hl_wire_symbols_by_normalized_coin_from_dex_details(
        bundle["dex_details"]
    )
    apply_hl_runtime_refresh(state, dex_info, hip3, coins, hl_wire_symbols)
    logger.info(
        "Hourly HL meta/context and HLP OI refresh completed",
        extra={
            "subsystem": "HLHR",
            "recorded_at_ms": recorded_at_ms,
            "hip3_dex_count": len(hip3),
            "hl_coin_count": len(coins),
            "hl_wire_symbol_count": sum(len(v) for v in hl_wire_symbols.values()),
        },
    )


def _safe_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _eligible_market_cap_symbols(output_dir: Path) -> frozenset[str]:
    """Symbols whose best observed market cap across market-source caches is at least the cutoff."""
    market_caps: dict[str, float] = {}

    def update(symbol: object, value: object) -> None:
        if not isinstance(symbol, str) or not symbol:
            return
        clean = clean_symbol(symbol)
        if clean in SCORE_EXCLUDED_SYMBOLS:
            return
        market_caps[clean] = max(market_caps.get(clean, 0.0), _safe_float(value))

    def cmc_market_cap(row: dict[str, Any]) -> object:
        quote = row.get("quote")
        if not isinstance(quote, dict):
            return None
        usd = quote.get("USD")
        if not isinstance(usd, dict):
            return None
        return usd.get("market_cap")

    for path, row_handler in (
        (
            cmc_listings_path(output_dir),
            lambda row: update(row.get("symbol"), cmc_market_cap(row)),
        ),
        (
            coingecko_markets_path(output_dir),
            lambda row: update(row.get("symbol"), row.get("market_cap")),
        ),
        (
            coincap_assets_path(output_dir),
            lambda row: update(row.get("symbol"), row.get("marketCapUsd")),
        ),
    ):
        if not path.is_file():
            continue
        try:
            wrapped = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        rows = wrapped.get("data")
        if not isinstance(rows, list):
            continue
        for row in rows:
            if isinstance(row, dict):
                row_handler(row)

    return frozenset(
        symbol
        for symbol, market_cap in market_caps.items()
        if market_cap >= MIN_NON_HL_MARKET_CAP_USD
    )


def _eligible_recorder_symbols(output_dir: Path, hl_coins: frozenset[str]) -> frozenset[str]:
    """Market-cap eligible symbols plus every active HL futures symbol."""
    return _eligible_market_cap_symbols(output_dir) | hl_coins


def _random_orderbook_symbols(output_dir: Path, hl_coins: frozenset[str]) -> list[str]:
    ordered = list(_eligible_recorder_symbols(output_dir, hl_coins))
    random.shuffle(ordered)
    return ordered


async def _maybe_orderbook_depth(
    state: RecorderState,
    deadline_ms: int,
    hl_coins: frozenset[str],
) -> None:
    if state.now_ms() >= deadline_ms:
        logger.warning(
            "Skipping OB depth cycle (already past deadline)",
            extra={"subsystem": "OBDP", "deadline_ms": deadline_ms},
        )
        return
    ordered_coins = _random_orderbook_symbols(state.output_dir, hl_coins)
    logger.info(
        "Coin-centric orderbook depth fetch started",
        extra={
            "subsystem": "OBDP",
            "deadline_ms": deadline_ms,
            "hl_coin_universe": len(hl_coins),
            "ordered_coin_universe": len(ordered_coins),
            "order": "random",
        },
    )
    snap = await fetch_orderbook_depth(
        deadline_ms=deadline_ms,
        hl_coins_normalized=hl_coins,
        hl_wire_symbols_by_normalized=state.hl_runtime.hl_wire_symbols_by_normalized,
        coins_ordered=ordered_coins,
    )
    append_raw_snapshot_jsonl(
        cast("dict[str, Any]", snap),
        orderbook_depth_path(state.output_dir),
        now_ms=state.now_ms,
    )
    logger.info(
        "Coin-centric orderbook depth snapshot appended",
        extra={
            "subsystem": "OBDP",
            "file_name": orderbook_depth_path(state.output_dir).name,
            "coin_count": len(snap),
        },
    )


async def _log_quarter_hour_subtask_failure(name: str, work: Awaitable[object]) -> None:
    """Await ``work`` and log failures without re-raising."""
    try:
        await work
    except Exception as exc:
        logger.error(
            "Quarter-hour recorder subtask failed; other subtasks will continue",
            extra={
                "subsystem": "QRTM",
                "task": name,
                "exc_type": type(exc).__name__,
                "error": repr(exc),
                "traceback": format_exc(),
            },
        )


async def _refresh_reference_exchange_candles(state: RecorderState) -> None:
    """Refresh stale per-venue candle caches from recorder-owned persistence logic."""
    hl_coins = state.hl_runtime.hl_coins_normalized
    eligible_symbols = _eligible_recorder_symbols(state.output_dir, hl_coins)
    logger.info(
        "Candle cache refresh scan started",
        extra={
            "subsystem": "CCND",
            "setup_count": len(REFERENCE_CCXT_SETUPS),
            "output_dir": str(state.output_dir),
            "eligible_symbol_count": len(eligible_symbols),
        },
    )

    jobs: list[Awaitable[object]] = []
    for setup in REFERENCE_CCXT_SETUPS:
        output_path = candle_cache_path(setup.venue_name, setup.market_style, state.output_dir)
        if wrapped_json_is_current(output_path, MAX_CANDLE_AGE_MS, now_ms=state.now_ms):
            logger.info(
                "Candle cache is fresh; skipping fetch",
                extra={
                    "subsystem": "CCND",
                    "venue": setup.venue_name.value,
                    "market_style": setup.market_style.value,
                    "file_name": output_path.name,
                },
            )
            continue

        async def _fetch_and_write(
            setup_arg=setup,
            output_path_arg=output_path,
        ) -> None:
            rows = await fetch_reference_exchange_data(
                setup_arg,
                eligible_symbols=eligible_symbols,
            )
            _ = write_wrapped_json(output_path_arg, rows, now_ms=state.now_ms)
            logger.info(
                "Candle cache refreshed",
                extra={
                    "subsystem": "CCND",
                    "venue": setup_arg.venue_name.value,
                    "market_style": setup_arg.market_style.value,
                    "file_name": output_path_arg.name,
                    "market_count": len(rows),
                },
            )

        jobs.append(_fetch_and_write())

    hl_spot_path = hl_spot_candles_path(state.output_dir)
    if wrapped_json_is_current(hl_spot_path, MAX_CANDLE_AGE_MS, now_ms=state.now_ms):
        logger.info(
            "HL spot PURR candle cache is fresh; skipping fetch",
            extra={"subsystem": "CCND", "file_name": hl_spot_path.name},
        )
    else:

        async def _fetch_and_write_hl_spot_purr(
            output_path_arg=hl_spot_path,
        ) -> None:
            rows = await fetch_hyperliquid_spot_purr_data()
            _ = write_wrapped_json(output_path_arg, rows, now_ms=state.now_ms)
            logger.info(
                "HL spot PURR candle cache refreshed",
                extra={
                    "subsystem": "CCND",
                    "file_name": output_path_arg.name,
                    "market_count": len(rows),
                },
            )

        jobs.append(_fetch_and_write_hl_spot_purr())

    results = await gather(*jobs, return_exceptions=True)
    for result in results:
        if isinstance(result, BaseException):
            raise result


def _write_market_source_rows(
    *,
    provider_name: str,
    subsystem: str,
    output_path: Path,
    rows: list[dict[str, Any]],
) -> None:
    """Write non-empty market-source rows from a recorder task."""
    if not rows:
        msg = f"{provider_name} returned zero rows; preserving previous cache"
        raise ValueError(msg)
    _ = write_wrapped_json(output_path, rows)
    logger.info(
        f"{provider_name} cache refreshed",
        extra={"subsystem": subsystem, "file_name": output_path.name, "row_count": len(rows)},
    )


async def _refresh_cmc_listings(state: RecorderState) -> None:
    output_path = cmc_listings_path(state.output_dir)
    if wrapped_json_is_current(output_path, MAX_MARKET_SOURCES_CACHE_AGE_MS, now_ms=state.now_ms):
        logger.info(
            "CMC listings cache is fresh; skipping fetch",
            extra={"subsystem": "CMCL", "file_name": output_path.name},
        )
        return
    logger.info("Fetching CMC listings", extra={"subsystem": "CMCL", "file_name": output_path.name})
    rows = await to_thread(fetch_cmc_listings_latest_rows)
    _write_market_source_rows(
        provider_name="CMC listings",
        subsystem="CMCL",
        output_path=output_path,
        rows=rows,
    )


async def _refresh_coincap_assets(state: RecorderState) -> None:
    output_path = coincap_assets_path(state.output_dir)
    if wrapped_json_is_current(output_path, MAX_COINCAP_CACHE_AGE_MS, now_ms=state.now_ms):
        logger.info(
            "CoinCap assets cache is fresh; skipping fetch",
            extra={"subsystem": "CCAP", "file_name": output_path.name},
        )
        return
    logger.info("Fetching CoinCap asset pages", extra={"subsystem": "CCAP", "file_name": output_path.name})
    rows = await fetch_coincap_assets_rows()
    _write_market_source_rows(
        provider_name="CoinCap assets",
        subsystem="CCAP",
        output_path=output_path,
        rows=rows,
    )


async def _refresh_coingecko_markets(state: RecorderState) -> None:
    output_path = coingecko_markets_path(state.output_dir)
    if wrapped_json_is_current(output_path, MAX_MARKET_SOURCES_CACHE_AGE_MS, now_ms=state.now_ms):
        logger.info(
            "CoinGecko markets cache is fresh; skipping fetch",
            extra={"subsystem": "COGC", "file_name": output_path.name},
        )
        return
    logger.info("Fetching CoinGecko market pages", extra={"subsystem": "COGC", "file_name": output_path.name})
    rows = await fetch_coingecko_markets_rows()
    _write_market_source_rows(
        provider_name="CoinGecko markets",
        subsystem="COGC",
        output_path=output_path,
        rows=rows,
    )


async def run_quarter_hour_cycle(state: RecorderState) -> None:
    """Aligned quarter-hour: orderbook depth, candles, CMC, CoinGecko, CoinCap."""
    boundary = next_interval_boundary_ms(INTERVAL_MS, state.now_ms)
    deadline_ms = boundary - L2_DEADLINE_BEFORE_INTERVAL_MS
    hl_coins = state.hl_runtime.hl_coins_normalized
    logger.info(
        "Quarter-hour recorder cycle started",
        extra={"subsystem": "QRTM", "boundary_ms": boundary},
    )

    await gather(
        _log_quarter_hour_subtask_failure(
            "orderbook_depth",
            _maybe_orderbook_depth(state, deadline_ms, hl_coins),
        ),
        _log_quarter_hour_subtask_failure(
            "fetch_all_candles",
            _refresh_reference_exchange_candles(state),
        ),
        _log_quarter_hour_subtask_failure(
            "refresh_cmc_listings",
            _refresh_cmc_listings(state),
        ),
        _log_quarter_hour_subtask_failure(
            "refresh_coingecko_markets",
            _refresh_coingecko_markets(state),
        ),
        _log_quarter_hour_subtask_failure(
            "refresh_coincap_assets",
            _refresh_coincap_assets(state),
        ),
    )

    logger.info(
        "Quarter-hour recorder cycle finished",
        extra={"subsystem": "QRTM"},
    )
