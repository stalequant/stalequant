/**
 * Aster DEX CLUSDT futures klines. Fetches candles once on start.
 * Uses window.OIL_CANDLE_INTERVAL and window.OIL_CANDLE_LIMIT (default 400).
 */
(function () {
  "use strict";

  const ASTER_KLINES_URL = "https://fapi.asterdex.com/fapi/v1/klines";
  const SYMBOL = "CLUSDT";

  const SERIES_ID = "aster:CLUSDT";
  const LABEL = "Aster CLUSDT";
  const COLOR = "#f59e0b";

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

  function getInterval() { return window.OIL_CANDLE_INTERVAL || "5m"; }
  function getLimit() { return (typeof window.OIL_CANDLE_LIMIT === "number") ? window.OIL_CANDLE_LIMIT : 400; }

  async function fetchKlines() {
    const params = new URLSearchParams({ symbol: SYMBOL, interval: getInterval(), limit: String(getLimit()) });
    const res = await fetch(ASTER_KLINES_URL + "?" + params.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Aster " + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    const points = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const tMs = parseInt(row[0], 10);
      const close = parseFloat(row[4]);
      const vol = row.length > 5 ? parseFloat(row[5]) : 0;
      if (!Number.isNaN(tMs) && !Number.isNaN(close)) points.push({ t: tMs, y: close, v: Number.isNaN(vol) ? 0 : vol });
    }
    points.sort((a, b) => a.t - b.t);
    return points;
  }

  async function refetch() {
    try {
      const points = await fetchKlines();
      if (typeof window.setOilSeriesData === "function") {
        window.setOilSeriesData(SERIES_ID, points);
      } else {
        for (const p of points) window.appendOilPoint(SERIES_ID, p.t, p.y);
      }
      if (points.length > 0) setLastTick(points[points.length - 1].t);
      setStatus("statusAster", "connected", "status-ok");
    } catch (e) {
      console.warn("Aster oil data", e);
      setStatus("statusAster", "error", "status-bad");
    }
  }

  function run() {
    if (typeof window.registerOilSeries !== "function" || typeof window.appendOilPoint !== "function") {
      setTimeout(run, 50);
      return;
    }
    setStatus("statusAster", "connecting…", "status-warn");
    window.registerOilSeries(SERIES_ID, LABEL, COLOR);
    refetch();
  }

  window.refetchAsterOil = refetch;
  run();
})();
