"""Runtime intervals, filesystem paths, cache ages, and operational constants.

Reference CCXT wiring lives in :mod:`src.venues`.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

__all__ = [
    "CANDLE_DAYS_TO_CONSIDER",
    "CANDLE_INTERVAL",
    "CANDLE_PATH_PREFIX",
    "CCXT_MARKET_RELOAD_INTERVAL_MS",
    "CMC_LISTINGS_PATH",
    "COINCAP_ASSETS_PATH",
    "COINGECKO_MARKETS_PATH",
    "DATA_DIR",
    "DATA_ROOT",
    "HL_RAW_DUMP_INTERVAL_MS",
    "HL_RAW_DEX_META_CTX_PATH",
    "HL_RAW_HISTORIC_HLP_OI_PATH",
    "HL_MARK_PRICES_PATH",
    "HL_SPOT_CANDLES_PATH",
    "HIP3_OUTPUT_PATH",
    "INTERVAL_MS",
    "L2_DEADLINE_BEFORE_INTERVAL_MS",
    "MAX_CANDLE_AGE_MS",
    "MAX_COINCAP_CACHE_AGE_MS",
    "MAX_MARKET_SOURCES_CACHE_AGE_MS",
    "PRICE_POLL_INTERVAL_S",
    "ORDERBOOK_DEPTH_PATH",
    "OUTPUT_DIR",
    "PROJECT_ROOT",
    "SCORING_OUTPUT_PATH",
    "WEB_DIR",
    "WEB_HIP3_OUTPUT_PATH",
    "WEB_SCORING_OUTPUT_PATH",
    "candle_cache_path",
    "cmc_listings_path",
    "coincap_assets_path",
    "coingecko_markets_path",
    "hl_raw_dex_meta_ctx_path",
    "hl_raw_historic_hlp_oi_path",
    "hl_mark_prices_path",
    "hl_spot_candles_path",
    "hip3_output_path",
    "orderbook_depth_path",
    "scoring_output_path",
    "web_scoring_output_path",
    "web_hip3_output_path",
]


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT.parent / "delisting_new_data"
DATA_DIR = DATA_ROOT / "data"
OUTPUT_DIR = DATA_ROOT / "results"
WEB_DIR = PROJECT_ROOT.parent / "delisting_new"

CANDLE_DAYS_TO_CONSIDER: float = 30
CANDLE_INTERVAL: Literal["1d"] = "1d"
CANDLE_PATH_PREFIX = "exch_candles"


def hl_raw_dex_meta_ctx_path(root: Path = DATA_DIR) -> Path:
    """Return the HL hourly meta/ctx JSONL path under ``root``."""
    return root / "hl_raw_dex_meta_ctx.jsonl"


def hl_raw_historic_hlp_oi_path(root: Path = DATA_DIR) -> Path:
    """Return the historic HLP OI JSONL path under ``root``."""
    return root / "hlp_oi.jsonl"


def orderbook_depth_path(root: Path = DATA_DIR) -> Path:
    """Return the coin-centric orderbook depth JSONL path under ``root``."""
    return root / "orderbook_depth.jsonl"


def hl_mark_prices_path(root: Path = DATA_DIR) -> Path:
    """Return the mark price poll JSONL path under ``root``."""
    return root / "hl_mark_prices.jsonl"


def hl_spot_candles_path(root: Path = DATA_DIR) -> Path:
    """Return the Hyperliquid spot-only candle cache path under ``root``."""
    return candle_cache_path("hyperliquid", "spot", root)


def scoring_output_path(root: Path = OUTPUT_DIR) -> Path:
    """Return the emitted raw feature JSON path under ``root``."""
    return root / "hl_delisting_data.json"


def web_scoring_output_path(root: Path = WEB_DIR) -> Path:
    """Return the static site raw feature JSON path under ``root``."""
    return root / "hl_delisting_data.json"


def hip3_output_path(root: Path = OUTPUT_DIR) -> Path:
    """Return the emitted HIP-3 asset JSON path under ``root``."""
    return root / "hip3_data.json"


def web_hip3_output_path(root: Path = WEB_DIR) -> Path:
    """Return the static site HIP-3 asset JSON path under ``root``."""
    return root / "hip3_data.json"


def cmc_listings_path(root: Path = DATA_DIR) -> Path:
    """Return the wrapped CMC listings cache path under ``root``."""
    return root / "cmc_listings_latest.json"


def coingecko_markets_path(root: Path = DATA_DIR) -> Path:
    """Return the wrapped CoinGecko markets cache path under ``root``."""
    return root / "coingecko_markets_usd.json"


def coincap_assets_path(root: Path = DATA_DIR) -> Path:
    """Return the wrapped CoinCap assets cache path under ``root``."""
    return root / "coincap_assets.json"


def candle_cache_path(
    venue_name: object,
    market_style: object,
    root: Path = DATA_DIR,
) -> Path:
    """Return the wrapped OHLCV candle cache path for a venue/style pair."""
    venue = getattr(venue_name, "value", venue_name)
    style = getattr(market_style, "value", market_style)
    return root / f"{CANDLE_PATH_PREFIX}_{venue}_{style}_{CANDLE_INTERVAL}.json"


HL_RAW_DEX_META_CTX_PATH = hl_raw_dex_meta_ctx_path()
HL_RAW_HISTORIC_HLP_OI_PATH = hl_raw_historic_hlp_oi_path()
ORDERBOOK_DEPTH_PATH = orderbook_depth_path()
HL_MARK_PRICES_PATH = hl_mark_prices_path()
HL_SPOT_CANDLES_PATH = hl_spot_candles_path()
SCORING_OUTPUT_PATH = scoring_output_path()
WEB_SCORING_OUTPUT_PATH = web_scoring_output_path()
HIP3_OUTPUT_PATH = hip3_output_path()
WEB_HIP3_OUTPUT_PATH = web_hip3_output_path()
CMC_LISTINGS_PATH = cmc_listings_path()
COINGECKO_MARKETS_PATH = coingecko_markets_path()
COINCAP_ASSETS_PATH = coincap_assets_path()

INTERVAL_MS = 15 * 60 * 1000
HL_RAW_DUMP_INTERVAL_MS = 60 * 60 * 1000
CCXT_MARKET_RELOAD_INTERVAL_MS = 60 * 60 * 1000
PRICE_POLL_INTERVAL_S = 10
L2_DEADLINE_BEFORE_INTERVAL_MS = 60 * 1000

MAX_CANDLE_AGE_MS = 24 * 60 * 60 * 1000
MAX_MARKET_SOURCES_CACHE_AGE_MS = 24 * 60 * 60 * 1000
MAX_COINCAP_CACHE_AGE_MS = 6 * 24 * 60 * 60 * 1000
