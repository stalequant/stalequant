"""Fetch and aggregate coin-centric orderbook depth records.

@stalequant - 2026-04-30
"""

from __future__ import annotations

import asyncio
import logging
from asyncio import create_task
from asyncio import gather
from asyncio import Lock
from contextlib import suppress
from traceback import format_exc
from typing import Any
from typing import cast
from typing import final

import ccxt.pro
from typing_extensions import override

from ..hyperliquid_constants import BOOK_AGGREGATION_LEVELS
from ..models.ccxt import CcxtL2Structure
from ..models.ccxt import PriceQty
from ..models.ccxt import ReturnsCcxtL2
from ..models.records import DepthLevelRecord
from ..models.records import LiquidityRecord
from ..models.records import OrderbookDepthRecord
from ..models.venues import CcxtL2ReturnSetup
from ..models.venues import MarketStyle
from ..models.venues import VenueName
from ..time_utils import utc_ms
from ..venues import REFERENCE_CCXT_SETUPS
from .ccxt_markets import load_markets_with_hourly_reload
from .hyperliquid import fetch_order_book

logger = logging.getLogger(__name__)

__all__ = [
    "fetch_orderbook_depth",
]

_EPS = 1e-9
_EMPTY_ORDERBOOK_ERROR_TYPE = "EmptyOrderbook"
_HL_SPOT_PURR_COIN = "PURR/USDC"
_HL_SPOT_PURR_SYMBOL = "PURR"
ORDERBOOK_DEPTH_LIMIT = 500

# LiquidityRecord slippage metric keys (explicit list: None means missing; 0.0 is valid).
SLIPPAGE_KEYS: tuple[str, ...] = (
    "slippage_1k_bps_buy",
    "slippage_1k_bps_sell",
    "slippage_2_5k_bps_buy",
    "slippage_2_5k_bps_sell",
    "slippage_10k_bps_buy",
    "slippage_10k_bps_sell",
    "slippage_25k_bps_buy",
    "slippage_25k_bps_sell",
    "slippage_100k_bps_buy",
    "slippage_100k_bps_sell",
    "slippage_250k_bps_buy",
    "slippage_250k_bps_sell",
    "slippage_1m_bps_buy",
    "slippage_1m_bps_sell",
)

SPREAD_LEVELS: tuple[tuple[str, str, str], ...] = (
    ("1k", "slippage_1k_bps_buy", "slippage_1k_bps_sell"),
    ("2.5k", "slippage_2_5k_bps_buy", "slippage_2_5k_bps_sell"),
    ("10k", "slippage_10k_bps_buy", "slippage_10k_bps_sell"),
    ("25k", "slippage_25k_bps_buy", "slippage_25k_bps_sell"),
    ("100k", "slippage_100k_bps_buy", "slippage_100k_bps_sell"),
    ("250k", "slippage_250k_bps_buy", "slippage_250k_bps_sell"),
    ("1m", "slippage_1m_bps_buy", "slippage_1m_bps_sell"),
)

TOP_DEPTH_VENUES: tuple[VenueName, ...] = (
    VenueName.BINANCE,
    VenueName.BYBIT,
    VenueName.OKX,
)


def _taker_slippage_bps(
    levels: list[PriceQty],
    mid_px: float,
    notional_usd: float,
) -> float | None:
    """Estimate market-order slippage in bps relative to mid.

    For a buy, pass asks.
    For a sell, pass bids.
    """
    if not levels or mid_px <= 0:
        return None

    remaining_notional = notional_usd
    total_qty = 0.0
    total_cost = 0.0

    for px, sz, *_ in levels:
        if px <= 0 or sz <= 0:
            continue

        take_notional = min(remaining_notional, px * sz)

        total_qty += take_notional / px
        total_cost += take_notional
        remaining_notional -= take_notional

        if remaining_notional <= _EPS:
            break

    if remaining_notional > _EPS or total_qty <= 0:
        return None

    avg_fill_px = total_cost / total_qty
    return abs(avg_fill_px / mid_px - 1.0) * 10_000.0


def _build_liquidity_record(book: CcxtL2Structure) -> LiquidityRecord:
    """Compute multi-notional slippage metrics from a validated orderbook."""
    mid: float = (book["bids"][0][0] + book["asks"][0][0]) / 2.0
    slip_vals = (
        _taker_slippage_bps(book["asks"], mid, 1_000.0),
        _taker_slippage_bps(book["bids"], mid, 1_000.0),
        _taker_slippage_bps(book["asks"], mid, 2_500.0),
        _taker_slippage_bps(book["bids"], mid, 2_500.0),
        _taker_slippage_bps(book["asks"], mid, 10_000.0),
        _taker_slippage_bps(book["bids"], mid, 10_000.0),
        _taker_slippage_bps(book["asks"], mid, 25_000.0),
        _taker_slippage_bps(book["bids"], mid, 25_000.0),
        _taker_slippage_bps(book["asks"], mid, 100_000.0),
        _taker_slippage_bps(book["bids"], mid, 100_000.0),
        _taker_slippage_bps(book["asks"], mid, 250_000.0),
        _taker_slippage_bps(book["bids"], mid, 250_000.0),
        _taker_slippage_bps(book["asks"], mid, 1_000_000.0),
        _taker_slippage_bps(book["bids"], mid, 1_000_000.0),
    )
    return cast(
        "LiquidityRecord",
        {
            "ms_time": utc_ms(),
            **dict(zip(SLIPPAGE_KEYS, slip_vals, strict=True)),
            "error_type": None,
            "error_message": None,
        },
    )


def _empty_liquidity_record(
    *,
    error_type: str | None = None,
    error_message: str | None = None,
) -> LiquidityRecord:
    return cast(
        "LiquidityRecord",
        {
            "ms_time": utc_ms(),
            **dict.fromkeys(SLIPPAGE_KEYS, None),
            "error_type": error_type,
            "error_message": error_message,
        },
    )


@final
class HyperliquidFetchL2(ReturnsCcxtL2):
    _sig_figs: int | None

    def __init__(self, sig_figs: int | None) -> None:
        self._sig_figs = sig_figs

    @override
    async def load_markets(self, reload: bool = False) -> dict[str, dict[str, Any]]:
        msg = "Stub method HyperliquidFetchL2 does not support load_markets"
        raise NotImplementedError(msg)

    @override
    async def fetch_order_book(self, symbol: str, limit: int | None = None) -> CcxtL2Structure:
        coin = symbol if symbol == _HL_SPOT_PURR_COIN else symbol.split("/", maxsplit=1)[0]
        return await fetch_order_book(coin=coin, sig_figs=self._sig_figs)


async def _fetch_and_build_liquidity_record(
    coin: str,
    ccxt_like: ReturnsCcxtL2,
    symbol_base: str,
    *,
    log_failures: bool = True,
) -> LiquidityRecord:
    try:
        book = await asyncio.wait_for(
            ccxt_like.fetch_order_book(symbol=f"{coin}{symbol_base}", limit=ORDERBOOK_DEPTH_LIMIT),
            timeout=10,
        )
        if not book["bids"] or not book["asks"]:
            msg = f"Empty orderbook for coin={coin} symbol_base={symbol_base}"
            return _empty_liquidity_record(
                error_type=_EMPTY_ORDERBOOK_ERROR_TYPE,
                error_message=msg,
            )

        record = _build_liquidity_record(book)

    except Exception as exc:
        msg = (
            f"Order book fetch failed for coin={coin} symbol_base={symbol_base}: "
            f"{type(exc).__name__}: {exc!r}"
        )
        if log_failures:
            logger.error(
                "Order book fetch failed while building slippage record",
                extra={
                    "subsystem": "L2OB",
                    "coin": coin,
                    "symbol_base": symbol_base,
                    "client": type(ccxt_like).__name__,
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                    "traceback": format_exc(),
                },
            )
        return _empty_liquidity_record(error_type=type(exc).__name__, error_message=msg)
    else:
        return record


async def _fetch_and_build_hl_liquidity_record(
    coin: str,
) -> LiquidityRecord:
    """Fetch the native book first. If large notionals cannot be filled from the.

    visible book, retry coarser aggregation levels and fill only missing fields.

    """
    output = cast(
        "LiquidityRecord",
        {
            "ms_time": utc_ms(),
            "error_type": None,
            "error_message": None,
            **dict.fromkeys(SLIPPAGE_KEYS, None),
        },
    )
    passed = False
    stored_error_type: str | None = None
    stored_error_message: str | None = None

    for params in BOOK_AGGREGATION_LEVELS:
        hl_returner: ReturnsCcxtL2 = HyperliquidFetchL2(sig_figs=params.get("nSigFigs"))

        record = await _fetch_and_build_liquidity_record(
            coin=coin, ccxt_like=hl_returner, symbol_base=""
        )
        if record.get("error_type") is not None:
            stored_error_type = record["error_type"]
            stored_error_message = record["error_message"]
            if stored_error_type == _EMPTY_ORDERBOOK_ERROR_TYPE:
                logger.info(
                    "Hyperliquid order book is empty; skipping remaining aggregation levels for coin",
                    extra={
                        "subsystem": "L2OB",
                        "coin": coin,
                        "params": repr(params),
                        "error": stored_error_message,
                    },
                )
                output["error_type"] = stored_error_type
                output["error_message"] = stored_error_message
                return output
            logger.warning(
                "Hyperliquid order book aggregation level failed",
                extra={
                    "subsystem": "L2OB",
                    "coin": coin,
                    "params": repr(params),
                    "exc_type": stored_error_type,
                    "error": (stored_error_message or "")[:500],
                },
            )
            continue
        passed = True
        for key in SLIPPAGE_KEYS:
            if output[key] is None and record[key] is not None:
                output[key] = record[key]

        if all(output[key] is not None for key in SLIPPAGE_KEYS):
            break

    if not passed:
        msg = f"All Hyperliquid order book aggregation levels failed for coin={coin}"
        logger.error(
            msg,
            extra={
                "subsystem": "L2OB",
                "coin": coin,
                "exc_type": stored_error_type,
                "error": (stored_error_message or "")[:500],
            },
        )
        output["error_type"] = stored_error_type or "AggregateFetchError"
        output["error_message"] = stored_error_message or msg
        return output

    return output


async def _fetch_and_build_hl_spot_purr_liquidity_record() -> LiquidityRecord:
    """Fetch native Hyperliquid spot PURR/USDC depth."""
    return await _fetch_and_build_hl_liquidity_record(_HL_SPOT_PURR_COIN)


def _spread(record: LiquidityRecord, buy_key: str, sell_key: str) -> float | None:
    buy = record[buy_key]
    sell = record[sell_key]
    return None if buy is None or sell is None else buy + sell


def _record_has_spread(record: LiquidityRecord) -> bool:
    return any(_spread(record, buy_key, sell_key) is not None for _, buy_key, sell_key in SPREAD_LEVELS)


def _ten_k_spread(record: LiquidityRecord) -> float | None:
    return _rounded_spread(
        _spread(record, "slippage_10k_bps_buy", "slippage_10k_bps_sell")
    )


def _rounded_spread(value: float | None) -> float | None:
    return None if value is None else round(float(value), 2)


def _empty_depth_levels() -> DepthLevelRecord:
    return {"1k": None, "2.5k": None, "10k": None, "25k": None, "100k": None, "250k": None, "1m": None}


def _best_spreads(records: list[LiquidityRecord]) -> DepthLevelRecord:
    output = _empty_depth_levels()
    for level, buy_key, sell_key in SPREAD_LEVELS:
        vals = [spread for record in records if (spread := _spread(record, buy_key, sell_key)) is not None]
        output[level] = _rounded_spread(min(vals)) if vals else None
    return output


def _merge_best_spreads(depth: DepthLevelRecord, records: list[LiquidityRecord]) -> DepthLevelRecord:
    output = cast("DepthLevelRecord", dict(depth))
    for level, buy_key, sell_key in SPREAD_LEVELS:
        spread = _rounded_spread(min(vals)) if (vals := [
            value
            for record in records
            if (value := _spread(record, buy_key, sell_key)) is not None
        ]) else None
        if spread is None:
            continue
        current = output[level]
        output[level] = spread if current is None else min(current, spread)
    return output


def _merge_best_depth_levels(depth: DepthLevelRecord, candidate: DepthLevelRecord) -> DepthLevelRecord:
    """Merge already-rounded depth levels, keeping the tightest spread per notional."""
    output = cast("DepthLevelRecord", dict(depth))
    for level in output:
        value = candidate[level]
        if value is None:
            continue
        current = output[level]
        output[level] = value if current is None else min(current, value)
    return output


def _depth_levels_have_value(depth: DepthLevelRecord) -> bool:
    return any(value is not None for value in depth.values())


def _orderbook_depth_record_has_value(record: OrderbookDepthRecord) -> bool:
    return any(_depth_levels_have_value(record[section]) for section in ("spot", "fut", "hl"))


def _depth_setups(style: MarketStyle, *, top_only: bool) -> list[CcxtL2ReturnSetup]:
    setups = [
        setup
        for setup in REFERENCE_CCXT_SETUPS
        if setup.market_style == style and setup.venue_name != VenueName.HYPERLIQUID
    ]
    if top_only:
        return [setup for setup in setups if setup.venue_name in TOP_DEPTH_VENUES]
    return setups


async def _fetch_depth_record_for_setup(
    coin: str,
    setup: CcxtL2ReturnSetup,
    apis: dict[CcxtL2ReturnSetup, ReturnsCcxtL2],
    api_locks: dict[CcxtL2ReturnSetup, Lock],
    markets_by_setup: dict[CcxtL2ReturnSetup, dict[str, dict[str, Any]]],
) -> LiquidityRecord:
    api = apis.get(setup)
    if api is None:
        lock = api_locks.setdefault(setup, Lock())
        async with lock:
            api = apis.get(setup)
            if api is None:
                try:
                    api = getattr(ccxt.pro, setup.venue_name.value)()
                    markets_by_setup[setup] = await load_markets_with_hourly_reload(api, setup)
                    apis[setup] = api
                except Exception as exc:
                    logger.warning(
                        "Skipping L2 venue leg after market metadata load failed",
                        extra={
                            "subsystem": "L2OB",
                            "venue": setup.venue_name.value,
                            "market_style": setup.market_style.value,
                            "exc_type": type(exc).__name__,
                            "error": repr(exc),
                        },
                    )
                    close = getattr(api, "close", None)
                    if close is not None:
                        with suppress(Exception):
                            await close()
                    return _empty_liquidity_record(
                        error_type=type(exc).__name__,
                        error_message=repr(exc),
                    )
    markets = markets_by_setup.get(setup)
    if markets is None:
        markets = await load_markets_with_hourly_reload(api, setup)
        markets_by_setup[setup] = markets
    symbol = f"{coin}{setup.symbol_base}"
    market = markets.get(symbol)
    if isinstance(market, dict) and market.get("active") is False:
        return _empty_liquidity_record(
            error_type="InactiveMarket",
            error_message=f"Skipping inactive market symbol={symbol}",
        )
    return await _fetch_and_build_liquidity_record(
        coin,
        api,
        setup.symbol_base,
        log_failures=False,
    )


async def _fetch_best_depth_for_style(
    coin: str,
    style: MarketStyle,
    apis: dict[CcxtL2ReturnSetup, ReturnsCcxtL2],
    api_locks: dict[CcxtL2ReturnSetup, Lock],
    markets_by_setup: dict[CcxtL2ReturnSetup, dict[str, dict[str, Any]]],
) -> tuple[DepthLevelRecord, dict[str, float]]:
    top_setups = _depth_setups(style, top_only=True)
    top_pairs = [
        (setup, record)
        for setup, record in zip(
            top_setups,
            await gather(
                *(
                    _fetch_depth_record_for_setup(coin, setup, apis, api_locks, markets_by_setup)
                    for setup in top_setups
                )
            ),
            strict=True,
        )
        if _record_has_spread(record)
    ]

    if len(top_pairs) >= 2:
        records = [record for _, record in top_pairs]
        return _best_spreads(records), _ten_k_liq_by_setup(style, top_pairs)

    fallback_setups = [
        setup
        for setup in _depth_setups(style, top_only=False)
        if setup.venue_name not in TOP_DEPTH_VENUES
    ]
    fallback_pairs = [
        (setup, record)
        for setup, record in zip(
            fallback_setups,
            await gather(
                *(
                    _fetch_depth_record_for_setup(coin, setup, apis, api_locks, markets_by_setup)
                    for setup in fallback_setups
                )
            ),
            strict=True,
        )
        if _record_has_spread(record)
    ]
    pairs = [*top_pairs, *fallback_pairs]
    records = [record for _, record in pairs]
    return _best_spreads(records), _ten_k_liq_by_setup(style, pairs)


def _ten_k_liq_by_setup(
    style: MarketStyle,
    pairs: list[tuple[CcxtL2ReturnSetup, LiquidityRecord]],
) -> dict[str, float]:
    out: dict[str, float] = {}
    for setup, record in pairs:
        spread = _ten_k_spread(record)
        if spread is None:
            continue
        key = f"{setup.venue_name.value}_{style.value}"
        out[key] = spread
    return out


async def _fetch_hl_depth(wire_symbols: tuple[str, ...]) -> tuple[DepthLevelRecord, dict[str, float]]:
    pairs = [
        (wire_symbol, record)
        for wire_symbol, record in zip(
            wire_symbols,
            await gather(
                *(_fetch_and_build_hl_liquidity_record(wire_symbol) for wire_symbol in wire_symbols)
            ),
            strict=True,
        )
        if _record_has_spread(record)
    ]
    liq_10k = {
        f"hyperliquid_futures:{wire_symbol}": spread
        for wire_symbol, record in pairs
        if (spread := _ten_k_spread(record)) is not None
    }
    return _best_spreads([record for _, record in pairs]), liq_10k


async def _fetch_hl_spot_depth(coin: str) -> tuple[DepthLevelRecord, dict[str, float]]:
    if coin != _HL_SPOT_PURR_SYMBOL:
        return _empty_depth_levels(), {}
    record = await _fetch_and_build_hl_spot_purr_liquidity_record()
    output = _empty_depth_levels()
    for level, buy_key, sell_key in SPREAD_LEVELS:
        output[level] = _rounded_spread(_spread(record, buy_key, sell_key))
    spread = _ten_k_spread(record)
    liq_10k = {"hyperliquid_spot": spread} if spread is not None else {}
    return output, liq_10k


async def fetch_orderbook_depth(
    *,
    deadline_ms: int,
    hl_coins_normalized: frozenset[str],
    hl_wire_symbols_by_normalized: dict[str, tuple[str, ...]],
    coins_ordered: list[str],
) -> dict[str, OrderbookDepthRecord]:
    """Build coin-centric OB depth rows in caller-provided priority order."""
    output: dict[str, OrderbookDepthRecord] = {}
    apis: dict[CcxtL2ReturnSetup, ReturnsCcxtL2] = {}
    api_locks: dict[CcxtL2ReturnSetup, Lock] = {}
    markets_by_setup: dict[CcxtL2ReturnSetup, dict[str, dict[str, Any]]] = {}
    seen: set[str] = set()
    ordered: list[str] = []
    for coin in [*coins_ordered, *sorted(hl_coins_normalized)]:
        if coin in seen:
            continue
        seen.add(coin)
        ordered.append(coin)

    try:
        for coin in ordered:
            if utc_ms() >= deadline_ms:
                logger.info(
                    "Orderbook depth deadline reached; stopping early",
                    extra={"subsystem": "OBDP", "coins_fetched": len(output), "deadline_ms": deadline_ms},
                )
                break

            spot_task = create_task(
                _fetch_best_depth_for_style(
                    coin,
                    MarketStyle.SPOT,
                    apis,
                    api_locks,
                    markets_by_setup,
                )
            )
            hl_spot_task = create_task(_fetch_hl_spot_depth(coin))
            fut_task = create_task(
                _fetch_best_depth_for_style(
                    coin,
                    MarketStyle.FUTURES,
                    apis,
                    api_locks,
                    markets_by_setup,
                )
            )
            hl_wire_symbols = hl_wire_symbols_by_normalized.get(coin, ())
            hl_fut_task = create_task(_fetch_hl_depth(hl_wire_symbols)) if hl_wire_symbols else None
            (spot, spot_10k_liq), (hl_spot, hl_spot_10k_liq), (fut, fut_10k_liq) = await gather(
                spot_task,
                hl_spot_task,
                fut_task,
            )
            if _depth_levels_have_value(hl_spot):
                spot = _merge_best_depth_levels(spot, hl_spot)
            hl_fut = _empty_depth_levels()
            liq_10k = {**spot_10k_liq, **hl_spot_10k_liq, **fut_10k_liq}
            if hl_fut_task is not None:
                hl_fut, hl_fut_10k_liq = await hl_fut_task
                liq_10k.update(hl_fut_10k_liq)
                fut = _merge_best_depth_levels(fut, hl_fut)
            record = cast(
                "OrderbookDepthRecord",
                {"spot": spot, "fut": fut, "hl": hl_fut, "10k_liq": liq_10k},
            )
            logger.info(
                "Orderbook depth 10k liquidity by venue",
                extra={
                    "subsystem": "OBDP",
                    "coin": coin,
                    "venue_10k_liq_bp": repr(liq_10k),
                },
            )
            if not _orderbook_depth_record_has_value(record):
                continue
            output[coin] = record
            if len(output) % 25 == 0:
                logger.info(
                    "OB depth progress",
                    extra={"subsystem": "OBDP", "coins_fetched": len(output), "last_coin": coin},
                )
    finally:
        for api in list(apis.values()):
            close = getattr(api, "close", None)
            if close is not None:
                with suppress(Exception):
                    await close()

    return output
