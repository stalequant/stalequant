"""Normalized Hyperliquid meta/asset views (parsed from wire at the client boundary).

Wire-shaped JSON remains in :mod:`delisting_calcs.models.hyperliquid_wire`.

@stalequant - 2026-05-09
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

__all__ = [
    "AssetCtx",
    "DexSnapshot",
]


@dataclass(frozen=True)
class AssetCtx:
    """One perp asset after parsing ``meta.universe[i]`` + ``asset_ctxs[i]``."""

    coin: str
    wire_coin: str
    mark_px: float | None
    max_leverage: int | None
    is_delisted: bool


@dataclass(frozen=True)
class DexSnapshot:
    """One dex's universe after normalizing wire meta + asset_ctxs."""

    dex: str
    assets: Mapping[str, AssetCtx]
