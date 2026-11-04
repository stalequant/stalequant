"""Compatibility re-exports for path helpers now centralized in :mod:`src.config`.

@stalequant - 2026-05-09
"""

from __future__ import annotations

from ..config import cmc_listings_path
from ..config import coincap_assets_path
from ..config import coingecko_markets_path
from ..config import DATA_DIR
from ..config import hl_raw_dex_meta_ctx_path
from ..config import hl_raw_historic_hlp_oi_path
from ..config import OUTPUT_DIR
from ..config import scoring_output_path

__all__ = [
    "cmc_listings_path",
    "coincap_assets_path",
    "coingecko_markets_path",
    "default_output_dir",
    "default_scoring_output_path",
    "hl_raw_dex_meta_ctx_path",
    "hl_raw_historic_hlp_oi_path",
    "scoring_output_path",
]


def default_output_dir():
    """Return the default recorder data directory."""
    return DATA_DIR


def default_scoring_output_path():
    """Return the default raw feature JSON path."""
    return scoring_output_path(OUTPUT_DIR)
