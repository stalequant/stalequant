"""Fetch third-party market/listing snapshots.

Providers:

- **CoinMarketCap** ``listings/latest`` (sync ``requests``, ``CMC_API_KEY``).
- **CoinCap** ``/v3/assets`` (async pages, ``COINCAP_API_KEY``).
- **CoinGecko** ``/coins/markets`` (USD, async pages, ``COINGECKO_API_KEY``).

Applies :data:`TOKEN_ALIASES` in :mod:`src.symbols` to each row's ``symbol``.

@stalequant - 2026-04-30
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from asyncio import sleep
from typing import Any, cast

import requests

from ..http import get_http_client

__all__ = [
    "fetch_cmc_listings_latest_rows",
    "fetch_coincap_assets_rows",
    "fetch_coingecko_markets_rows",
    "fetch_http_get_json",
]

# --- Helper functions --------------------------------------------------------

logger = logging.getLogger(__name__)


def _secret_from_env(env_name: str) -> str | None:
    """Return a non-empty API secret from the process environment."""
    return os.environ.get(env_name) or None


async def fetch_http_get_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
) -> object:
    """GET ``url`` and return decoded JSON; raises on non-2xx."""
    client = get_http_client()
    hdrs = dict(headers or {})

    async def request() -> tuple[object, bytes]:
        resp = await client.request(url=url, method="GET", headers=hdrs)
        content = await resp.content()
        return resp, content

    resp, content = await asyncio.wait_for(request(), timeout=20)

    status_code = int(getattr(resp, "status_code", 0))
    if status_code < 200 or status_code >= 300:  # noqa: PLR2004
        snippet = content[:500].decode("utf-8", errors="replace")
        msg = f"HTTP GET failed status={status_code} url={url} body_snippet={snippet!r}"
        logger.error(
            msg,
            extra={"subsystem": "WEBG", "http_status": status_code, "url": url},
        )
        raise ConnectionError(msg)

    return json.loads(content)


# --- CoinMarketCap -----------------------------------------------------------

_CMC_LISTINGS_URL = (
    "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest"
)


def fetch_cmc_listings_latest_rows(*, limit: int = 5000) -> list[dict[str, Any]]:
    """Fetch listings from CMC; raises if key missing or HTTP/API error."""
    api_key = _secret_from_env("CMC_API_KEY")
    if not api_key:
        msg = "Missing CoinMarketCap API key (CMC_API_KEY)"
        raise RuntimeError(msg)

    response = requests.get(
        _CMC_LISTINGS_URL,
        params={"CMC_PRO_API_KEY": api_key, "limit": limit},
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data")
    if not isinstance(data, list):
        msg = "CoinMarketCap response missing list field data"
        raise TypeError(msg)
    return cast("list[dict[str, Any]]", data)


# --- CoinCap -----------------------------------------------------------------

_COINCAP_ASSETS_BASE = "https://rest.coincap.io/v3/assets"
_COINCAP_LIMIT = 1000
_COINCAP_MAX_PAGES = 5
_COINCAP_PAGE_SLEEP_S = 0.35


def _coincap_assets_url(*, limit: int, offset: int) -> str:
    return f"{_COINCAP_ASSETS_BASE}?limit={limit}&offset={offset}"


async def fetch_coincap_assets_rows(
    *,
    max_pages: int = _COINCAP_MAX_PAGES,
    limit: int = _COINCAP_LIMIT,
    page_sleep_s: float = _COINCAP_PAGE_SLEEP_S,
) -> list[dict[str, Any]]:
    """Fetch paged assets; raises if env token is missing or response shape is wrong."""
    api_key = _secret_from_env("COINCAP_API_KEY")
    if not api_key:
        msg = "Missing CoinCap API token (COINCAP_API_KEY)"
        raise RuntimeError(msg)

    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    all_rows: list[dict[str, Any]] = []
    for page in range(max_pages):
        offset = page * limit
        url = _coincap_assets_url(limit=limit, offset=offset)
        payload = await fetch_http_get_json(url, headers=headers)
        if not isinstance(payload, dict):
            msg = f"CoinCap assets response is not an object (offset={offset})"
            raise TypeError(msg)
        obj = cast("dict[str, Any]", payload)
        raw_data = obj.get("data")
        if raw_data is None:
            msg = f"CoinCap assets response missing data (offset={offset})"
            raise TypeError(msg)
        if not isinstance(raw_data, list):
            msg = f"CoinCap assets data is not a list (offset={offset})"
            raise TypeError(msg)
        batch = cast("list[dict[str, Any]]", raw_data)
        logger.info(
            "CoinCap assets page",
            extra={
                "subsystem": "CCAP",
                "offset": offset,
                "row_count": len(batch),
            },
        )
        if batch:
            last = batch[-1]
            logger.debug(
                "CoinCap assets last row sample",
                extra={
                    "subsystem": "CCAP",
                    "offset": offset,
                    "last_id": last.get("id"),
                    "last_symbol": last.get("symbol"),
                },
            )
        all_rows.extend(batch)

        if not batch or len(batch) < limit:
            break
        if page < max_pages - 1:
            await sleep(page_sleep_s)

    return all_rows


# --- CoinGecko ---------------------------------------------------------------

_COINGECKO_MARKETS_BASE = "https://api.coingecko.com/api/v3/coins/markets"
_COINGECKO_PER_PAGE = 250
_COINGECKO_MAX_PAGES = 20
_COINGECKO_PAGE_SLEEP_S = 2.0


def _coingecko_markets_url(*, page: int, per_page: int) -> str:
    return f"{_COINGECKO_MARKETS_BASE}?vs_currency=usd&per_page={per_page}&page={page}"


async def fetch_coingecko_markets_rows(
    *,
    max_pages: int = _COINGECKO_MAX_PAGES,
    per_page: int = _COINGECKO_PER_PAGE,
    page_sleep_s: float = _COINGECKO_PAGE_SLEEP_S,
) -> list[dict[str, Any]]:
    """Fetch USD markets (paged). CoinGecko ``page`` is 1-based.

    Raises if the env API key is missing or HTTP/API returns non-list JSON.
    """
    api_key = _secret_from_env("COINGECKO_API_KEY")
    if not api_key:
        msg = "Missing CoinGecko API key (COINGECKO_API_KEY)"
        raise RuntimeError(msg)

    headers = {"x-cg-demo-api-key": api_key}
    all_rows: list[dict[str, Any]] = []

    for page in range(1, max_pages + 1):
        url = _coingecko_markets_url(page=page, per_page=per_page)
        payload = await fetch_http_get_json(url, headers=headers)
        if not isinstance(payload, list):
            msg = f"CoinGecko markets response is not a list (page={page})"
            raise TypeError(msg)
        batch = cast("list[dict[str, Any]]", payload)
        logger.info(
            "CoinGecko markets page",
            extra={
                "subsystem": "COGC",
                "page": page,
                "row_count": len(batch),
            },
        )
        all_rows.extend(batch)

        if page == max_pages or not batch or len(batch) < per_page:
            break
        await sleep(page_sleep_s)

    return all_rows
