"""Venue identifiers, market style, and CCXT reference setup rows.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

__all__ = ["CcxtL2ReturnSetup", "MarketStyle", "VenueName"]


class _StringEnum(str, Enum):
    """Python 3.10-compatible string enum with StrEnum-style formatting."""

    def __str__(self) -> str:
        return self.value


class MarketStyle(_StringEnum):
    """Spot or futures CCXT market category."""

    SPOT = "spot"
    FUTURES = "futures"


class VenueName(_StringEnum):
    """Reference CCXT exchange identifiers used by recorders."""

    BINANCE = "binance"
    BYBIT = "bybit"
    OKX = "okx"
    GATE = "gate"
    KUCOIN = "kucoin"
    KUCOINFUTURES = "kucoinfutures"
    MEXC = "mexc"
    BITGET = "bitget"
    BITMEX = "bitmex"
    HTX = "htx"
    CRYPTOCOM = "cryptocom"
    HYPERLIQUID = "hyperliquid"
    KRAKEN = "kraken"
    KRAKENFUTURES = "krakenfutures"
    BITFINEX = "bitfinex"
    COINBASE = "coinbase"


@dataclass(frozen=True)
class CcxtL2ReturnSetup:
    """One CCXT venue leg used for candles / orderbooks."""

    venue_name: VenueName
    market_style: MarketStyle
    symbol_base: str
