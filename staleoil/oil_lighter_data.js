/**
 * Lighter (zklighter) WTI candles. Resolves market_id, fetches candles once on start.
 * Uses window.OIL_CANDLE_INTERVAL and window.OIL_CANDLE_LIMIT (default 400).
 */
(function () {
  "use strict";

  const LIGHTER_ORDERBOOK_URL = "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails";
  const LIGHTER_CANDLES_URL = "https://mainnet.zklighter.elliot.ai/api/v1/candles";

  const SERIES_ID = "lighter:WTI";
  const LABEL = "Lighter WTI";
  const COLOR = "#8b5cf6";

  function setStatus(id, text, klass) {
    const el = document.getElementById(id);
    if (!el) return;
    const span = el.querySelector("span") || el.appendChild(document.createElement("span"));
    span.textContent = text;
    if (klass) span.className = klass;
  }

  function setLastTick(ts) {
    const el = document.getElementById("lastTick");
    if (!el) return;
    const span = el.querySelector("span") || el.firstElementChild || el;
    span.textContent = new Date(ts).toLocaleTimeString();
    if (span.classList) span.classList.remove("status-warn");
    if (span.classList) span.classList.add("status-ok");
  }

  function barSeconds(resolution) {
    if (resolution === "1d") return 86400;
    if (resolution === "1w") return 86400 * 7;
    const m = resolution.match(/^(\d+)m$/);
    if (m) return parseInt(m[1], 10) * 60;
    const h = resolution.match(/^(\d+)h$/);
    if (h) return parseInt(h[1], 10) * 3600;
    return 900;
  }

  async function fetchJson(url, params) {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await fetch(url + q, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Lighter " + res.status);
    return res.json();
  }

  async function resolveMarketId() {
    const data = await fetchJson(LIGHTER_ORDERBOOK_URL);
    const details = data && data.order_book_details;
    if (!Array.isArray(details)) return null;
    for (const item of details) {
      const name = String(item.symbol || item.name || "").toUpperCase();
      if (name.indexOf("WTI") !== -1) {
        const mid = item.id ?? item.market_id ?? item.marketId;
        if (mid != null) return parseInt(mid, 10);
      }
    }
    return null;
  }

  function getResolution() { return window.OIL_CANDLE_INTERVAL || "5m"; }
  function getLimit() { return (typeof window.OIL_CANDLE_LIMIT === "number") ? window.OIL_CANDLE_LIMIT : 400; }

  async function fetchCandles(marketId) {
    const resolution = getResolution();
    const limit = getLimit();
    const barSec = barSeconds(resolution);
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - limit * barSec;
    const data = await fetchJson(LIGHTER_CANDLES_URL, {
      market_id: marketId,
      resolution: resolution,
      start_timestamp: startSec,
      end_timestamp: endSec,
      count_back: limit,
    });
    const rows = data && data.c;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const points = [];
    for (const r of rows) {
      const tRaw = r.t != null ? r.t : r.timestamp;
      const c = r.c != null ? r.c : r.close;
      if (tRaw == null || c == null) continue;
      const tMs = tRaw > 1e12 ? tRaw : tRaw * 1000;
      const v = r.v != null ? r.v : (r.volume != null ? r.volume : 0);
      const vol = typeof v === "number" ? v : parseFloat(v);
      points.push({ t: tMs, y: parseFloat(c), v: Number.isNaN(vol) ? 0 : vol });
    }
    points.sort((a, b) => a.t - b.t);
    return points;
  }

  async function refetch() {
    try {
      const marketId = await resolveMarketId();
      if (marketId == null) {
        setStatus("statusLighter", "no WTI market", "status-bad");
        return;
      }
      const points = await fetchCandles(marketId);
      if (typeof window.setOilSeriesData === "function") {
        window.setOilSeriesData(SERIES_ID, points);
      } else {
        for (const p of points) window.appendOilPoint(SERIES_ID, p.t, p.y);
      }
      if (points.length > 0) setLastTick(points[points.length - 1].t);
      setStatus("statusLighter", "connected", "status-ok");
    } catch (e) {
      console.warn("Lighter oil data", e);
      setStatus("statusLighter", "error", "status-bad");
    }
  }

  function run() {
    if (typeof window.registerOilSeries !== "function" || typeof window.appendOilPoint !== "function") {
      setTimeout(run, 50);
      return;
    }
    setStatus("statusLighter", "connecting…", "status-warn");
    window.registerOilSeries(SERIES_ID, LABEL, COLOR);
    refetch();
  }

  window.refetchLighterOil = refetch;
  run();
})();
