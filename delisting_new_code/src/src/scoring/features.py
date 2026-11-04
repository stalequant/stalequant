"""Load recorder outputs and build merged numeric features for scoring.

@stalequant - 2026-05-09
"""

from __future__ import annotations

import json
import logging
import math
import time
from json import JSONDecodeError
from pathlib import Path
from typing import Any, cast

import numpy as np
import pandas as pd

from ..config import (
    CANDLE_PATH_PREFIX,
    cmc_listings_path,
    coingecko_markets_path,
    hl_raw_dex_meta_ctx_path,
    hl_raw_historic_hlp_oi_path,
    orderbook_depth_path,
)
from ..models.venues import VenueName
from ..symbols import clean_symbol
from .cutoffs import HL_PRIMARY_PERP_DEX_KEY, MIN_NON_HL_MARKET_CAP_USD, SCORE_EXCLUDED_SYMBOLS

logger = logging.getLogger(__name__)

__all__ = [
    "build_feature_table",
    "load_exchange_features",
    "load_historic_hlp_oi_features",
    "load_hl_latest_features",
    "load_orderbook_depth_features",
    "load_market_source_features",
    "sig_figs",
]

_CREDIBLE_VENUES_STR: frozenset[str] = frozenset(
    {
        VenueName.BINANCE.value,
        VenueName.BYBIT.value,
        VenueName.HYPERLIQUID.value,
        VenueName.OKX.value,
        VenueName.COINBASE.value,
        VenueName.KRAKEN.value,
    }
)

_ORACLE_SCORE_BY_VENUE_STR: dict[str, int] = {
    VenueName.BINANCE.value: 3,
    VenueName.OKX.value: 2,
    VenueName.BYBIT.value: 2,
    VenueName.KRAKEN.value: 1,
    VenueName.KUCOIN.value: 1,
    VenueName.GATE.value: 1,
    VenueName.MEXC.value: 1,
}

_MISSING_DEPTH_SPREAD_BP = 2000.0
_DEPTH_LEVELS = ("1k", "2.5k", "10k", "25k", "100k", "250k", "1m")
_MIDPOINT_DEPTH_LEVELS: dict[str, tuple[str, str]] = {
    "2.5k": ("1k", "10k"),
    "25k": ("10k", "100k"),
    "250k": ("100k", "1m"),
}
_ORDERBOOK_DEPTH_FEATURE_COLUMNS = [
    f"{prefix}_{level.replace('.', '_')}"
    for prefix in ("spot", "futures", "hl")
    for level in _DEPTH_LEVELS
]
_ORDERBOOK_DEPTH_MIN_RECORDED_AT_MS = 1_778_457_000_000


def sig_figs(number: float, sig_figs_n: int = 3) -> float | int:
    """Round positive values to a fixed number of significant digits (else 0)."""
    if np.isnan(number) or number <= 0:
        return 0
    return round(number, int(sig_figs_n - 1 - math.log10(number)))


def load_exchange_features(output_dir: Path) -> dict[str, dict[str, float]]:
    """Aggregate wrapped candle JSON files under ``output_dir`` into venue-level stats."""
    all_coin_data: dict[tuple[str, str, str], dict[str, Any]] = {}

    for path in output_dir.iterdir():
        if not path.is_file() or not path.name.startswith(f"{CANDLE_PATH_PREFIX}_"):
            continue
        try:
            raw_text = path.read_text(encoding="utf-8")
            if not raw_text.strip():
                logger.warning(
                    "Skipping empty exchange candle cache",
                    extra={"subsystem": "SCOR", "file_name": path.name, "path": str(path)},
                )
                continue
            exch_v = json.loads(raw_text)
        except (OSError, JSONDecodeError) as exc:
            logger.warning(
                "Skipping invalid exchange candle cache",
                extra={
                    "subsystem": "SCOR",
                    "file_name": path.name,
                    "path": str(path),
                    "exc_type": type(exc).__name__,
                    "error": repr(exc),
                },
            )
            continue
        if not isinstance(exch_v, dict) or not isinstance(exch_v.get("data"), dict):
            logger.warning(
                "Skipping malformed exchange candle cache",
                extra={"subsystem": "SCOR", "file_name": path.name, "path": str(path)},
            )
            continue
        parts = path.name.split("_")
        kind = parts[-2]
        venue = parts[-3]

        for symbol, symb_data in exch_v["data"].items():
            if (
                time.time() * 1000 - 3 * 24 * 60 * 60 * 1000
                > symb_data["latest_candle_ts"]
            ):
                continue
            all_coin_data[clean_symbol(symbol, venue), kind, venue] = symb_data

    df = pd.DataFrame(all_coin_data).T

    credible_notional_volume = (
        df.loc[df.index.get_level_values(2).isin(_CREDIBLE_VENUES_STR)]
        .groupby(level=[0, 1])
        .ntl_volume.sum()
        .unstack()
    )
    credible_notional_volume = credible_notional_volume.reindex(
        columns=["spot", "futures"],
        fill_value=0.0,
    )

    df["oracle_score"] = df.index.get_level_values(2).map(_ORACLE_SCORE_BY_VENUE_STR)

    return {
        "credible_spot_volume": credible_notional_volume.spot.to_dict(),
        "credible_futures_volume": credible_notional_volume.futures.to_dict(),
        "oracle_score": df.loc[df.index.get_level_values(1) == "spot"]
        .groupby(level=0)
        .oracle_score.sum()
        .to_dict(),
        "std": df.groupby(level=0)["std"].median().to_dict(),
        "intra_day_range": df.groupby(level=0)["intra_day_range"].median().to_dict(),
        "hl_volume": df.loc[df.index.get_level_values(2) == VenueName.HYPERLIQUID.value]
        .groupby(level=0)
        .ntl_volume.sum()
        .to_dict(),
    }


def load_hl_latest_features(meta_ctx_jsonl: Path) -> pd.DataFrame:
    """HL universe + per-asset context from latest recorder JSONL row (primary perp dex)."""
    if not meta_ctx_jsonl.is_file():
        msg = (
            f"Missing {meta_ctx_jsonl!r}; run the recorder hourly dump "
            "(e.g. python -m src) so this file exists."
        )
        raise FileNotFoundError(msg)
    nonempty_lines = [
        ln.strip()
        for ln in meta_ctx_jsonl.read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]
    if not nonempty_lines:
        msg = f"No JSONL rows in {meta_ctx_jsonl!r}"
        raise ValueError(msg)
    record = json.loads(nonempty_lines[-1])
    data_obj = record.get("data")
    if not isinstance(data_obj, dict):
        msg = "HL snapshot last line: invalid or missing data object"
        raise TypeError(msg)
    dex_details = data_obj.get("dex_details")
    if not isinstance(dex_details, dict):
        msg = "HL snapshot: dex_details missing or not an object"
        raise TypeError(msg)
    primary = dex_details.get(HL_PRIMARY_PERP_DEX_KEY)
    if not isinstance(primary, dict):
        msg = "HL snapshot: missing primary perp dex entry (empty string key)"
        raise KeyError(msg)
    meta = primary.get("meta")
    asset_ctxs = primary.get("asset_ctxs")
    if not isinstance(meta, dict):
        msg = "HL snapshot primary dex: meta is not an object"
        raise TypeError(msg)
    if not isinstance(asset_ctxs, list):
        msg = "HL snapshot primary dex: asset_ctxs is not a list"
        raise TypeError(msg)
    universe_obj = meta.get("universe")
    if not isinstance(universe_obj, list):
        msg = "HL snapshot meta: universe is not a list"
        raise TypeError(msg)

    merged_data = [
        cast("dict[str, Any]", u) | cast("dict[str, Any]", a)
        for u, a in zip(universe_obj, asset_ctxs, strict=True)
    ]
    output_df = pd.DataFrame(merged_data)
    if "isDelisted" in output_df.columns:
        delisted_mask = output_df["isDelisted"].eq(True)
        output_df = output_df.loc[~delisted_mask]
    output_df.index = [clean_symbol(str(a), "hyperliquid") for a in output_df.name]
    output_df["Max Lev. on HL"] = output_df["maxLeverage"]
    return output_df


def load_market_source_features(output_dir: Path) -> pd.DataFrame:
    """Merge CoinGecko / CMC wrapped JSON caches under ``output_dir``."""

    def max_if(d: dict[tuple[str, str], float], k: tuple[str, str], v: float) -> None:
        d[k] = max(d.get(k, 0.0), v or 0.0)

    cm = json.loads(cmc_listings_path(output_dir).read_text(encoding="utf-8"))
    cg = json.loads(coingecko_markets_path(output_dir).read_text(encoding="utf-8"))

    coin_entries: dict[str, dict[tuple[str, str], float]] = {}

    for cg_row in reversed(cg["data"]):
        entry = coin_entries.setdefault(clean_symbol(str(cg_row["symbol"])), {})
        max_if(entry, ("cg", "mc"), float(cg_row["market_cap"] or 0))
        max_if(entry, ("cg", "vol"), float(cg_row["total_volume"] or 0))
        max_if(entry, ("cg", "fdv"), float(cg_row["fully_diluted_valuation"] or 0))

    for cm_row in reversed(cm["data"]):
        entry = coin_entries.setdefault(clean_symbol(str(cm_row["symbol"])), {})
        quote_usd = cm_row["quote"]["USD"]
        max_if(entry, ("cm", "mc"), float(quote_usd["market_cap"] or 0))
        max_if(entry, ("cm", "vol"), float(quote_usd["volume_24h"] or 0))
        max_if(entry, ("cm", "fdv"), float(quote_usd["fully_diluted_market_cap"] or 0))

    return (
        pd.DataFrame(coin_entries)
        .groupby(level=1)
        .median()
        .T.sort_values("mc", ascending=False)
    )


def _depth_raw_level_value(section: Any, level: str) -> float | None:
    if not isinstance(section, dict):
        return None
    value = section.get(level)
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def _depth_level_value(section: Any, level: str) -> float | None:
    value = _depth_raw_level_value(section, level)
    if value is not None:
        return value

    midpoint_bounds = _MIDPOINT_DEPTH_LEVELS.get(level)
    if midpoint_bounds is not None:
        left = _depth_raw_level_value(section, midpoint_bounds[0])
        right = _depth_raw_level_value(section, midpoint_bounds[1])
        if left is not None and right is not None:
            if left > 0 and right > 0:
                return math.sqrt(left * right)
            return (left + right) / 2

    if level in {"10k", "100k"} and _depth_raw_level_value(section, "1k") is not None:
        return _MISSING_DEPTH_SPREAD_BP
    return None


def _depth_feature_key(prefix: str, level: str) -> str:
    return f"{prefix}_{level.replace('.', '_')}"


def _depth_feature_values(prefix: str, section: Any) -> dict[str, float | None]:
    return {
        _depth_feature_key(prefix, level): _depth_level_value(section, level)
        for level in _DEPTH_LEVELS
    }


def _depth_section_has_value(section: Any) -> bool:
    if not isinstance(section, dict):
        return False
    return any(_depth_raw_level_value(section, level) is not None for level in _DEPTH_LEVELS)


def load_orderbook_depth_features(snapshot_jsonl: Path) -> pd.DataFrame:
    """Nested orderbook depth JSONL -> median spot/futures/HL spread features."""
    logger.info("Loading orderbook depth snapshots", extra={"subsystem": "SCOR"})
    all_items: dict[tuple[str, Any], dict[str, float]] = {}
    with snapshot_jsonl.open(encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            snapshot = json.loads(raw)
            ts = snapshot["recorded_at"]
            if ts < _ORDERBOOK_DEPTH_MIN_RECORDED_AT_MS:
                continue
            data = snapshot.get("data")
            if not isinstance(data, dict):
                continue
            for coin_raw, depth_record in data.items():
                if not isinstance(coin_raw, str) or not isinstance(depth_record, dict):
                    continue
                sym = clean_symbol(coin_raw, VenueName.HYPERLIQUID)
                op: dict[str, float] = {}

                spot = depth_record.get("spot")
                if _depth_section_has_value(spot):
                    op |= _depth_feature_values("spot", spot)

                fut = depth_record.get("fut")
                if _depth_section_has_value(fut):
                    op |= _depth_feature_values("futures", fut)

                hl = depth_record.get("hl")
                if _depth_section_has_value(hl):
                    op |= _depth_feature_values("hl", hl)
                if op:
                    all_items[sym, ts] = op

    if not all_items:
        return pd.DataFrame(columns=_ORDERBOOK_DEPTH_FEATURE_COLUMNS)

    df = pd.DataFrame.from_dict(all_items, orient="index")
    return df.groupby(level=0).median()


def load_historic_hlp_oi_features(  # noqa: C901, PLR0912, PLR0915
    meta_ctx_jsonl: Path,
    hlp_oi_jsonl: Path,
) -> pd.DataFrame:
    """Historic HLP OI shares merged with HL mark/oracle OI from meta JSONL."""
    if not hlp_oi_jsonl.is_file():
        msg = f"Missing {hlp_oi_jsonl!r}"
        raise FileNotFoundError(msg)
    nonempty_lines = [
        ln.strip()
        for ln in hlp_oi_jsonl.read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]
    if not nonempty_lines:
        msg = f"No JSONL rows in {hlp_oi_jsonl!r}"
        raise ValueError(msg)
    hlpoi: dict[Any, dict[str, float]] = {}
    for line in nonempty_lines:
        record = json.loads(line)
        dd: dict[str, float] = {}
        for k, v in record["data"].items():
            if not str(k).startswith("0x"):
                continue
            for k2, v2 in v.items():
                sym = clean_symbol(str(k2), "hyperliquid")
                dd[sym] = dd.get(sym, 0.0) + abs(float(v2))
        if dd:
            hlpoi[record["recorded_at"]] = dd

    if not meta_ctx_jsonl.is_file():
        msg = (
            f"Missing {meta_ctx_jsonl!r}; run the recorder hourly dump "
            "(e.g. python -m src) so this file exists."
        )
        raise FileNotFoundError(msg)
    nonempty_meta = [
        ln.strip()
        for ln in meta_ctx_jsonl.read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]
    if not nonempty_meta:
        msg = f"No JSONL rows in {meta_ctx_jsonl!r}"
        raise ValueError(msg)
    hloi: dict[Any, dict[str, float]] = {}
    mp: dict[Any, dict[str, float]] = {}
    for line in nonempty_meta:
        record = json.loads(line)
        data_obj = record.get("data")
        if not isinstance(data_obj, dict):
            msg = "HL snapshot last line: invalid or missing data object"
            raise TypeError(msg)
        dex_details = data_obj.get("dex_details")
        if not isinstance(dex_details, dict):
            msg = "HL snapshot: dex_details missing or not an object"
            raise TypeError(msg)
        primary = dex_details.get(HL_PRIMARY_PERP_DEX_KEY)
        if not isinstance(primary, dict):
            msg = "HL snapshot: missing primary perp dex entry (empty string key)"
            raise KeyError(msg)
        meta = primary.get("meta")
        asset_ctxs = primary.get("asset_ctxs")
        if not isinstance(meta, dict):
            msg = "HL snapshot primary dex: meta is not an object"
            raise TypeError(msg)
        if not isinstance(asset_ctxs, list):
            msg = "HL snapshot primary dex: asset_ctxs is not a list"
            raise TypeError(msg)
        universe_obj = meta.get("universe")
        if not isinstance(universe_obj, list):
            msg = "HL snapshot meta: universe is not a list"
            raise TypeError(msg)
        merged_data = [
            cast("dict[str, Any]", u) | cast("dict[str, Any]", a)
            for u, a in zip(universe_obj, asset_ctxs, strict=True)
        ]
        mp[record["recorded_at"]] = {
            clean_symbol(str(k["name"]), "hyperliquid"): float(k["markPx"])
            for k in merged_data
        }
        hloi[record["recorded_at"]] = {
            clean_symbol(str(k["name"]), "hyperliquid"): float(k["openInterest"])
            for k in merged_data
        }

    q = pd.concat(
        {
            "oi": pd.DataFrame.from_dict(hloi, orient="index"),
            "mp": pd.DataFrame.from_dict(mp, orient="index"),
            "hlp": pd.DataFrame.from_dict(hlpoi, orient="index"),
        },
    )
    q = q.unstack(0)
    q = q.ffill(limit=1).bfill(limit=1)
    q = q.stack(future_stack=True).stack(future_stack=True).unstack(-2)
    df_h = (
        pd.concat({"oi_dollars": q["oi"] * q["mp"], "hlp_pct": q["hlp"] / q["oi"]})
        .unstack([0, 2])
        .median()
        .unstack(0)
    )
    df_h.index = [
        str(a)[1:] if isinstance(a, str) and len(a) > 1 and a[0] == "k" else a
        for a in df_h.index
    ]
    return df_h


def build_feature_table(output_dir: Path) -> pd.DataFrame:
    """Merge exchange stats, HL snapshot, listings, L2, and historic HLP features."""
    proc_ref = load_exchange_features(output_dir)
    proc_hl = load_hl_latest_features(hl_raw_dex_meta_ctx_path(output_dir))
    proc_cmc = load_market_source_features(output_dir)
    l2_snapshot = load_orderbook_depth_features(orderbook_depth_path(output_dir))
    historic_hlp = load_historic_hlp_oi_features(
        hl_raw_dex_meta_ctx_path(output_dir),
        hl_raw_historic_hlp_oi_path(output_dir),
    )

    processed_parts: list[pd.DataFrame] = [
        proc_cmc,
        pd.DataFrame(proc_ref),
        proc_hl,
        l2_snapshot,
        historic_hlp,
    ]
    df = pd.concat(processed_parts, axis=1)
    df = df.loc[~df.index.isin(SCORE_EXCLUDED_SYMBOLS)]
    active_hl_symbols = set(proc_hl.index)
    market_cap = pd.to_numeric(df.mc, errors="coerce").fillna(0.0)
    df = df.loc[df.index.isin(active_hl_symbols) | (market_cap >= MIN_NON_HL_MARKET_CAP_USD)]

    df["Symbol"] = df.index
    df["MC $m"] = df.mc / 1e6
    df["Spot Volume $m"] = df.credible_spot_volume / 1e6
    df["Fut Volume $m"] = df.credible_futures_volume / 1e6
    df["Oracle Score"] = df.oracle_score
    df["Spot Volatility (std)"] = df["std"]
    df["Spot Intraday range (std)"] = df.intra_day_range
    df["Spot Liquidity bp ($10k)"] = df.spot_10k
    df["Fut Liquidity bp ($100k)"] = df.futures_100k
    df["Volume on HL $m"] = df.hl_volume / 1e6
    df["OI on HL $m"] = df.oi_dollars / 1e6
    df["HLP OI Share %"] = df.hlp_pct
    df["HL Slip. $10k"] = df.hl_10k
    df["Max Lev. on HL"] = df["Max Lev. on HL"].fillna(0)

    return df
