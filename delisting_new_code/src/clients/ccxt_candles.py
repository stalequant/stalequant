"""Keep candles for reference exchanges updated.

@stalequant - 2026-04-30
"""

import logging
from asyncio import sleep
from contextlib import suppress
from math import sqrt

import ccxt.pro

from ..config import CANDLE_DAYS_TO_CONSIDER
from ..config import CANDLE_INTERVAL
from ..models.ccxt import CcxtCandlesReturn
from ..models.records import MarketSummary
from ..models.venues import CcxtL2ReturnSetup
from ..models.venues import VenueName
from ..symbols import clean_symbol
from ..time_utils import utc_ms
from .ccxt_markets import load_markets_with_hourly_reload
from .hyperliquid import post_hl_info

logger = logging.getLogger(__name__)

__all__ = ["fetch_hyperliquid_spot_purr_data", "fetch_reference_exchange_data"]

_HL_SPOT_PURR_COIN = "PURR/USDC"
_DAY_MS = 24 * 60 * 60 * 1000


def _market_matches_setup(market: str, setup: CcxtL2ReturnSetup) -> bool:
    """Whether ``market`` should receive OHLCV for this reference-exchange ``setup``."""
    return market.endswith(setup.symbol_base) or (
        setup.venue_name == VenueName.HYPERLIQUID and ":" in market
    )


def _process_exchange_data(candles: CcxtCandlesReturn) -> MarketSummary:
    ntl_volumes: list[float] = []
    returns: list[float] = []
    ranges: list[float] = []
    days = 0
    latest_candle_ts = 0

    for ts, open_px, high, low, close, volume, *_ in sorted(candles, key=lambda x: -x[0]):
        if volume and low and open_px and high and close:
            days += 1
            ntl_volumes.append(volume * low)
            returns.append(close / open_px - 1)
            ranges.append(high / low - 1)
            latest_candle_ts = max(latest_candle_ts, int(ts))

        if days >= CANDLE_DAYS_TO_CONSIDER:
            break

    return {
        "ntl_volume": sum(ntl_volumes) / len(ntl_volumes) if ntl_volumes else float("nan"),
        "std": (sqrt(sum(ret**2 for ret in returns) / len(returns)) if returns else float("nan")),
        "intra_day_range": (
            sqrt(sum(day_range**2 for day_range in ranges) / len(ranges))
            if ranges
            else float("nan")
        ),
        "latest_candle_ts": latest_candle_ts,
    }


def _hl_candle_snapshot_to_ccxt(raw: object) -> CcxtCandlesReturn:
    """Convert Hyperliquid candleSnapshot rows to CCXT-shaped OHLCV tuples."""
    if not isinstance(raw, list):
        msg = f"Hyperliquid candleSnapshot expected list, got {type(raw).__name__}"
        raise TypeError(msg)

    candles: CcxtCandlesReturn = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        try:
            candles.append(
                (
                    int(row["t"]),
                    float(row["o"]),
                    float(row["h"]),
                    float(row["l"]),
                    float(row["c"]),
                    float(row["v"]),
                    float(row.get("n", 0)),
                )
            )
        except (KeyError, TypeError, ValueError):
            logger.debug(
                "Skipping malformed HL spot PURR candle",
                extra={"subsystem": "CCND", "row": repr(row)[:500]},
            )
            continue
    return candles


async def fetch_hyperliquid_spot_purr_data() -> dict[str, MarketSummary]:
    """Fetch OHLCV summary for only Hyperliquid spot PURR."""
    try:
        logger.info(
            "Starting HL spot PURR candle download",
            extra={"subsystem": "CCND", "venue": VenueName.HYPERLIQUID.value, "market_style": "spot"},
        )
        end_time = utc_ms()
        start_time = end_time - int(CANDLE_DAYS_TO_CONSIDER + 10) * _DAY_MS

        raw_data: object | None = None
        for tries in range(5):
            try:
                logger.info(
                    "Downloading HL spot PURR OHLCV",
                    extra={
                        "subsystem": "CCND",
                        "venue": VenueName.HYPERLIQUID.value,
                        "market": _HL_SPOT_PURR_COIN,
                        "interval": CANDLE_INTERVAL,
                        "start_time_ms": start_time,
                        "end_time_ms": end_time,
                    },
                )
                raw_data = await post_hl_info(
                    {
                        "type": "candleSnapshot",
                        "req": {
                            "coin": _HL_SPOT_PURR_COIN,
                            "interval": CANDLE_INTERVAL,
                            "startTime": start_time,
                            "endTime": end_time,
                        },
                    }
                )
                await sleep(2)
                break
            except Exception as e:
                logger.debug(
                    "HL spot PURR OHLCV fetch attempt failed; retrying",
                    extra={
                        "subsystem": "CCND",
                        "venue": VenueName.HYPERLIQUID.value,
                        "market": _HL_SPOT_PURR_COIN,
                        "attempt": tries + 1,
                        "max_attempts": 5,
                        "exc_type": type(e).__name__,
                        "error": repr(e),
                    },
                )
                await sleep(5)
        else:
            msg = "Failed to download Hyperliquid spot PURR candles after 5 attempts"
            raise RuntimeError(msg)

        if raw_data is None:
            msg = "Hyperliquid spot PURR candles returned no data"
            raise RuntimeError(msg)

        candles = _hl_candle_snapshot_to_ccxt(raw_data)
        if not candles:
            msg = "Hyperliquid spot PURR candles returned no parseable rows"
            raise RuntimeError(msg)

        return {_HL_SPOT_PURR_COIN: _process_exchange_data(candles)}

    except Exception as e:
        logger.error(
            "Failed to fetch HL spot PURR candles",
            extra={
                "subsystem": "CCND",
                "venue": VenueName.HYPERLIQUID.value,
                "market_style": "spot",
                "exc_type": type(e).__name__,
                "error": repr(e),
            },
        )
        raise

async def fetch_reference_exchange_data(
    setup: CcxtL2ReturnSetup,
    *,
    eligible_symbols: frozenset[str] | None = None,
) -> dict[str, MarketSummary]:
    """Fetch OHLCV summaries for markets matching ``setup``."""
    api = None
    try:
        logger.info(
            "Starting candle download for venue leg",
            extra={
                "subsystem": "CCND",
                "venue": setup.venue_name.value,
                "market_style": setup.market_style.value,
            },
        )
        api = getattr(ccxt.pro, setup.venue_name.value)()
        markets = await load_markets_with_hourly_reload(api, setup)

        exchange_data: dict[str, MarketSummary] = {}
        for market in api.markets:
            if not _market_matches_setup(market, setup):
                continue
            if (
                eligible_symbols is not None
                and clean_symbol(market, setup.venue_name) not in eligible_symbols
            ):
                continue

            if not markets[market].get("active", True):
                continue

            for tries in range(5):
                try:

                    logger.info(
                        "Downloading market OHLCV",
                        extra={
                            "subsystem": "CCND",
                            "venue": setup.venue_name.value,
                            "market_style": setup.market_style.value,
                            "market": market,
                        },
                    )
                    raw_data = await api.fetch_ohlcv(market, CANDLE_INTERVAL, limit=100)
                    await sleep(2)
                    break

                except Exception as e:
                    logger.debug(
                        "OHLCV fetch attempt failed; retrying",
                        extra={
                            "subsystem": "CCND",
                            "venue": setup.venue_name.value,
                            "market": market,
                            "attempt": tries + 1,
                            "max_attempts": 5,
                            "exc_type": type(e).__name__,
                            "error": repr(e),
                        },
                    )
                    await sleep(5)
                    continue
            else:
                logger.debug(
                    "Failed to download market OHLCV after max attempts; skipping market",
                    extra={
                        "subsystem": "CCND",
                        "venue": setup.venue_name.value,
                        "market": market,
                        "max_attempts": 5,
                    },
                )
                continue

            try:
                summary = _process_exchange_data(raw_data)
                exchange_data[market] = summary

            except Exception as e:
                logger.error(
            "Failed to process OHLCV batch; skipping market",
                    extra={
                        "subsystem": "CCND",
                        "venue": setup.venue_name.value,
                        "market": market,
                        "exc_type": type(e).__name__,
                        "error": repr(e),
                    },
                )
                continue

        if not exchange_data:
            msg = (
                f"No candle rows fetched for venue={setup.venue_name.value} "
                f"market_style={setup.market_style.value}"
            )
            raise RuntimeError(msg)

        logger.info(
            "Completed candle fetch for venue leg",
            extra={
                "subsystem": "CCND",
                "venue": setup.venue_name.value,
                "market_style": setup.market_style.value,
                "market_count": len(exchange_data),
            },
        )
        return exchange_data

    except Exception as e:
        logger.error(
            "Failed to fetch candles for venue leg",
            extra={
                "subsystem": "CCND",
                "venue": setup.venue_name.value,
                "market_style": setup.market_style.value,
                "exc_type": type(e).__name__,
                "error": repr(e),
            },
        )
        raise

    finally:
        if api:
            with suppress(Exception):
                await api.close()
