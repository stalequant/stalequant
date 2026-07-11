"""Aggregated market metrics and per-symbol orderbook depth rows.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from typing import TypedDict
from typing_extensions import NotRequired

__all__ = [
    "DepthLevelRecord",
    "ExceptionRecord",
    "LiquidityRecord",
    "MarketSummary",
    "OrderbookDepthRecord",
]


class MarketSummary(TypedDict):
    """Rollup stats from recent OHLCV candles."""

    latest_candle_ts: int
    ntl_volume: float
    std: float
    intra_day_range: float


class LiquidityRecord(TypedDict):
    """Intermediate buy/sell slippage values at multiple notionals."""

    ms_time: int
    slippage_1k_bps_buy: float | None
    slippage_1k_bps_sell: float | None
    slippage_2_5k_bps_buy: float | None
    slippage_2_5k_bps_sell: float | None
    slippage_10k_bps_buy: float | None
    slippage_10k_bps_sell: float | None
    slippage_25k_bps_buy: float | None
    slippage_25k_bps_sell: float | None
    slippage_100k_bps_buy: float | None
    slippage_100k_bps_sell: float | None
    slippage_250k_bps_buy: float | None
    slippage_250k_bps_sell: float | None
    slippage_1m_bps_buy: float | None
    slippage_1m_bps_sell: float | None
    error_type: str | None
    error_message: str | None


DepthLevelRecord = TypedDict(
    "DepthLevelRecord",
    {
        "1k": float | None,
        "2.5k": float | None,
        "10k": float | None,
        "25k": float | None,
        "100k": float | None,
        "250k": float | None,
        "1m": float | None,
    },
)


OrderbookDepthRecord = TypedDict(
    "OrderbookDepthRecord",
    {
        "spot": DepthLevelRecord,
        "fut": DepthLevelRecord,
        "hl": DepthLevelRecord,
        "10k_liq": NotRequired[dict[str, float]],
    },
)


class ExceptionRecord(TypedDict):
    """Inline exception text placeholder."""

    exc: str
