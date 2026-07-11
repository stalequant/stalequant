"""JSONL writers for recorder snapshots.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import suppress
from json import dump
from json import dumps
from json import load
from json import loads
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..time_utils import utc_ms

DAY_MS = 24 * 60 * 60 * 1000
JSONL_RETENTION_BY_NAME_MS: dict[str, int] = {
    "liquidity_snapshots.jsonl": 7 * DAY_MS,
    "orderbook_depth.jsonl": 7 * DAY_MS,
    "hl_raw_dex_meta_ctx.jsonl": 30 * DAY_MS,
    "hlp_oi.jsonl": 30 * DAY_MS,
    "hl_mark_prices.jsonl": 30 * DAY_MS,
}
JSONL_PRUNE_INTERVAL_MS = DAY_MS
_LAST_JSONL_PRUNE_MS: dict[Path, int] = {}

__all__ = [
    "append_price_line",
    "append_raw_snapshot_jsonl",
    "wrapped_json_is_current",
    "write_wrapped_json",
]


def _prune_jsonl_older_than(output_path: Path, cutoff_ms: int) -> None:
    if not output_path.is_file():
        return

    tmp_path = output_path.with_name(f"{output_path.name}.{uuid4().hex}.tmp")
    kept_count = 0
    removed_count = 0
    with output_path.open(encoding="utf-8") as src, tmp_path.open("w", encoding="utf-8") as dst:
        for line in src:
            raw = line.strip()
            if not raw:
                continue
            try:
                recorded_at = int(loads(raw).get("recorded_at", cutoff_ms))
            except Exception:
                recorded_at = cutoff_ms
            if recorded_at >= cutoff_ms:
                _ = dst.write(line if line.endswith("\n") else f"{line}\n")
                kept_count += 1
            else:
                removed_count += 1

    if kept_count == 0 or removed_count == 0:
        tmp_path.unlink(missing_ok=True)
        return
    try:
        tmp_path.replace(output_path)
    except PermissionError:
        output_path.unlink(missing_ok=True)
        tmp_path.replace(output_path)


def _prune_jsonl_for_retention(output_path: Path, recorded_at_ms: int) -> None:
    retention_ms = JSONL_RETENTION_BY_NAME_MS.get(output_path.name)
    if retention_ms is None:
        return
    resolved_path = output_path.resolve()
    last_pruned_ms = _LAST_JSONL_PRUNE_MS.get(resolved_path)
    if last_pruned_ms is not None and recorded_at_ms - last_pruned_ms < JSONL_PRUNE_INTERVAL_MS:
        return
    _prune_jsonl_older_than(output_path, recorded_at_ms - retention_ms)
    _LAST_JSONL_PRUNE_MS[resolved_path] = recorded_at_ms


def append_raw_snapshot_jsonl(
    raw_data: dict[str, Any],
    output_path: Path,
    *,
    recorded_at_ms: int | None = None,
    now_ms: Callable[[], int] | None = None,
) -> None:
    """Append one timestamped record to a JSONL output path."""
    clock = now_ms if now_ms is not None else utc_ms
    record = {
        "recorded_at": recorded_at_ms if recorded_at_ms is not None else clock(),
        "data": raw_data,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("a", encoding="utf-8") as file_obj:
        _ = file_obj.write(dumps(record, separators=(",", ":"), allow_nan=True))
        _ = file_obj.write("\n")
    _prune_jsonl_for_retention(output_path, int(record["recorded_at"]))


def append_price_line(record: dict[str, Any], output_path: Path) -> None:
    """Append one price snapshot object (``ts``, ``dex``, ``prices`` only)."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("a", encoding="utf-8") as file_obj:
        _ = file_obj.write(dumps(record, separators=(",", ":"), allow_nan=True))
        _ = file_obj.write("\n")
    ts = record.get("ts")
    if isinstance(ts, int):
        _prune_jsonl_for_retention(output_path, ts)


def write_wrapped_json(
    path: Path,
    data: object,
    recorded_at_ms: int | None = None,
    *,
    now_ms: Callable[[], int] | None = None,
) -> Path:
    """Write wrapped JSON with ``recorded_at`` and ``data`` keys to ``path`` (parents created)."""
    clock = now_ms if now_ms is not None else utc_ms
    path.parent.mkdir(parents=True, exist_ok=True)
    wrapped: dict[str, Any] = {
        "recorded_at": recorded_at_ms if recorded_at_ms is not None else clock(),
        "data": data,
    }
    tmp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    with tmp_path.open("w", encoding="utf-8") as file_obj:
        dump(wrapped, file_obj)
    try:
        tmp_path.replace(path)
    except PermissionError:
        path.unlink(missing_ok=True)
        tmp_path.replace(path)
    return path


def wrapped_json_is_current(
    path: Path,
    max_age_ms: int,
    *,
    now_ms: Callable[[], int] | None = None,
) -> bool:
    """Return True when ``path`` exists and ``recorded_at`` is within ``max_age_ms``."""
    clock = now_ms if now_ms is not None else utc_ms
    with suppress(Exception), path.open(encoding="utf-8") as file_obj:
        wrapped = load(file_obj)
        recorded_at = int(wrapped["recorded_at"])
        return clock() < recorded_at + max_age_ms
    return False
