"""Hyperliquid info API wire TypedDict shapes.

Parse into :class:`~src.models.hyperliquid_normalized.DexSnapshot` at the HTTP client boundary.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from typing import TypedDict
from typing_extensions import NotRequired

__all__ = [
    "ClearinghouseState",
    "HlDexDetailEntry",
    "HlMetaCtxByDex",
    "HlpAssetPositionOuter",
    "HlpPosition",
    "HyperliquidL2Return",
    "HyperliquidL2Row",
    "PerpDexRow",
]


class HyperliquidL2Row(TypedDict):
    px: str
    sz: str


class HyperliquidL2Return(TypedDict):
    levels: tuple[list[HyperliquidL2Row], list[HyperliquidL2Row]]


class PerpDexRow(TypedDict, total=False):
    """One row from Hyperliquid ``perpDexs`` info response."""

    name: NotRequired[str]


class HlDexDetailEntry(TypedDict):
    """One dex slice under ``HlMetaCtxByDex["dex_details"]``."""

    meta: object
    asset_ctxs: object


class HlMetaCtxByDex(TypedDict):
    """HL ``perpDexs`` wire body plus ``metaAndAssetCtxs`` per dex."""

    dex_info: object
    dex_details: dict[str, HlDexDetailEntry]


class HlpPosition(TypedDict):
    coin: str
    szi: float | None
    positionValue: float | None


class HlpAssetPositionOuter(TypedDict):
    position: HlpPosition


class ClearinghouseState(TypedDict):
    assetPositions: list[HlpAssetPositionOuter]
