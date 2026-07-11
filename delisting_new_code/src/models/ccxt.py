"""CCXT-shaped protocols and container aliases used at fetch boundaries.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from typing import Any
from typing import Protocol
from typing import TypedDict

__all__ = ["CcxtCandlesReturn", "CcxtL2Structure", "PriceQty", "ReturnsCcxtL2"]

PriceQty = tuple[float, float]

CcxtCandlesReturn = list[tuple[int, float, float, float, float, float, float]]


class CcxtL2Structure(TypedDict):
    """Bid and ask levels as CCXT-style ``(price, qty)`` tuples."""

    bids: list[PriceQty]
    asks: list[PriceQty]


class ReturnsCcxtL2(Protocol):
    """Protocol for async clients that can return CCXT-style L2 books."""

    async def load_markets(self, reload: bool = False) -> dict[str, dict[str, Any]]:
        """Return CCXT markets map."""
        ...

    async def fetch_order_book(self, symbol: str, limit: int | None = None) -> CcxtL2Structure:
        """Return bids/asks for ``symbol``."""
        ...
