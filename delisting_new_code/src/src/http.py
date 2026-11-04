"""Shared async HTTP client for delisting data outbound requests.

Single cached :func:`get_http_client` avoids spawning multiple ``HTTPClient``
instances across Hyperliquid and generic provider GETs.

@stalequant - 2026-04-30
"""

from __future__ import annotations

from functools import lru_cache

from aiosonic.client import HTTPClient

__all__ = ["close_http_client", "get_http_client"]


@lru_cache(maxsize=1)
def get_http_client() -> HTTPClient:
    """Return a shared HTTP client for API calls."""
    return HTTPClient()


def close_http_client() -> None:
    """Drop the cached client reference (tests / cooperative shutdown before exit).

    Does not await transport teardown; ``HTTPClient`` is released for GC.
    """
    get_http_client.cache_clear()
