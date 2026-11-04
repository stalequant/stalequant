"""HL universe snapshot and explicit recorder state (output dir + clock).

@stalequant - 2026-04-30
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from dataclasses import field
from pathlib import Path

from ..config import DATA_DIR as _DEFAULT_DATA_DIR
from ..time_utils import utc_ms as _default_utc_ms

__all__ = [
    "HlRuntimeSnapshot",
    "RecorderState",
    "apply_hl_runtime_refresh",
    "default_recorder_state",
]


@dataclass(frozen=True)
class HlRuntimeSnapshot:
    """HL REST universe snapshot from the last hourly (or launch) refresh."""

    dex_list_raw: object | None = None
    hip3_dex_names: tuple[str, ...] = ()
    hl_coins_normalized: frozenset[str] = field(default_factory=frozenset)
    hl_wire_symbols_by_normalized: dict[str, tuple[str, ...]] = field(default_factory=dict)


@dataclass
class RecorderState:
    """Explicit per-process recorder context (replaces module-level globals).

    Pass through async loops and refresh helpers so tests can inject ``output_dir``
    and a deterministic ``now_ms`` clock.
    """

    hl_runtime: HlRuntimeSnapshot
    output_dir: Path
    now_ms: Callable[[], int]


def default_recorder_state(
    *,
    output_dir: Path | None = None,
    now_ms: Callable[[], int] | None = None,
) -> RecorderState:
    """Build default recorder state using package ``DATA_DIR`` and :func:`~.time_utils.utc_ms`."""
    return RecorderState(
        hl_runtime=HlRuntimeSnapshot(),
        output_dir=output_dir if output_dir is not None else _DEFAULT_DATA_DIR,
        now_ms=now_ms if now_ms is not None else _default_utc_ms,
    )


def apply_hl_runtime_refresh(
    state: RecorderState,
    dex_list_raw: object | None,
    hip3_dex_names: tuple[str, ...],
    hl_coins_normalized: frozenset[str],
    hl_wire_symbols_by_normalized: dict[str, tuple[str, ...]] | None = None,
) -> None:
    """Replace ``state.hl_runtime`` after an hourly HL bundle fetch."""
    state.hl_runtime = HlRuntimeSnapshot(
        dex_list_raw=dex_list_raw,
        hip3_dex_names=hip3_dex_names,
        hl_coins_normalized=hl_coins_normalized,
        hl_wire_symbols_by_normalized=dict(hl_wire_symbols_by_normalized or {}),
    )
