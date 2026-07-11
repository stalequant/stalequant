"""CCXT reference venues, candle universe, and orderbook aggregation profiles.

@stalequant - 2026-05-09
"""

from __future__ import annotations

from typing import Literal

from .models.venues import CcxtL2ReturnSetup
from .models.venues import MarketStyle
from .models.venues import VenueName

__all__ = [
    "REFERENCE_CCXT_SETUPS",
    "REFERENCE_SPOT_FUTURES_BY_EXCHANGE",
]

SpotFut = Literal["spot", "futures"]

def _build_reference_ccxt_setups() -> list[CcxtL2ReturnSetup]:
    """Return CcxtL2ReturnSetup rows for each reference exchange (spot/futures)."""
    return [
        CcxtL2ReturnSetup(VenueName.HYPERLIQUID, MarketStyle.FUTURES, "/USDC:USDC"),
        CcxtL2ReturnSetup(VenueName.BINANCE, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.BINANCE, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.BYBIT, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.BYBIT, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.OKX, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.OKX, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.GATE, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.GATE, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.KUCOIN, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.KUCOINFUTURES, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.MEXC, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.MEXC, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.BITGET, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.BITGET, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.BITFINEX, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.BITFINEX, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.BITMEX, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.HTX, MarketStyle.SPOT, "/USDT"),
        CcxtL2ReturnSetup(VenueName.HTX, MarketStyle.FUTURES, "/USDT:USDT"),
        CcxtL2ReturnSetup(VenueName.CRYPTOCOM, MarketStyle.SPOT, "/USD"),
        CcxtL2ReturnSetup(VenueName.CRYPTOCOM, MarketStyle.FUTURES, "/USD:USD"),
        CcxtL2ReturnSetup(VenueName.COINBASE, MarketStyle.SPOT, "/USD"),
        CcxtL2ReturnSetup(VenueName.KRAKEN, MarketStyle.SPOT, "/USD"),
        CcxtL2ReturnSetup(VenueName.KRAKENFUTURES, MarketStyle.FUTURES, "/USD:USD"),
    ]


REFERENCE_CCXT_SETUPS: list[CcxtL2ReturnSetup] = _build_reference_ccxt_setups()

# Derived from :data:`REFERENCE_CCXT_SETUPS` so candle/orderbook universes cannot drift.
REFERENCE_SPOT_FUTURES_BY_EXCHANGE: dict[str, list[SpotFut]] = {
    venue: sorted({setup.market_style.value for setup in REFERENCE_CCXT_SETUPS if setup.venue_name.value == venue})
    for venue in {setup.venue_name.value for setup in REFERENCE_CCXT_SETUPS}
}
