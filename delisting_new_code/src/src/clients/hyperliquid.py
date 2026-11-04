"""Hyperliquid HTTP info client: perp dex discovery, meta/ctx, L2 book, HLP OI.

@stalequant - 2026-04-30
"""

from __future__ import annotations

import asyncio
import json
import logging
from asyncio import sleep
from collections.abc import Mapping
from traceback import format_exc
from types import MappingProxyType
from typing import Any
from typing import TypeAlias
from typing import cast

from pydantic import TypeAdapter

from ..http import get_http_client
from ..hyperliquid_constants import HLP_ADDRESSES
from ..models.ccxt import CcxtL2Structure
from ..models.hyperliquid_normalized import AssetCtx
from ..models.hyperliquid_normalized import DexSnapshot
from ..models.hyperliquid_wire import ClearinghouseState
from ..models.hyperliquid_wire import HlDexDetailEntry
from ..models.hyperliquid_wire import HlMetaCtxByDex
from ..models.hyperliquid_wire import HyperliquidL2Return
from ..models.hyperliquid_wire import PerpDexRow
from ..symbols import normalize_hl_coin_name

__all__ = [
    "DEFAULT_PERP_DEX",
    "AssetCtx",
    "DexSnapshot",
    "HlMetaCtxByDex",
    "HlpOi",
    "collect_hl_wire_symbols_by_normalized_coin_from_dex_details",
    "collect_normalized_hl_coins_from_dex_details",
    "dex_snapshot_from_wire",
    "dex_snapshots_from_dex_details",
    "fetch_all_dex_mark_snapshots",
    "fetch_hip3_dex_names",
    "fetch_hlp_oi",
    "fetch_meta_and_asset_ctx_by_dex",
    "fetch_order_book",
    "fetch_perp_dexs",
    "fetch_raw_hl_meta_ctx_bundle",
    "hip3_dex_names_from_rows",
    "normalized_coin_universe_from_snapshots",
    "mark_prices_from_dex_snapshot",
    "post_hl_info",
    "validated_perp_dex_rows",
    "wire_symbols_by_normalized_coin_from_snapshots",
]

_HL_INFO_URL = "https://api.hyperliquid.xyz/info"

logger = logging.getLogger(__name__)


async def post_hl_info(payload: dict[str, object]) -> object:
    """POST an info payload to Hyperliquid and return decoded JSON."""
    client = get_http_client()
    body = json.dumps(payload)

    async def request() -> tuple[object, bytes]:
        resp = await client.request(
            url=_HL_INFO_URL,
            method="POST",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        content = await resp.content()
        return resp, content

    resp, content = await asyncio.wait_for(request(), timeout=15)

    status_code = int(getattr(resp, "status_code", 0))
    if status_code < 200 or status_code >= 300:  # noqa: PLR2004
        snippet = content[:500].decode("utf-8", errors="replace")
        msg = f"Hyperliquid info request failed status={status_code} body_snippet={snippet!r}"
        logger.error(
            msg,
            extra={"subsystem": "HLAPI", "http_status": status_code},
        )
        raise ConnectionError(msg)

    return json.loads(content)


DEFAULT_PERP_DEX = ""


def validated_perp_dex_rows(dex_info: object) -> list[PerpDexRow]:
    """Parse ``perpDexs`` response; skip ``None`` and non-dict elements (wire may pad with null)."""
    if not isinstance(dex_info, list):
        msg = f"perpDexs expected a JSON list, got {type(dex_info).__name__}"
        raise TypeError(msg)
    dex_elts = cast("list[Any]", dex_info)
    dict_rows: list[Any] = [r for r in dex_elts if isinstance(r, dict)]
    return TypeAdapter(list[PerpDexRow]).validate_python(dict_rows)


def hip3_dex_names_from_rows(rows: list[PerpDexRow]) -> tuple[str, ...]:
    """HIP-3 / non-default dex names from validated ``perpDexs`` rows."""
    names = (
        DEFAULT_PERP_DEX if not (t := n.strip()) else t
        for r in rows
        if (n := r.get("name")) is not None
    )
    return tuple(dict.fromkeys(n for n in names if n != DEFAULT_PERP_DEX))


async def fetch_perp_dexs() -> list[PerpDexRow]:
    """Fetch and validate ``perpDexs``."""
    raw = await post_hl_info({"type": "perpDexs"})
    return validated_perp_dex_rows(raw)


async def fetch_hip3_dex_names() -> tuple[str, ...]:
    """Return non-default perp dex names from ``perpDexs``."""
    return hip3_dex_names_from_rows(await fetch_perp_dexs())


_META_CTX_PAIR_LEN = 2


def _optional_float(val: object) -> float | None:
    if val is None:
        return None
    try:
        return float(str(val))
    except (TypeError, ValueError):
        return None


def _optional_non_negative_int(val: object) -> int | None:
    if val is None:
        return None
    try:
        x = int(float(str(val)))
    except (TypeError, ValueError):
        return None
    return x if x >= 0 else None


def _wire_bool_delisted(val: object) -> bool:
    return val is True


def _asset_ctx_from_universe_and_ctx_row(u: object, ctx_row: object) -> AssetCtx | None:
    if not isinstance(u, dict) or not isinstance(ctx_row, dict):
        return None
    u_dict = cast("dict[str, object]", u)
    ctx_dict = cast("dict[str, object]", ctx_row)
    raw_name = u_dict.get("name")
    if not isinstance(raw_name, str) or not raw_name:
        return None
    coin = normalize_hl_coin_name(raw_name)
    mark_px = _optional_float(ctx_dict.get("markPx"))
    max_leverage = _optional_non_negative_int(u_dict.get("maxLeverage"))
    is_delisted = _wire_bool_delisted(u_dict.get("isDelisted")) or _wire_bool_delisted(
        ctx_dict.get("isDelisted")
    )
    return AssetCtx(
        coin=coin,
        wire_coin=raw_name,
        mark_px=mark_px,
        max_leverage=max_leverage,
        is_delisted=is_delisted,
    )


def dex_snapshot_from_wire(dex: str, meta: object, ctxs: object) -> DexSnapshot:
    """Parse one dex ``meta`` + ``asset_ctxs`` wire pair into normalized assets (by normalized coin)."""
    assets: dict[str, AssetCtx] = {}
    if not isinstance(meta, dict):
        return DexSnapshot(dex=dex, assets=MappingProxyType({}))
    meta_dict = cast("dict[str, object]", meta)
    uni_obj = meta_dict.get("universe")
    if not isinstance(uni_obj, list) or not isinstance(ctxs, list):
        return DexSnapshot(dex=dex, assets=MappingProxyType({}))
    uni_list = cast("list[object]", uni_obj)
    ctx_list = cast("list[object]", ctxs)
    for i, u in enumerate(uni_list):
        if i >= len(ctx_list):
            break
        row = _asset_ctx_from_universe_and_ctx_row(u, ctx_list[i])
        if row is None:
            continue
        assets[row.coin] = row
    return DexSnapshot(dex=dex, assets=MappingProxyType(assets))


def mark_prices_from_dex_snapshot(snap: DexSnapshot) -> dict[str, float]:
    """Build normalized coin to markPx using only assets that publish ``markPx``."""
    prices: dict[str, float] = {}
    for key, a in snap.assets.items():
        px = a.mark_px
        if px is None:
            continue
        prices[key] = px
    return prices


def dex_snapshots_from_dex_details(details: dict[str, HlDexDetailEntry]) -> dict[str, DexSnapshot]:
    """Normalize every entry in a fetched ``dex_details`` map."""
    return {
        dex: dex_snapshot_from_wire(dex, entry["meta"], entry["asset_ctxs"])
        for dex, entry in details.items()
    }


def normalized_coin_universe_from_snapshots(snaps: Mapping[str, DexSnapshot]) -> frozenset[str]:
    """Union of active normalized coin symbols across dex snapshots."""
    names: set[str] = set()
    for s in snaps.values():
        names.update(name for name, asset in s.assets.items() if not asset.is_delisted)
    return frozenset(names)


def wire_symbols_by_normalized_coin_from_snapshots(
    snaps: Mapping[str, DexSnapshot],
) -> dict[str, tuple[str, ...]]:
    """Active normalized coin -> Hyperliquid l2Book wire symbols, including HIP-3 dex prefixes."""
    out: dict[str, list[str]] = {}
    for snap in snaps.values():
        for name, asset in snap.assets.items():
            if asset.is_delisted:
                continue
            raw_wire_coin = asset.wire_coin
            dex_prefix = f"{snap.dex}:"
            if snap.dex != DEFAULT_PERP_DEX and raw_wire_coin.startswith(dex_prefix):
                raw_wire_coin = raw_wire_coin[len(dex_prefix) :]
            wire_coin = raw_wire_coin if snap.dex == DEFAULT_PERP_DEX else f"{snap.dex}:{raw_wire_coin}"
            out.setdefault(name, []).append(wire_coin)
    return {name: tuple(dict.fromkeys(wire_coins)) for name, wire_coins in out.items()}


def _expect_meta_ctx_pair(body: object) -> tuple[object, object]:
    if not isinstance(body, list):
        msg = f"metaAndAssetCtxs expected [meta, ctxs] list, got {type(body).__name__}"
        raise TypeError(msg)
    pair = cast("list[object]", body)
    if len(pair) != _META_CTX_PAIR_LEN:
        msg = f"metaAndAssetCtxs expected length {_META_CTX_PAIR_LEN}, got {len(pair)}"
        raise TypeError(msg)
    return pair[0], pair[1]


def collect_normalized_hl_coins_from_dex_details(
    details: dict[str, HlDexDetailEntry],
) -> frozenset[str]:
    """Union of non-delisted normalized universe names across all dex detail entries."""
    return normalized_coin_universe_from_snapshots(dex_snapshots_from_dex_details(details))


def collect_hl_wire_symbols_by_normalized_coin_from_dex_details(
    details: dict[str, HlDexDetailEntry],
) -> dict[str, tuple[str, ...]]:
    """Map non-delisted normalized names to l2Book wire symbols across default and HIP-3 dexes."""
    return wire_symbols_by_normalized_coin_from_snapshots(dex_snapshots_from_dex_details(details))


async def fetch_raw_hl_meta_ctx_bundle() -> HlMetaCtxByDex:
    """Fetch raw ``perpDexs`` plus full ``metaAndAssetCtxs`` per dex (wire-shaped)."""
    dex_info = await post_hl_info({"type": "perpDexs"})
    rows = validated_perp_dex_rows(dex_info)

    details: dict[str, HlDexDetailEntry] = {}

    payload: dict[str, object] = {"type": "metaAndAssetCtxs"}
    body = await post_hl_info(payload)
    meta_part, ctxs_part = _expect_meta_ctx_pair(body)
    details[DEFAULT_PERP_DEX] = {"meta": meta_part, "asset_ctxs": ctxs_part}

    try:
        hip3_dexes = hip3_dex_names_from_rows(rows)
    except Exception as exc:
        logger.error(
            "Failed to derive HIP-3 dex names from perpDexs; continuing with default dex only",
            extra={
                "subsystem": "HLFX",
                "exc_type": type(exc).__name__,
                "error": repr(exc),
                "traceback": format_exc(),
            },
        )
        hip3_dexes = ()

    for dex in hip3_dexes:
        try:
            hip_payload: dict[str, object] = {"type": "metaAndAssetCtxs", "dex": dex}
            hip_body = await post_hl_info(hip_payload)
            hip_meta, hip_ctxs = _expect_meta_ctx_pair(hip_body)
            details[dex] = {"meta": hip_meta, "asset_ctxs": hip_ctxs}
        except Exception as exc:
            logger.error(
                "Failed to fetch metaAndAssetCtxs for HIP-3 dex; skipping dex",
                extra={
                    "subsystem": "HLFX",
                    "dex": dex,
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                    "traceback": format_exc(),
                },
            )

    return {"dex_info": dex_info, "dex_details": details}


async def fetch_meta_and_asset_ctx_by_dex() -> HlMetaCtxByDex:
    """Fetch ``perpDexs`` plus full ``metaAndAssetCtxs`` per dex."""
    return await fetch_raw_hl_meta_ctx_bundle()


async def fetch_all_dex_mark_snapshots(
    hip3_dex_names: tuple[str, ...],
) -> list[tuple[str, dict[str, float]]]:
    """Primary dex plus each HIP-3 dex: ``(dex_api_name, normalized_coin -> markPx)``."""
    out: list[tuple[str, dict[str, float]]] = []

    base_body = await post_hl_info({"type": "metaAndAssetCtxs"})
    base_meta, base_ctxs = _expect_meta_ctx_pair(base_body)
    out.append(
        (
            DEFAULT_PERP_DEX,
            mark_prices_from_dex_snapshot(
                dex_snapshot_from_wire(DEFAULT_PERP_DEX, base_meta, base_ctxs)
            ),
        )
    )

    for dex in hip3_dex_names:
        try:
            hip_body = await post_hl_info({"type": "metaAndAssetCtxs", "dex": dex})
            hip_meta, hip_ctxs = _expect_meta_ctx_pair(hip_body)
            out.append(
                (dex, mark_prices_from_dex_snapshot(dex_snapshot_from_wire(dex, hip_meta, hip_ctxs)))
            )
        except Exception as exc:
            logger.error(
                "Failed to poll mark prices for HIP-3 dex; skipping dex for this poll",
                extra={
                    "subsystem": "MARK",
                    "dex": dex,
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                    "traceback": format_exc(),
                },
            )

    return out


async def fetch_order_book(*, coin: str, sig_figs: int | None = None) -> CcxtL2Structure:
    """Fetch Hyperliquid ``l2Book``; retry up to three times with backoff."""
    stored_exc: None | Exception = None
    for trial in range(3):
        try:
            payload: dict[str, Any] = {
                "type": "l2Book",
                "coin": coin,
            }
            if sig_figs is not None:
                payload["nSigFigs"] = sig_figs

            raw_book = TypeAdapter(HyperliquidL2Return).validate_python(
                await post_hl_info(payload)
            )
            bid_items, ask_items = raw_book["levels"]

            bids = [(float(row["px"]), float(row["sz"])) for row in bid_items]
            asks = [(float(row["px"]), float(row["sz"])) for row in ask_items]

        except Exception as exc:
            stored_exc = exc
            logger.warning(
                "Hyperliquid order book fetch attempt failed",
                extra={
                    "subsystem": "L2OB",
                    "coin": coin,
                    "attempt": trial + 1,
                    "max_attempts": 3,
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                },
            )
            await sleep(3)

        else:
            return {"bids": bids, "asks": asks}

    msg = f"Failed to fetch Hyperliquid order book for coin={coin} after 3 attempts"
    logger.error(
        msg,
        extra={
            "subsystem": "L2OB",
            "coin": coin,
            "exc_type": type(stored_exc).__name__ if stored_exc else None,
            "error": repr(stored_exc) if stored_exc else None,
        },
    )
    raise RuntimeError(msg) from stored_exc


HlpOi: TypeAlias = dict[str, dict[str, float]]


async def fetch_hlp_oi() -> HlpOi:
    """Fetch non-zero signed position sizes per coin for each configured HLP address."""
    out: HlpOi = {}
    for address in HLP_ADDRESSES:
        try:
            st = TypeAdapter(ClearinghouseState).validate_python(
                await post_hl_info({"type": "clearinghouseState", "user": address})
            )
        except Exception as exc:
            logger.error(
                "Failed to fetch HLP OI for address; skipping address",
                extra={
                    "subsystem": "HLPO",
                    "address": address,
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                },
            )
            continue
        by_coin: dict[str, float] = {}
        for outer in st["assetPositions"]:
            pos = outer["position"]
            z = pos["szi"]
            c = pos["coin"]
            if c and float(z or 0) != 0:
                by_coin[c] = float(z)
        out[address] = by_coin
    return out
