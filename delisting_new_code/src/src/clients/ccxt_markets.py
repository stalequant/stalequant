"""Shared CCXT market metadata loading policy."""

from __future__ import annotations

import logging
from typing import Any

from ..config import CCXT_MARKET_RELOAD_INTERVAL_MS
from ..models.venues import CcxtL2ReturnSetup
from ..time_utils import utc_ms

logger = logging.getLogger(__name__)

_LAST_FORCED_MARKET_RELOAD_MS: dict[tuple[str, str], int] = {}


async def load_markets_with_hourly_reload(
    api: Any,
    setup: CcxtL2ReturnSetup,
) -> dict[str, dict[str, Any]]:
    """Load CCXT markets, forcing a metadata refresh at most once per venue/style per hour."""
    now_ms = utc_ms()
    key = (setup.venue_name.value, setup.market_style.value)
    last_reload_ms = _LAST_FORCED_MARKET_RELOAD_MS.get(key)
    force_reload = (
        last_reload_ms is None
        or now_ms - last_reload_ms >= CCXT_MARKET_RELOAD_INTERVAL_MS
    )
    markets = await api.load_markets(reload=force_reload)
    if force_reload:
        _LAST_FORCED_MARKET_RELOAD_MS[key] = now_ms
        logger.info(
            "CCXT market metadata force-refreshed",
            extra={
                "subsystem": "CCXT",
                "venue": setup.venue_name.value,
                "market_style": setup.market_style.value,
                "market_count": len(markets),
            },
        )
    return markets
