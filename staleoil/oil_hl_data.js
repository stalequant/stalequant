/**
 * Hyperliquid oil futures: discover dex/symbols, load candles via REST once on start.
 * Uses window.OIL_CANDLE_INTERVAL (1m|5m|15m|1h) and window.OIL_CANDLE_LIMIT (default 400).
 */
(function () {
  "use strict";

  const HL_INFO_URL = "https://api.hyperliquid.xyz/info";
  const OIL_BASES = ["OIL", "WTI", "CL", "USOIL"];
  var discoveredSymbols = [];
  const COLORS = ["#35d07f", "#5dd", "#7ec8e3", "#4a9", "#6f9"];

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

  async function postInfo(body) {
    const res = await fetch(HL_INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HL info " + res.status);
    return res.json();
  }

  function intervalMs(interval) {
    const m = interval.match(/^(\d+)(m|h|d|w|M)$/);
    if (!m) return 5 * 60 * 1000;
    const num = parseInt(m[1], 10);
    const mul = { m: 60, h: 3600, d: 86400, w: 86400 * 7, M: 86400 * 30 }[m[2]];
    return num * mul * 1000;
  }

  async function fetchCandles(coin, interval, limit) {
    const batchMs = intervalMs(interval);
    let endMs = Date.now();
    const points = [];
    let total = 0;
    while (total < limit) {
      const payload = {
        type: "candleSnapshot",
        req: {
          coin: coin,
          interval: interval,
          startTime: endMs - limit * batchMs,
          endTime: endMs,
        },
      };
      const rows = await postInfo(payload);
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const r of rows) {
        const t = r.t != null ? r.t : r[0];
        const c = r.c != null ? r.c : r[4];
        const v = r.v != null ? r.v : (Array.isArray(r) && r[5] != null ? r[5] : 0);
        if (t != null && c != null) {
          const vol = typeof v === "number" ? v : parseFloat(v);
          points.push({ t: Number(t), y: Number(c), v: Number.isNaN(vol) ? 0 : vol });
        }
      }
      total += rows.length;
      if (rows.length < 5000) break;
      const oldest = Math.min(...rows.map((r) => (r.t != null ? r.t : r[0])));
      if (oldest >= endMs) break;
      endMs = oldest - 1;
    }
    points.sort((a, b) => a.t - b.t);
    return points;
  }

  function collectOilFromUniverse(universe, dexLabel) {
    const out = [];
    if (!Array.isArray(universe)) return out;
    for (const u of universe) {
      const name = u && (u.name || u.symbol);
      if (!name || typeof name !== "string") continue;
      const base = name.includes(":") ? name.split(":").pop() : name;
      if (OIL_BASES.includes(base.toUpperCase())) out.push({ dex: dexLabel || "", coin: name });
    }
    return out;
  }

  function getDexName(item) {
    if (item == null) return null;
    if (typeof item === "string") return item;
    return item.name != null ? String(item.name) : null;
  }

  async function discoverOilSymbols() {
    const out = [];
    try {
      const dexes = await postInfo({ type: "perpDexs" });
      if (Array.isArray(dexes)) {
        for (const item of dexes) {
          const dex = getDexName(item);
          if (!dex) continue;
          const meta = await postInfo({ type: "meta", dex: dex });
          const found = collectOilFromUniverse(meta && meta.universe, dex);
          for (const f of found) out.push(f);
        }
      }
    } catch (_) {
      /* perpDexs may fail (e.g. CORS when opening as file://) */
    }
    if (out.length > 0) return out;
    try {
      const meta = await postInfo({ type: "meta" });
      return collectOilFromUniverse(meta && meta.universe, "");
    } catch (_) {}
    try {
      const pair = await postInfo({ type: "metaAndAssetCtxs" });
      const meta = Array.isArray(pair) ? pair[0] : null;
      return collectOilFromUniverse(meta && meta.universe, "");
    } catch (_) {}
    return [];
  }

  function getInterval() { return window.OIL_CANDLE_INTERVAL || "5m"; }
  function getLimit() { return (typeof window.OIL_CANDLE_LIMIT === "number") ? window.OIL_CANDLE_LIMIT : 400; }

  async function run() {
    if (typeof window.registerHLOilSeries !== "function" || typeof window.appendHLOilPoint !== "function") {
      setTimeout(run, 50);
      return;
    }
    setStatus("statusHL", "loading…", "status-warn");
    try {
      const symbols = await discoverOilSymbols();
      if (symbols.length === 0) {
        setStatus("statusHL", "no oil symbols (serve over HTTPS for HL)", "status-bad");
        return;
      }
      discoveredSymbols = symbols.slice();
      let colorIndex = 0;
      for (const { coin } of symbols) {
        const label = coin;
        const color = COLORS[colorIndex % COLORS.length];
        colorIndex++;
        window.registerHLOilSeries(coin, label, color);
      }
      await refetch();
      setStatus("statusHL", "connected", "status-ok");
    } catch (e) {
      console.error("HL oil data", e);
      setStatus("statusHL", "error", "status-bad");
    }
  }

  async function refetch() {
    const interval = getInterval();
    const limit = getLimit();
    for (const { coin } of discoveredSymbols) {
      try {
        const points = await fetchCandles(coin, interval, limit);
        if (typeof window.setOilSeriesData === "function") {
          window.setOilSeriesData(coin, points);
        } else {
          for (const p of points) window.appendHLOilPoint(coin, p.t, p.y);
        }
        if (points.length > 0) setLastTick(points[points.length - 1].t);
      } catch (e) {
        console.warn("HL candles " + coin, e);
      }
    }
  }

  window.refetchHLOil = refetch;
  run();
})();
