"""Raw feature constants.

Path helpers live in :mod:`src.config`.

@stalequant - 2026-05-09
"""

from __future__ import annotations

from ..symbols import STABLE_COINS

__all__ = [
    "HL_PRIMARY_PERP_DEX_KEY",
    "MIN_NON_HL_MARKET_CAP_USD",
    "SCORE_EXCLUDED_SYMBOLS",
]


# HL snapshot JSON uses this key for the primary perp dex block inside ``dex_details``.
HL_PRIMARY_PERP_DEX_KEY = ""

# Non-HL symbols below this market cap are dropped from the exported table.
MIN_NON_HL_MARKET_CAP_USD = 50_000_000.0

# Dropped from the raw export (stable-pegs and wrapped majors treated like stables).
SCORE_EXCLUDED_SYMBOLS: frozenset[str] = frozenset(
    {*STABLE_COINS, "WBTC", "WSTETH", "STETH", "USD1", "XAUT"}
)
