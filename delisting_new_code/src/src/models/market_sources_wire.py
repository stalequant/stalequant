"""Third-party listing / market API wire row hints (partial TypedDicts).

Providers return loosely typed JSON; these types document fields we read.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from typing import TypedDict

__all__ = [
    "CoinCapAssetRow",
    "CoinGeckoMarketRow",
    "CoinMarketCapListingRow",
]


class CoinMarketCapListingRow(TypedDict, total=False):
    """Subset of CMC ``listings/latest`` row fields we consume."""

    symbol: str
    name: str
    quote: dict[str, object]


class CoinCapAssetRow(TypedDict, total=False):
    """Subset of CoinCap ``/v3/assets`` row fields we consume."""

    symbol: str
    name: str
    marketCapUsd: str


class CoinGeckoMarketRow(TypedDict, total=False):
    """Subset of CoinGecko ``/coins/markets`` row fields we consume."""

    symbol: str
    name: str
    market_cap: float | None
