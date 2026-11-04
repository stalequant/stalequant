"""Offline regression checks for the Ubuntu 26.04 / CPython 3.14 port."""

import argparse
import asyncio
import importlib
import json
import pkgutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import ccxt.pro
import src
from src.clients.hyperliquid import post_hl_info, validated_perp_dex_rows
from src.clients.market_sources import fetch_http_get_json
from src.http import close_http_client, get_http_client
from src.scoring.hip3_report import write_hip3_report
from src.scoring.report import write_report
from src.venues import REFERENCE_CCXT_SETUPS


class CompatibilityTests(unittest.TestCase):
    def test_import_all_modules_without_event_loop(self):
        # 3.14 no longer implicitly creates a loop for synchronous imports.
        for module in pkgutil.walk_packages(src.__path__, "src."):
            importlib.import_module(module.name)

    def test_typed_dict_validation(self):
        self.assertEqual(
            validated_perp_dex_rows([None, {"name": "xyz"}, 7]),
            [{"name": "xyz"}],
        )

    def test_reports_from_synthetic_recorder_files(self):
        now = round(time.time() * 1000)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def save(name, data):
                (root / name).write_text(json.dumps(data) + "\n", encoding="utf-8")

            details = {
                "meta": {"universe": [{"name": "BTC", "maxLeverage": 40}]},
                "asset_ctxs": [{
                    "markPx": "100000", "oraclePx": "100000",
                    "openInterest": "100", "dayNtlVlm": "2000000",
                }],
            }
            save("hl_raw_dex_meta_ctx.jsonl", {
                "recorded_at": now,
                "data": {"dex_info": [], "dex_details": {"": details}},
            })
            save("hlp_oi.jsonl", {
                "recorded_at": now, "data": {"0xsynthetic": {"BTC": 10}},
            })
            save("orderbook_depth.jsonl", {
                "recorded_at": now,
                "data": {"BTC": {
                    section: dict.fromkeys(
                        ("1k", "2.5k", "10k", "25k", "100k", "250k", "1m"),
                        spread,
                    )
                    for section, spread in (("spot", 2.0), ("fut", 3.0), ("hl", 4.0))
                }},
            })
            save("cmc_listings_latest.json", {
                "recorded_at": now,
                "data": [{"symbol": "BTC", "quote": {"USD": {
                    "market_cap": 1e12, "volume_24h": 1e9,
                    "fully_diluted_market_cap": 2e12,
                }}}],
            })
            save("coingecko_markets_usd.json", {
                "recorded_at": now,
                "data": [{"symbol": "btc", "market_cap": 1e12,
                          "total_volume": 1e9, "fully_diluted_valuation": 2e12}],
            })
            for venue, style in [
                ("binance", "spot"), ("binance", "futures"),
                ("hyperliquid", "futures"),
            ]:
                save(f"exch_candles_{venue}_{style}_1d.json", {
                    "recorded_at": now,
                    "data": {"BTC": {
                        "latest_candle_ts": now, "ntl_volume": 2e6,
                        "std": 0.02, "intra_day_range": 0.03,
                    }},
                })

            target = root / "reports" / "delisting.json"
            self.assertEqual(write_report(target, output_dir=root), target)
            rows = json.loads(target.read_text())["data"]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["Symbol"], "BTC")
            self.assertEqual(rows[0]["OI on HL $m"], 10)
            self.assertEqual(rows[0]["Spot Volume $m"], 2)
            target = root / "reports" / "hip3.json"
            write_hip3_report(target, output_dir=root)
            rows = json.loads(target.read_text())["data"]
            self.assertEqual(rows[0]["wire_symbol"], "BTC")
            self.assertEqual(rows[0]["open_interest_dollars"], 10_000_000)

    def test_uploader_dry_run_does_not_call_network(self):
        import github_push_hl_delisting_data as uploader
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "report.json"
            source.write_text('{"data": []}', encoding="utf-8")
            args = argparse.Namespace(dry_run=True, branch="main", message="test")
            with patch.object(uploader, "github_request") as request:
                uploader.upload_file(
                    args=args, source=source,
                    target="delisting_new/test.json", token=None,
                )
                request.assert_not_called()


class AsyncCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_http_client_lifecycle(self):
        client = get_http_client()
        self.assertIs(client, get_http_client())
        try:
            self.assertIsNotNone(client.connector)
        finally:
            await client.connector.cleanup()
            close_http_client()

    async def test_reference_exchange_constructors_and_cleanup(self):
        # Constructors must run inside the active 3.14 event loop.
        for name in {setup.venue_name.value for setup in REFERENCE_CCXT_SETUPS}:
            exchange = getattr(ccxt.pro, name)()
            await exchange.close()

    async def test_http_get_and_hyperliquid_post(self):
        response = AsyncMock()
        response.status_code = 200
        response.content.return_value = b'{"ok": true}'
        client = AsyncMock()
        client.request.return_value = response
        with patch("src.clients.market_sources.get_http_client", return_value=client):
            self.assertEqual(
                await fetch_http_get_json("https://example.com/data"), {"ok": True},
            )
        with patch("src.clients.hyperliquid.get_http_client", return_value=client):
            self.assertEqual(await post_hl_info({"type": "perpDexs"}), {"ok": True})
        self.assertEqual(client.request.await_count, 2)

    async def test_non_success_http_status_is_rejected(self):
        response = AsyncMock()
        response.status_code = 503
        response.content.return_value = b"unavailable"
        client = AsyncMock()
        client.request.return_value = response
        with patch("src.clients.market_sources.get_http_client", return_value=client):
            with self.assertRaises(ConnectionError):
                await fetch_http_get_json("https://example.com/data")


if __name__ == "__main__":
    unittest.main()
