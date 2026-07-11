"""Hyperliquid-specific operational constants.

@stalequant - 2026-05-09
"""

from __future__ import annotations

from typing import Any

__all__ = ["BOOK_AGGREGATION_LEVELS", "HLP_ADDRESSES"]

BOOK_AGGREGATION_LEVELS: tuple[dict[str, Any], ...] = (
    {},  # native / finest book
    {"nSigFigs": 5},
    {"nSigFigs": 4},
    {"nSigFigs": 3},
)

# HLP vault addresses polled by :mod:`src.clients.hyperliquid` for OI-style snapshots.
HLP_ADDRESSES: tuple[str, ...] = (
    "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
    "0x010461c14e146ac35fe42271bdc1134ee31c703a",
    "0x2e3d94f0562703b25c83308a05046ddaf9a8dd14",
    "0x2ed5c4484ea3ff8b57d5f2fb152a40d9f2b68308",
    "0x31ca8395cf837de08b24da3f660e77761dfb974b",
    "0x469f690213c467c39a23efacfd2816896009d7d8",
    "0x5e177e5e39c0f4e421f5865a6d8beed8d921cb70",
    "0xb0a55f13d22f66e6d495ac98113841b2326e9540",
)
