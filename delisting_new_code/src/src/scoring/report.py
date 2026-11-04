"""Assemble raw feature JSON export.

Importing this module does not read files, touch CCXT, or open a browser.
Run :func:`main` (or ``python -m src.scoring.report``) to generate output.

@stalequant - 2026-05-09
"""

from __future__ import annotations

import datetime
import json
import time
from pathlib import Path
from traceback import format_exc
from typing import Any
from uuid import uuid4

import pandas as pd

from ..config import CANDLE_PATH_PREFIX
from ..config import DATA_DIR
from ..config import OUTPUT_DIR
from ..config import cmc_listings_path
from ..config import coincap_assets_path
from ..config import coingecko_markets_path
from ..config import hl_mark_prices_path
from ..config import hl_raw_dex_meta_ctx_path
from ..config import hl_raw_historic_hlp_oi_path
from ..config import orderbook_depth_path
from ..config import scoring_output_path
from ..config import web_scoring_output_path
from ..structured_logging import configure_logging
from ..structured_logging import get_logger
from .features import build_feature_table
from .features import sig_figs

__all__ = [
    "build_report",
    "build_report_meta",
    "main",
    "write_report",
]

logger = get_logger("scoring.report")


def _iso_from_ms(value: int | float | None) -> str | None:
    if value is None:
        return None
    return datetime.datetime.fromtimestamp(value / 1000, datetime.timezone.utc).isoformat()


def _safe_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _wrapped_json_summary(label: str, path: Path, now_ms: int) -> dict[str, Any]:
    wrapped = _safe_json(path)
    recorded_at = wrapped.get("recorded_at") if isinstance(wrapped, dict) else None
    data = wrapped.get("data") if isinstance(wrapped, dict) else None
    count = len(data) if isinstance(data, (dict, list)) else None
    age_ms = now_ms - int(recorded_at) if isinstance(recorded_at, int) else None
    return {
        "label": label,
        "file": path.name,
        "recorded_at_ms": recorded_at,
        "recorded_at_utc": _iso_from_ms(recorded_at),
        "age_hours": round(age_ms / (60 * 60 * 1000), 2) if age_ms is not None else None,
        "item_count": count,
    }


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


def _candle_cache_summary(output_dir: Path, now_ms: int) -> dict[str, Any]:
    summaries = [
        _wrapped_json_summary(path.stem.replace(f"{CANDLE_PATH_PREFIX}_", ""), path, now_ms)
        for path in sorted(output_dir.glob(f"{CANDLE_PATH_PREFIX}_*.json"))
    ]
    recorded = [item["recorded_at_ms"] for item in summaries if isinstance(item["recorded_at_ms"], int)]
    item_count = sum(item["item_count"] for item in summaries if isinstance(item["item_count"], int))
    oldest = min(recorded) if recorded else None
    latest = max(recorded) if recorded else None
    return {
        "label": "Exchange candle caches",
        "file_count": len(summaries),
        "item_count": item_count,
        "oldest_recorded_at_ms": oldest,
        "oldest_recorded_at_utc": _iso_from_ms(oldest),
        "latest_recorded_at_ms": latest,
        "latest_recorded_at_utc": _iso_from_ms(latest),
        "latest_age_hours": round((now_ms - latest) / (60 * 60 * 1000), 2) if latest is not None else None,
        "files": summaries,
    }


def _write_text_replace(path: Path, text: str) -> None:
    """Write text through a same-directory temp file, then replace the target."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    tmp_path.write_text(text, encoding="utf-8")
    try:
        tmp_path.replace(path)
    except PermissionError:
        path.unlink(missing_ok=True)
        tmp_path.replace(path)


def build_report_meta(output_dir: Path | None = None) -> dict[str, object]:
    """Small metadata block embedded next to table JSON."""
    root = output_dir if output_dir is not None else DATA_DIR
    now_ms = round(time.time() * 1000)
    return {
        "generated_at_ms": now_ms,
        "generated_at_utc": _iso_from_ms(now_ms),
        "time": datetime.datetime.fromtimestamp(now_ms / 1000, datetime.timezone.utc).date().isoformat(),
        "version": 1.3,
        "freshness": [
            _wrapped_json_summary("CMC listings", cmc_listings_path(root), now_ms),
            _wrapped_json_summary("CoinGecko markets", coingecko_markets_path(root), now_ms),
            _wrapped_json_summary("CoinCap assets", coincap_assets_path(root), now_ms),
            _candle_cache_summary(root, now_ms),
        ],
        "time_series": [
            _jsonl_summary("Hyperliquid meta/context", hl_raw_dex_meta_ctx_path(root)),
            _jsonl_summary("Order book depth", orderbook_depth_path(root)),
            _jsonl_summary("HLP open interest", hl_raw_historic_hlp_oi_path(root)),
            _jsonl_summary("Mark prices", hl_mark_prices_path(root), ts_key="ts"),
        ],
    }


def _apply_sig_figs_numeric(df: pd.DataFrame) -> None:
    for col in df.columns:
        if str(df[col].dtype) in ("int64", "float64"):
            df[col] = df[col].map(lambda x: sig_figs(float(x)) if not pd.isna(x) else x)


def build_report(output_dir: Path | None = None) -> dict[str, Any]:
    """Load raw features from disk under ``output_dir`` and build JSON-serializable payload."""
    root = output_dir if output_dir is not None else DATA_DIR
    raw_cols = [
        "Symbol",
        "Max Lev. on HL",
        "MC $m",
        "Spot Volume $m",
        "Spot Liquidity bp ($10k)",
        "Oracle Score",
        "Fut Volume $m",
        "Fut Liquidity bp ($100k)",
        "Volume on HL $m",
        "OI on HL $m",
        "HLP OI Share %",
        "HL Slip. $10k",
    ]
    df_display = build_feature_table(root)[raw_cols].copy()
    _apply_sig_figs_numeric(df_display)
    return {
        "data": df_display.to_dict(orient="records"),
        "meta": build_report_meta(root),
    }


def write_report(path: Path | None = None, *, output_dir: Path | None = None) -> Path:
    """Write :func:`build_report` JSON to ``path`` and publish the static site copy."""
    data_root = output_dir if output_dir is not None else DATA_DIR
    target = path if path is not None else scoring_output_path(OUTPUT_DIR)
    publish_static = path is None
    started_at = time.perf_counter()
    row_count = 0

    logger.info(
        "Starting delisting recommendation JSON generation",
        extra={
            "subsystem": "SCOR",
            "data_dir": str(data_root),
            "target": str(target),
            "publish_static": publish_static,
        },
    )
    try:
        payload = build_report(data_root)
        row_count = len(payload["data"]) if isinstance(payload.get("data"), list) else 0
        serialized = json.dumps(payload)

        _write_text_replace(target, serialized)
        _ = logger.info(
            "Delisting recommendation JSON written",
            extra={"subsystem": "SCOR", "path": str(target), "row_count": row_count},
        )

        if publish_static:
            web_target = web_scoring_output_path()
            _write_text_replace(web_target, serialized)
            _ = logger.info(
                "Static-site delisting recommendation JSON published",
                extra={"subsystem": "SCOR", "path": str(web_target), "row_count": row_count},
            )
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        logger.error(
            "Stopped delisting recommendation JSON generation after failure",
            extra={
                "subsystem": "SCOR",
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
            "Finished delisting recommendation JSON generation",
            extra={
                "subsystem": "SCOR",
                "target": str(target),
                "row_count": row_count,
                "elapsed_ms": elapsed_ms,
            },
        )
    return target


def main() -> None:
    """CLI entry: configure logging and write default recommendation JSON."""
    configure_logging()
    _ = write_report()


if __name__ == "__main__":
    main()
