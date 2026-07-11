"""Assemble HIP-3 asset JSON export for the static site."""

from __future__ import annotations

import datetime
import heapq
import json
import math
import statistics
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from traceback import format_exc
from typing import Any

import pandas as pd

from ..config import (
    DATA_DIR,
    OUTPUT_DIR,
    hip3_output_path,
    hl_mark_prices_path,
    hl_raw_dex_meta_ctx_path,
    orderbook_depth_path,
    web_hip3_output_path,
)
from ..models.venues import VenueName
from ..structured_logging import configure_logging, get_logger
from ..symbols import clean_symbol
from .report import _write_text_replace

__all__ = [
    "build_hip3_report",
    "main",
    "write_hip3_report",
]

logger = get_logger("scoring.hip3_report")

_DEPTH_LEVELS = ("1k", "2.5k", "10k", "25k", "100k", "250k", "1m")
_DEPTH_LEVEL_SIZES: tuple[tuple[str, float], ...] = (
    ("1k", 1_000.0),
    ("2.5k", 2_500.0),
    ("10k", 10_000.0),
    ("25k", 25_000.0),
    ("100k", 100_000.0),
    ("250k", 250_000.0),
    ("1m", 1_000_000.0),
)
_MIDPOINT_DEPTH_LEVELS: dict[str, tuple[str, str]] = {
    "2.5k": ("1k", "10k"),
    "25k": ("10k", "100k"),
    "250k": ("100k", "1m"),
}
_MISSING_DEPTH_SPREAD_BP = 2000.0
_OI_CAP_ACTIVE_OI_FLOOR = 100_000.0
_OI_IMPACT_FRACTION = 0.05
_MARK_MOVE_MIN_SAMPLES = 1_000
_MARK_MOVE_BUCKET_MS = 15_000
_MARK_MOVE_15M_BUCKETS = 60
_MARK_MOVE_TOP_VALUES = 2_048
_WEEKLY_15S_SAMPLE_COUNT = 7 * 24 * 60 * 60 // 15
_RATIO_GRADES = ("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F")


@dataclass(slots=True)
class _TopTailQuantile:
    """Bounded top-tail storage for high quantiles."""

    capacity: int = _MARK_MOVE_TOP_VALUES
    count: int = 0
    values: list[float] = field(default_factory=list)

    def add(self, value: float) -> None:
        self.count += 1
        if len(self.values) < self.capacity:
            heapq.heappush(self.values, value)
            return
        if value > self.values[0]:
            heapq.heapreplace(self.values, value)

    def quantile(self, quantile: float) -> float | None:
        if self.count == 0:
            return None
        position = (self.count - 1) * max(0.0, min(1.0, quantile))
        lower_index = math.floor(position)
        upper_index = math.ceil(position)
        first_top_index = self.count - len(self.values)
        if lower_index < first_top_index:
            logger.warning(
                "Mark-move quantile exceeded bounded top-tail storage",
                extra={
                    "subsystem": "HIP3",
                    "sample_count": self.count,
                    "stored_top_values": len(self.values),
                    "quantile": quantile,
                },
            )
            return None

        ordered_top = sorted(self.values)
        lower = ordered_top[lower_index - first_top_index]
        upper = ordered_top[upper_index - first_top_index]
        return lower + (upper - lower) * (position - lower_index)


@dataclass(slots=True)
class _MarkMoveState:
    """Streaming per-symbol 15-second bucket state."""

    current_bucket_ms: int | None = None
    current_price: float | None = None
    previous_bucket_ms: int | None = None
    previous_log_price: float | None = None
    recent_logs: deque[tuple[int, float]] = field(default_factory=deque)
    recent_logs_by_bucket: dict[int, float] = field(default_factory=dict)
    diffs_15s: _TopTailQuantile = field(default_factory=_TopTailQuantile)
    diffs_15m: _TopTailQuantile = field(default_factory=_TopTailQuantile)

    def observe(self, ts: int, price: float) -> None:
        bucket_ms = (ts // _MARK_MOVE_BUCKET_MS) * _MARK_MOVE_BUCKET_MS
        if self.current_bucket_ms is None:
            self.current_bucket_ms = bucket_ms
            self.current_price = price
            return
        if bucket_ms < self.current_bucket_ms:
            return
        if bucket_ms == self.current_bucket_ms:
            self.current_price = price
            return
        self.finalize_current_bucket()
        self.current_bucket_ms = bucket_ms
        self.current_price = price

    def finalize_current_bucket(self) -> None:
        if self.current_bucket_ms is None or self.current_price is None:
            return
        current_log_price = math.log(self.current_price)
        previous_bucket = self.current_bucket_ms - _MARK_MOVE_BUCKET_MS
        if (
            self.previous_bucket_ms == previous_bucket
            and self.previous_log_price is not None
        ):
            self.diffs_15s.add(abs(current_log_price - self.previous_log_price))

        target_bucket = self.current_bucket_ms - (
            _MARK_MOVE_15M_BUCKETS * _MARK_MOVE_BUCKET_MS
        )
        target_log_price = self.recent_logs_by_bucket.get(target_bucket)
        if target_log_price is not None:
            self.diffs_15m.add(abs(current_log_price - target_log_price))

        self.previous_bucket_ms = self.current_bucket_ms
        self.previous_log_price = current_log_price
        self.recent_logs.append((self.current_bucket_ms, current_log_price))
        self.recent_logs_by_bucket[self.current_bucket_ms] = current_log_price
        prune_before = self.current_bucket_ms - (
            _MARK_MOVE_15M_BUCKETS * _MARK_MOVE_BUCKET_MS
        )
        while self.recent_logs and self.recent_logs[0][0] < prune_before:
            bucket, _ = self.recent_logs.popleft()
            self.recent_logs_by_bucket.pop(bucket, None)


def _iso_from_ms(value: int | float | None) -> str | None:
    if value is None:
        return None
    return datetime.datetime.fromtimestamp(value / 1000, datetime.timezone.utc).isoformat()


def _to_float(value: object) -> float | None:
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _to_int(value: object) -> int | None:
    parsed = _to_float(value)
    return int(parsed) if parsed is not None else None


def _latest_jsonl_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        msg = f"Missing HIP-3 source snapshot: {path}"
        raise FileNotFoundError(msg)
    lines = [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not lines:
        msg = f"No rows in HIP-3 source snapshot: {path}"
        raise ValueError(msg)
    return json.loads(lines[-1])


def _jsonl_summary(label: str, path: Path, ts_key: str = "recorded_at") -> dict[str, Any]:
    oldest: int | None = None
    latest: int | None = None
    count = 0
    if path.is_file():
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                raw = line.strip()
                if not raw:
                    continue
                try:
                    record = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                ts = record.get(ts_key)
                if not isinstance(ts, int):
                    continue
                oldest = ts if oldest is None else min(oldest, ts)
                latest = ts if latest is None else max(latest, ts)
                count += 1
    return {
        "label": label,
        "file": path.name,
        "sample_count": count,
        "oldest_at_ms": oldest,
        "oldest_at_utc": _iso_from_ms(oldest),
        "latest_at_ms": latest,
        "latest_at_utc": _iso_from_ms(latest),
    }


def _pair_map(value: object) -> dict[str, float]:
    if not isinstance(value, list):
        return {}
    output: dict[str, float] = {}
    for item in value:
        if not isinstance(item, list | tuple) or len(item) < 2:
            continue
        key = item[0]
        parsed = _to_float(item[1])
        if isinstance(key, str) and parsed is not None:
            output[key] = parsed
    return output


def _depth_field(level: str) -> str:
    return f"hl_l2_{level.replace('.', '_')}_bp"


def _depth_raw_level_value(section: dict[str, object], level: str) -> float | None:
    return _to_float(section.get(level))


def _depth_level_value(section: object, level: str) -> float | None:
    if not isinstance(section, dict):
        return None
    parsed = _depth_raw_level_value(section, level)
    if parsed is not None:
        return round(parsed, 2)

    midpoint_bounds = _MIDPOINT_DEPTH_LEVELS.get(level)
    if midpoint_bounds is not None:
        left = _depth_raw_level_value(section, midpoint_bounds[0])
        right = _depth_raw_level_value(section, midpoint_bounds[1])
        if left is not None and right is not None:
            if left > 0 and right > 0:
                return round(math.sqrt(left * right), 2)
            return round((left + right) / 2, 2)

    if level in {"10k", "100k"} and _depth_raw_level_value(section, "1k") is not None:
        return _MISSING_DEPTH_SPREAD_BP
    return None


def _load_hl_l2_snapshots(path: Path) -> dict[str, dict[str, Any]]:
    """Return exact wire symbol -> median HL L2 spreads plus sample metadata."""
    samples: dict[str, dict[str, list[float] | int | None]] = {}
    if not path.is_file():
        return {}

    with path.open(encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError:
                continue
            ts = record.get("recorded_at")
            data = record.get("data")
            if not isinstance(ts, int) or not isinstance(data, dict):
                continue
            for wire_symbol, depth_record in data.items():
                if not isinstance(wire_symbol, str) or not isinstance(
                    depth_record, dict
                ):
                    continue
                hl = depth_record.get("hl")
                if not isinstance(hl, dict):
                    continue
                target = samples.setdefault(
                    wire_symbol,
                    {
                        "snapshot_count": 0,
                        "latest_recorded_at_ms": None,
                        **{_depth_field(level): [] for level in _DEPTH_LEVELS},
                    },
                )
                target["snapshot_count"] = int(target["snapshot_count"] or 0) + 1
                latest = target["latest_recorded_at_ms"]
                target["latest_recorded_at_ms"] = (
                    ts if latest is None else max(int(latest), ts)
                )
                for level in _DEPTH_LEVELS:
                    value = _depth_level_value(hl, level)
                    if value is not None:
                        cast_list = target[_depth_field(level)]
                        if isinstance(cast_list, list):
                            cast_list.append(value)

    output: dict[str, dict[str, Any]] = {}
    for wire_symbol, values in samples.items():
        row: dict[str, Any] = {
            "l2_snapshot_count": values["snapshot_count"],
            "l2_latest_recorded_at_ms": values["latest_recorded_at_ms"],
            "l2_latest_recorded_at_utc": _iso_from_ms(
                int(values["latest_recorded_at_ms"])
                if values["latest_recorded_at_ms"] is not None
                else None
            ),
        }
        previous_depth_bp: float | None = None
        for level in _DEPTH_LEVELS:
            level_values = values[_depth_field(level)]
            depth_bp = (
                round(statistics.median(level_values), 2)
                if isinstance(level_values, list) and level_values
                else None
            )
            if (
                depth_bp is not None
                and previous_depth_bp is not None
                and depth_bp < previous_depth_bp
            ):
                depth_bp = previous_depth_bp
            row[_depth_field(level)] = depth_bp
            if depth_bp is not None:
                previous_depth_bp = depth_bp
        output[wire_symbol] = row
    return output


def _mark_move_quantile(diffs: _TopTailQuantile, quantile: float) -> float | None:
    raw_value = diffs.quantile(quantile)
    if raw_value is None:
        return None
    return round(raw_value * 10_000, 2) if raw_value == raw_value else None


def _load_hl_mark_move_quantiles(path: Path) -> dict[str, dict[str, float | None]]:
    """Return exact wire symbol -> mark move quantiles from streamed HL mark prices."""
    states_by_coin: dict[str, _MarkMoveState] = {}
    if not path.is_file():
        return {}

    with path.open(encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError:
                continue
            ts = record.get("ts")
            prices = record.get("prices")
            if not isinstance(ts, int) or not isinstance(prices, dict):
                continue
            for coin, value in prices.items():
                parsed = _to_float(value)
                if isinstance(coin, str) and parsed is not None and parsed > 0:
                    state = states_by_coin.setdefault(coin, _MarkMoveState())
                    state.observe(ts, parsed)

    for state in states_by_coin.values():
        state.finalize_current_bucket()

    output: dict[str, dict[str, float | None]] = {}
    quantile_15s = 1 - 1 / _WEEKLY_15S_SAMPLE_COUNT
    quantile_15m = 1 - _MARK_MOVE_15M_BUCKETS / _WEEKLY_15S_SAMPLE_COUNT
    for coin, state in states_by_coin.items():
        if state.diffs_15s.count < 3:
            continue
        if (
            state.diffs_15s.count < _MARK_MOVE_MIN_SAMPLES
            or state.diffs_15m.count < _MARK_MOVE_MIN_SAMPLES
        ):
            output[coin] = {
                "weekly_15s_index_dev": None,
                "weekly_15m_index_dev": None,
            }
            continue
        output[coin] = {
            "weekly_15s_index_dev": _mark_move_quantile(state.diffs_15s, quantile_15s),
            "weekly_15m_index_dev": _mark_move_quantile(state.diffs_15m, quantile_15m),
        }
    return output


def _impact_mid_premium_bp(ctx: dict[str, Any]) -> float | None:
    oracle = _to_float(ctx.get("oraclePx"))
    impact_pxs = ctx.get("impactPxs")
    if oracle is None or oracle <= 0 or not isinstance(impact_pxs, list | tuple) or len(impact_pxs) < 2:
        return None
    impact_bid = _to_float(impact_pxs[0])
    impact_ask = _to_float(impact_pxs[1])
    if impact_bid is None or impact_ask is None or impact_bid <= 0 or impact_ask <= 0:
        return None
    impact_mid = (impact_bid + impact_ask) / 2
    return abs(impact_mid / oracle - 1) * 10_000


def _load_hl_impact_premium_averages(path: Path) -> dict[str, dict[str, float]]:
    """Return exact wire symbol -> average abs(impact mid / oracle - 1), in bp."""
    samples: dict[str, list[float]] = {}
    if not path.is_file():
        return {}

    with path.open(encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError:
                continue
            data = record.get("data")
            if not isinstance(data, dict):
                continue
            dex_details = data.get("dex_details")
            if not isinstance(dex_details, dict):
                continue
            for detail in dex_details.values():
                if not isinstance(detail, dict):
                    continue
                meta = detail.get("meta")
                ctxs = detail.get("asset_ctxs")
                if not isinstance(meta, dict) or not isinstance(ctxs, list):
                    continue
                universe = meta.get("universe")
                if not isinstance(universe, list):
                    continue
                for asset, ctx in zip(universe, ctxs, strict=False):
                    if not isinstance(asset, dict) or not isinstance(ctx, dict):
                        continue
                    if asset.get("isDelisted") is True or ctx.get("isDelisted") is True:
                        continue
                    wire_symbol = asset.get("name")
                    if not isinstance(wire_symbol, str):
                        continue
                    premium_bp = _impact_mid_premium_bp(ctx)
                    if premium_bp is not None:
                        samples.setdefault(wire_symbol, []).append(premium_bp)

    return {
        wire_symbol: {"avg_abs_impact_premium_bp": round(statistics.fmean(values), 2)}
        for wire_symbol, values in samples.items()
        if values
    }


def _filled_depth_points(row: dict[str, Any]) -> list[tuple[float, float]]:
    output: list[tuple[float, float]] = []
    previous: float | None = None
    for level, size in _DEPTH_LEVEL_SIZES:
        value = _to_float(row.get(_depth_field(level)))
        if value is None and previous is not None:
            value = min(_MISSING_DEPTH_SPREAD_BP, previous * 4)
        if value is not None:
            value = round(value, 2)
            output.append((size, value))
            previous = value
    return output


def _exp_interpolate(
    x0: float, y0: float, x1: float, y1: float, target: float
) -> float:
    if y0 <= 0 or y1 <= 0 or x0 <= 0 or x1 <= 0:
        ratio = (target - x0) / (x1 - x0)
        return y0 + ratio * (y1 - y0)
    ratio = math.log(target / x0) / math.log(x1 / x0)
    return math.exp(math.log(y0) + ratio * (math.log(y1) - math.log(y0)))


def _l2_impact_for_notional_bp(
    row: dict[str, Any], notional: float | None
) -> float | None:
    if notional is None or notional <= 0:
        return None
    points = _filled_depth_points(row)
    if not points:
        return None
    if notional <= points[0][0]:
        return points[0][1]

    for (left_size, left_bp), (right_size, right_bp) in zip(
        points, points[1:], strict=False
    ):
        if left_size <= notional <= right_size:
            return round(
                min(
                    _MISSING_DEPTH_SPREAD_BP,
                    _exp_interpolate(
                        left_size, left_bp, right_size, right_bp, notional
                    ),
                ),
                2,
            )

    last_size, last_bp = points[-1]
    if notional <= last_size:
        return last_bp
    if last_bp <= 0:
        return last_bp
    decades = math.log10(notional / last_size)
    return round(min(_MISSING_DEPTH_SPREAD_BP, last_bp * (4**decades)), 2)


def _oi_cap_to_oi_grade(ratio: float | None) -> str | None:
    if ratio is None or ratio <= 0:
        return None
    if ratio <= 3:
        return "A+"
    if ratio >= 100:
        return "F"
    position = math.log(ratio / 3) / math.log(100 / 3)
    idx = min(
        len(_RATIO_GRADES) - 1, max(0, math.ceil(position * (len(_RATIO_GRADES) - 1)))
    )
    return _RATIO_GRADES[idx]


def _score_fields(row: dict[str, Any]) -> dict[str, Any]:
    max_leverage = _to_float(row.get("max_leverage"))
    mark_15s = _to_float(row.get("weekly_15s_index_dev"))
    mark_15m = _to_float(row.get("weekly_15m_index_dev"))
    impact_premium = _to_float(row.get("avg_abs_impact_premium_bp"))
    open_interest_dollars = _to_float(row.get("open_interest_dollars"))
    streaming_oi_cap = _to_float(row.get("streaming_oi_cap"))
    active_oi_for_cap_ratio = (
        open_interest_dollars + _OI_CAP_ACTIVE_OI_FLOOR
        if open_interest_dollars is not None
        else None
    )
    oi_cap_to_oi = (
        streaming_oi_cap / active_oi_for_cap_ratio
        if streaming_oi_cap is not None
        and active_oi_for_cap_ratio is not None
        and active_oi_for_cap_ratio > 0
        else None
    )
    impact_notional = (
        open_interest_dollars * _OI_IMPACT_FRACTION
        if open_interest_dollars is not None
        else None
    )
    impact_bp = _l2_impact_for_notional_bp(row, impact_notional)
    margin_cov_15s = (
        round((1 / max_leverage / 2 * 10_000) / mark_15s, 2)
        if max_leverage is not None
        and max_leverage > 0
        and mark_15s is not None
        and mark_15s > 0
        else None
    )
    margin_cov_15m = (
        round((1 / max_leverage / 2 * 10_000) / mark_15m, 2)
        if max_leverage is not None
        and max_leverage > 0
        and mark_15m is not None
        and mark_15m > 0
        else None
    )
    margin_cov_impact_premium = (
        round((1 / max_leverage / 2 * 10_000) / impact_premium, 2)
        if max_leverage is not None
        and max_leverage > 0
        and impact_premium is not None
        and impact_premium > 0
        else None
    )
    oi_cap_to_oi_grade = _oi_cap_to_oi_grade(oi_cap_to_oi)
    return {
        "score_margin_cov_15s_jump": (margin_cov_15s),
        "score_margin_cov_15m_jump": (margin_cov_15m),
        "score_margin_cov_impact_premium": (margin_cov_impact_premium),
        "score_impact_5pct_oi_notional": (
            round(impact_notional, 2) if impact_notional is not None else None
        ),
        "score_impact_5pct_oi_bp": round(impact_bp) if impact_bp is not None else None,
        "score_oi_cap_active_oi_floor": _OI_CAP_ACTIVE_OI_FLOOR,
        "score_oi_cap_to_oi": (
            round(oi_cap_to_oi, 4) if oi_cap_to_oi is not None else None
        ),
        "score_oi_cap_to_oi_grade": oi_cap_to_oi_grade,
    }


def _dex_info_by_name(dex_info: object) -> dict[str, dict[str, Any]]:
    if not isinstance(dex_info, list):
        return {}
    return {
        row["name"]: row
        for row in dex_info
        if isinstance(row, dict) and isinstance(row.get("name"), str) and row["name"]
    }


def _asset_label(dex: str, wire_name: str) -> str:
    prefix = f"{dex}:"
    return wire_name[len(prefix) :] if wire_name.startswith(prefix) else wire_name


def _dex_label(dex: str) -> str:
    return dex if dex else "main"


def _dex_full_name(dex: str, info: dict[str, Any]) -> str:
    full_name = info.get("fullName")
    if isinstance(full_name, str):
        return full_name
    return "Hyperliquid Main" if not dex else dex


def _margin_mode_label(asset: dict[str, Any]) -> str:
    margin_mode = asset.get("marginMode")
    only_isolated = asset.get("onlyIsolated")
    if margin_mode == "strictIsolated":
        return "strict isolated"
    if margin_mode == "noCross" or only_isolated is True:
        return "isolated"
    return "cross"


def _feature_lookup_keys(dex: str, wire_symbol: str) -> tuple[str, ...]:
    """Return candidate feature keys for exact wire symbols and main-dex HL aliases."""
    keys = [wire_symbol]
    if not dex:
        normalized = clean_symbol(wire_symbol, VenueName.HYPERLIQUID)
        if normalized not in keys:
            keys.append(normalized)
    return tuple(keys)


def _lookup_features(
    features_by_symbol: dict[str, dict[str, Any]], dex: str, wire_symbol: str
) -> dict[str, Any]:
    """Look up exact HIP-3 symbols, with main-dex k-token fallback to normalized keys."""
    for key in _feature_lookup_keys(dex, wire_symbol):
        row = features_by_symbol.get(key)
        if row:
            return row
    return {}


def _asset_rows(
    record: dict[str, Any],
    l2_by_wire_symbol: dict[str, dict[str, Any]],
    mark_moves_by_wire_symbol: dict[str, dict[str, float | None]],
    impact_premium_by_wire_symbol: dict[str, dict[str, float]],
) -> list[dict[str, Any]]:
    data = record.get("data")
    if not isinstance(data, dict):
        return []
    dex_details = data.get("dex_details")
    if not isinstance(dex_details, dict):
        return []

    dex_info = _dex_info_by_name(data.get("dex_info"))
    rows: list[dict[str, Any]] = []
    for dex, detail in sorted(dex_details.items()):
        if not isinstance(detail, dict):
            continue
        meta = detail.get("meta")
        ctxs = detail.get("asset_ctxs")
        if not isinstance(meta, dict) or not isinstance(ctxs, list):
            continue
        universe = meta.get("universe")
        if not isinstance(universe, list):
            continue

        info = dex_info.get(dex, {})
        oi_caps = _pair_map(info.get("assetToStreamingOiCap"))
        funding_multipliers = _pair_map(info.get("assetToFundingMultiplier"))
        funding_rates = _pair_map(info.get("assetToFundingInterestRate"))

        for asset, ctx in zip(universe, ctxs, strict=False):
            if not isinstance(asset, dict) or not isinstance(ctx, dict):
                continue
            if asset.get("isDelisted") is True:
                continue
            wire_symbol = asset.get("name")
            if not isinstance(wire_symbol, str):
                continue

            mark = _to_float(ctx.get("markPx"))
            oracle = _to_float(ctx.get("oraclePx"))
            mid = _to_float(ctx.get("midPx"))
            open_interest = _to_float(ctx.get("openInterest"))
            price_for_oi = (
                mark if mark is not None else oracle if oracle is not None else mid
            )
            oi_dollars = (
                round(open_interest * price_for_oi, 2)
                if open_interest is not None and price_for_oi is not None
                else None
            )
            row = {
                "dex": _dex_label(dex),
                "dex_raw": dex,
                "dex_full_name": _dex_full_name(dex, info),
                "symbol": _asset_label(dex, wire_symbol),
                "wire_symbol": wire_symbol,
                "max_leverage": _to_int(asset.get("maxLeverage")),
                "margin_mode": _margin_mode_label(asset),
                "margin_mode_raw": asset.get("marginMode"),
                "only_isolated": asset.get("onlyIsolated") is True,
                "margin_table_id": _to_int(asset.get("marginTableId")),
                "growth_mode": asset.get("growthMode"),
                "last_growth_mode_change_time": asset.get("lastGrowthModeChangeTime"),
                "sz_decimals": _to_int(asset.get("szDecimals")),
                "mark_px": mark,
                "oracle_px": oracle,
                "mid_px": mid,
                "prev_day_px": _to_float(ctx.get("prevDayPx")),
                "funding": _to_float(ctx.get("funding")),
                "premium": _to_float(ctx.get("premium")),
                "open_interest": open_interest,
                "open_interest_dollars": oi_dollars,
                "day_base_volume": _to_float(ctx.get("dayBaseVlm")),
                "day_notional_volume": _to_float(ctx.get("dayNtlVlm")),
                "streaming_oi_cap": oi_caps.get(wire_symbol),
                "funding_multiplier": funding_multipliers.get(wire_symbol),
                "funding_interest_rate": funding_rates.get(wire_symbol),
                "deployer": info.get("deployer"),
                "oracle_updater": info.get("oracleUpdater"),
                "fee_recipient": info.get("feeRecipient"),
                **_lookup_features(l2_by_wire_symbol, dex, wire_symbol),
                **_lookup_features(mark_moves_by_wire_symbol, dex, wire_symbol),
                **_lookup_features(impact_premium_by_wire_symbol, dex, wire_symbol),
            }
            row |= _score_fields(row)
            rows.append(row)

    return sorted(
        rows,
        key=lambda row: (row["dex"], -(row["day_notional_volume"] or 0), row["symbol"]),
    )


def _dex_summaries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        dex = str(row["dex"])
        current = grouped.setdefault(
            dex,
            {
                "dex": dex,
                "dex_full_name": row.get("dex_full_name"),
                "asset_count": 0,
                "day_notional_volume": 0.0,
                "open_interest_dollars": 0.0,
            },
        )
        current["asset_count"] += 1
        current["day_notional_volume"] += row.get("day_notional_volume") or 0.0
        current["open_interest_dollars"] += row.get("open_interest_dollars") or 0.0

    return sorted(
        (
            {
                **item,
                "day_notional_volume": round(float(item["day_notional_volume"]), 2),
                "open_interest_dollars": round(float(item["open_interest_dollars"]), 2),
            }
            for item in grouped.values()
        ),
        key=lambda item: item["day_notional_volume"],
        reverse=True,
    )


def build_hip3_report(output_dir: Path | None = None) -> dict[str, Any]:
    """Build JSON-serializable HL dex asset data from the latest HL snapshot."""
    root = output_dir if output_dir is not None else DATA_DIR
    source_path = hl_raw_dex_meta_ctx_path(root)
    record = _latest_jsonl_record(source_path)
    l2_by_wire_symbol = _load_hl_l2_snapshots(orderbook_depth_path(root))
    mark_moves_by_wire_symbol = _load_hl_mark_move_quantiles(
        hl_mark_prices_path(root)
    )
    impact_premium_by_wire_symbol = _load_hl_impact_premium_averages(source_path)
    rows = _asset_rows(
        record,
        l2_by_wire_symbol,
        mark_moves_by_wire_symbol,
        impact_premium_by_wire_symbol,
    )
    now_ms = round(time.time() * 1000)
    snapshot_at = record.get("recorded_at")
    return {
        "data": rows,
        "dexes": _dex_summaries(rows),
        "meta": {
            "generated_at_ms": now_ms,
            "generated_at_utc": _iso_from_ms(now_ms),
            "snapshot_recorded_at_ms": (
                snapshot_at if isinstance(snapshot_at, int) else None
            ),
            "snapshot_recorded_at_utc": _iso_from_ms(
                snapshot_at if isinstance(snapshot_at, int) else None
            ),
            "source_file": source_path.name,
            "asset_count": len(rows),
            "main_dex_asset_count": sum(1 for row in rows if row.get("dex_raw") == ""),
            "hip3_asset_count": sum(1 for row in rows if row.get("dex_raw") != ""),
            "dex_count": len({row["dex"] for row in rows}),
            "l2_asset_count": sum(1 for row in rows if row.get("l2_snapshot_count")),
            "l2_source_file": orderbook_depth_path(root).name,
            "mark_move_asset_count": sum(
                1
                for row in rows
                if row.get("weekly_15s_index_dev") is not None
                or row.get("weekly_15m_index_dev") is not None
            ),
            "mark_source_file": hl_mark_prices_path(root).name,
            "time_series": [
                _jsonl_summary("HL dex meta/context", source_path),
                _jsonl_summary("Order book depth", orderbook_depth_path(root)),
                _jsonl_summary("Mark prices", hl_mark_prices_path(root), ts_key="ts"),
            ],
            "version": 1.3,
        },
    }


def write_hip3_report(
    path: Path | None = None, *, output_dir: Path | None = None
) -> Path:
    """Write HIP-3 JSON and publish the static site copy."""
    data_root = output_dir if output_dir is not None else DATA_DIR
    target = path if path is not None else hip3_output_path(OUTPUT_DIR)
    publish_static = path is None
    started_at = time.perf_counter()
    row_count = 0

    logger.info(
        "Starting HIP-3 asset JSON generation",
        extra={
            "subsystem": "HIP3",
            "data_dir": str(data_root),
            "target": str(target),
            "publish_static": publish_static,
        },
    )
    try:
        payload = build_hip3_report(data_root)
        row_count = len(payload["data"]) if isinstance(payload.get("data"), list) else 0
        serialized = json.dumps(payload, separators=(",", ":"), allow_nan=False)
        _write_text_replace(target, serialized)
        logger.info(
            "HIP-3 asset JSON written",
            extra={"subsystem": "HIP3", "path": str(target), "row_count": row_count},
        )

        if publish_static:
            web_target = web_hip3_output_path()
            _write_text_replace(web_target, serialized)
            logger.info(
                "Static-site HIP-3 asset JSON published",
                extra={
                    "subsystem": "HIP3",
                    "path": str(web_target),
                    "row_count": row_count,
                },
            )
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        logger.error(
            "Stopped HIP-3 asset JSON generation after failure",
            extra={
                "subsystem": "HIP3",
                "data_dir": str(data_root),
                "target": str(target),
                "row_count": row_count,
                "elapsed_ms": elapsed_ms,
                "exc_type": type(exc).__name__,
                "error": repr(exc),
                "traceback": format_exc(),
            },
        )
        raise
    else:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        logger.info(
            "Finished HIP-3 asset JSON generation",
            extra={
                "subsystem": "HIP3",
                "target": str(target),
                "row_count": row_count,
                "elapsed_ms": elapsed_ms,
            },
        )
    return target


def main() -> None:
    """CLI entry: configure logging and write default HIP-3 JSON."""
    configure_logging()
    _ = write_hip3_report()


if __name__ == "__main__":
    main()
