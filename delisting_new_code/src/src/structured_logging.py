"""Structured logging for delisting_calcs (stdlib ``logging`` + UTC + ``extra`` fields).

Avoid importing this module as ``logging`` (shadows stdlib). Prefer ``structured_logging``.

Call :func:`configure_logging` once at process entry (e.g. inside :func:`run_forever`).
Use ``logging.getLogger(__name__)`` and pass ``extra={{...}}`` for filterable context.
Do not put huge dicts or payloads in ``extra`` values (formatter uses ``repr()``).

@stalequant - 2026-05-09
"""

from __future__ import annotations

import logging
import sys
import time
from typing import Any
from typing import Final
from typing_extensions import override

LOGGER_NAME: Final = "delisting_calcs"

# Baseline keys on a fresh LogRecord (extras from ``extra=`` are merged into ``__dict__``).
_BASE_LR = logging.LogRecord(
    name="",
    level=logging.INFO,
    pathname="",
    lineno=0,
    msg="",
    args=(),
    exc_info=None,
)
# Formatter.format may add these before/after ``super().format``.
_SKIP_EXTRA_KEYS: Final[frozenset[str]] = frozenset(_BASE_LR.__dict__.keys()) | frozenset(
    {"message", "asctime"}
)


class StructuredFormatter(logging.Formatter):
    """Append ``key=value`` for caller-supplied ``extra`` fields (non-reserved names)."""

    converter: Any

    def __init__(self) -> None:
        """Wire UTC timestamps and attach :meth:`format` extras."""
        super().__init__(
            fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%SZ",
        )
        self.converter = time.gmtime  # type: ignore[attr-defined]

    @override
    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        pairs: list[str] = []
        for key in sorted(record.__dict__):
            if key in _SKIP_EXTRA_KEYS:
                continue
            if key.startswith("_"):
                continue
            pairs.append(f"{key}={record.__dict__[key]!r}")
        if pairs:
            return msg + " | " + " ".join(pairs)
        return msg


def _has_structured_handler(log: logging.Logger) -> bool:
    return any(isinstance(handler.formatter, StructuredFormatter) for handler in log.handlers)


def _attach_structured_handler(log: logging.Logger, level: int) -> None:
    log.setLevel(level)
    if _has_structured_handler(log):
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(level)
    handler.setFormatter(StructuredFormatter())
    log.addHandler(handler)
    log.propagate = False


def configure_logging(level: int = logging.INFO) -> None:
    """Attach stderr structured logging to the app logger namespaces (idempotent)."""
    _attach_structured_handler(logging.getLogger(LOGGER_NAME), level)
    _attach_structured_handler(logging.getLogger("src"), level)


def get_logger(name: str | None = None) -> logging.Logger:
    """Return the package logger or ``delisting_calcs.<suffix>``."""
    if name is None or name == LOGGER_NAME:
        return logging.getLogger(LOGGER_NAME)
    if name.startswith(f"{LOGGER_NAME}."):
        return logging.getLogger(name)
    return logging.getLogger(f"{LOGGER_NAME}.{name}")


__all__ = [
    "LOGGER_NAME",
    "StructuredFormatter",
    "configure_logging",
    "get_logger",
]
