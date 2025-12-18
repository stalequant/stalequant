/* =========================
   TIME SERIES (Plotly)
========================= */
const TS = (function () {
  const DEFAULT_START = "2024-11-01";
  const SM = {
    "AAVE USDC": 3,
    "Ethena sUSDe": 7, "Binance BTCUSD Carry": 7,
    "Morpho cbBTC USDC": 3,
    "SKY Savings Rate": 1, "USD SOFR": 1
  };

  const NEEDS_PROXY = (location.protocol === "file:");
  const CORS_PROXY = "https://corsproxy.io/?";
  const withCorsProxy = (url) => CORS_PROXY + encodeURIComponent(url);

  const elTabRaw = document.getElementById("tabRaw");
  const elTabSmooth = document.getElementById("tabSmooth");
  const elTitle = document.getElementById("tsTitle");
  const elUpdated = document.getElementById("tsUpdatedBadge");
  const elPts = document.getElementById("tsPointsBadge");
  const elSummary = document.getElementById("tsCtrlSummary");

  let view = "smooth"; // start smoothed
  const seriesRaw = new Map(); // name -> Map(dateStr->decimal)

  function yyyyMmDdUTC(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function parseIsoToDateOnly(iso) {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) throw new Error("Bad ISO: " + iso);
    return yyyyMmDdUTC(dt);
  }
  function parseEpochMsToDateOnly(ms) { return yyyyMmDdUTC(new Date(ms)); }
  function parseEpochSecToDateOnly(sec) { return parseEpochMsToDateOnly(sec * 1000); }

  function rollingMeanByDate(dateToVal, window) {
    const dates = Array.from(dateToVal.keys()).sort();
    const out = new Map();
    const buf = [];
    let sum = 0;
    for (const d of dates) {
      const v = dateToVal.get(d);
      if (v == null || !Number.isFinite(v)) continue;
      buf.push(v); sum += v;
      if (buf.length > window) sum -= buf.shift();
      if (window === 1) out.set(d, v);
      else if (buf.length === window) out.set(d, sum / window);
    }
    return out;
  }
  function filterFromStart(map, startDateStr) {
    const out = new Map();
    for (const [k, v] of map.entries()) {
      if (k >= startDateStr) out.set(k, v);
    }
    return out;
  }

  function buildTraces() {
    const traces = [];
    for (const name of TS_KEYS) {
      if (!enabled[name]) continue;
      const raw = seriesRaw.get(name);
      if (!raw || raw.size === 0) continue;

      const startDateStr = DEFAULT_START;
      const filtered = filterFromStart(raw, startDateStr);
      const m = (view === "raw") ? filtered : rollingMeanByDate(filtered, SM[name] || 1);

      const x = Array.from(m.keys()).sort();
      const y = x.map(d => m.get(d) * 100.0);

      traces.push({
        type: "scatter",
        mode: "lines",
        name,
        x, y,
        line: { width: 2 },
        hovertemplate: name + "<br>%{x}<br>%{y:.2f}%<extra></extra>"
      });
    }
    return traces;
  }

  function computePointCount() {
    let s = 0;
    for (const k of TS_KEYS) {
      const m = seriesRaw.get(k);
      if (m) s += m.size;
    }
    return s;
  }

  function render() {
    const traces = buildTraces();
    Plotly.react("tsChart", traces, {
      font: { color: "rgba(231,236,255,.92)" },          // global text
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 60, r: 20, t: 10, b: 55 },
      xaxis: { title: "Date", gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      yaxis: { title: "Rate (%)", gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0 },
      hoverlabel: { bgcolor: "rgba(16,26,51,.95)" }


    }, { responsive: true, displayModeBar: false, displaylogo: false });

    elPts.textContent = computePointCount() + " pts";
    elUpdated.textContent = "Updated " + stamp();
    elTitle.textContent = "Time series (" + view + ")";
    elSummary.textContent = "";
  }

  function setView(v) {
    view = v;
    elTabRaw.classList.toggle("active", v === "raw");
    elTabSmooth.classList.toggle("active", v === "smooth");
    render();
  }

  async function fetchAaveSupplyHistory({ chainId, market, underlyingToken, window }) {
    const url = "https://api.v3.aave.com/graphql";
    const payload = {
      operationName: "SupplyAPYHistory",
      query: `
        query SupplyAPYHistory($request: SupplyAPYHistoryRequest!) {
          value: supplyAPYHistory(request: $request) { avgRate { value } date }
        }
      `,
      variables: { request: { chainId, market, underlyingToken, window } }
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/json", "referer": "https://app.aave.com/" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const rows = (j && j.data && j.data.value) ? j.data.value : [];
    const m = new Map();
    for (const d of rows) {
      const ds = parseIsoToDateOnly(d.date);
      const v = Number(d.avgRate && d.avgRate.value);
      if (Number.isFinite(v)) m.set(ds, v);
    }
    return m;
  }

  async function fetchMorphoDailySupplyApy(uniqueKey, startTs, endTs) {
    const url = "https://api.morpho.org/graphql";
    const query = `
      query ExampleQuery($options: TimeseriesOptions, $uniqueKey: String!) {
        marketByUniqueKey(uniqueKey: $uniqueKey) {
          historicalState { dailySupplyApy(options: $options) { x y } }
        }
      }
    `;
    const variables = { uniqueKey, options: { startTimestamp: startTs, endTimestamp: endTs, interval: "DAY" } };

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables })
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (j.errors) throw new Error("GraphQL errors");
    const arr = j.data.marketByUniqueKey.historicalState.dailySupplyApy || [];
    const m = new Map();
    for (const p of arr) {
      const ds = parseEpochSecToDateOnly(Number(p.x));
      const v = Number(p.y);
      if (Number.isFinite(v)) m.set(ds, v);
    }
    return m;
  }

  async function fetchSky() {
    const url = "https://info-sky.blockanalitica.com/save/historic/?days_ago=9999";
    const r = await fetch(NEEDS_PROXY ? withCorsProxy(url) : url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const m = new Map();
    for (const b of j) {
      const ds = parseIsoToDateOnly(b.datetime);
      if (b.ssr_rate) {
        const v = Number(b.ssr_rate);
        if (Number.isFinite(v)) m.set(ds, v);
      }
    }
    return m;
  }

  async function fetchSofr() {
    const url = "https://markets.newyorkfed.org/read?productCode=50&eventCodes=520&startDt=2018-04-02&fields=dailyRate,tradingVolume,refRateDt&sort=postDt:1";
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const out = new Map();
    const arr = (j && j.data) ? j.data : [];
    for (const row of arr) {
      try {
        const obj = JSON.parse(row.data);
        const ds = parseIsoToDateOnly(obj.refRateDt);
        const v = Number(obj.dailyRate) / 100.0;
        if (Number.isFinite(v)) out.set(ds, v);
      } catch (e) { }
    }
    return out;
  }

  async function fetchBinanceCarry() {
    const base = "https://www.binance.com/dapi/v1/fundingRate";
    const params = new URLSearchParams({ symbol: "BTCUSD_PERP", limit: "1000" });
    const r = await fetch(base + "?" + params.toString(), { headers: { "accept": "*/*" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();

    const buckets = new Map();
    for (const b of j) {
      const ds = parseEpochMsToDateOnly(Number(b.fundingTime));
      const fr = Number(b.fundingRate);
      if (!Number.isFinite(fr)) continue;
      if (!buckets.has(ds)) buckets.set(ds, []);
      buckets.get(ds).push(fr);
    }
    const out = new Map();
    for (const [ds, arr] of buckets.entries()) {
      const s = arr.reduce((acc, x) => acc + x, 0);
      const annual = s * 3 * 365 / arr.length;
      if (Number.isFinite(annual)) out.set(ds, annual);
    }
    return out;
  }

  async function fetchEthena() {
    const url = "https://app.ethena.fi/api/yields/historical/historical-protocol-and-competitor-yields";
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const qi = j && j.queryIndex ? j.queryIndex : [];
    const item = qi.find(x => x && x.name === "sUSDe Yield");
    const yields = item && item.yields ? item.yields : [];
    const out = new Map();
    for (const d of yields) {
      const ds = parseIsoToDateOnly(d.timestamp);
      const v = Number(d.value) / 100.0;
      if (Number.isFinite(v)) out.set(ds, v);
    }
    return out;
  }

  async function refreshIncremental() {
    const startDateStr = DEFAULT_START;
    const nowSec = Math.floor(Date.now() / 1000);
    const morphoStart = nowSec - 30 * 86400 * 30;
    const aaveMarket = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

    for (const k of TS_KEYS) {
      health[k] = health[k] || { ok: null, note: "pending" };
      health[k].ok = null;
      health[k].note = "pending";
    }
    rebuildToggles();
    setLive("ts", "warn", "Loading time series...");

    const progLines = [];

    const runOne = async (name, fn) => {
      health[name] = { ok: null, note: "loading..." };
      rebuildToggles();
      try {
        const m = await fn();
        seriesRaw.set(name, filterFromStart(m, startDateStr));
        health[name] = { ok: true, note: "(" + seriesRaw.get(name).size + ")" };
        progLines.push("OK: " + name + " (" + seriesRaw.get(name).size + " pts)");
      } catch (e) {
        seriesRaw.set(name, new Map());
        health[name] = { ok: false, note: (e?.message ?? String(e)) };
        progLines.push("FAIL: " + name + " -- " + (e?.message ?? String(e)));
      }
      rebuildToggles();
      render();
    };

    runOne("AAVE USDC", () => fetchAaveSupplyHistory({
      chainId: 1, market: aaveMarket,
      underlyingToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      window: "LAST_YEAR"
    }));
    runOne("Morpho cbBTC USDC", () => fetchMorphoDailySupplyApy(
      "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
      morphoStart, nowSec
    ));
    runOne("SKY Savings Rate", () => fetchSky());
    runOne("USD SOFR", () => fetchSofr());
    runOne("Binance BTCUSD Carry", () => fetchBinanceCarry());
    runOne("Ethena sUSDe", () => fetchEthena());

    setTimeout(() => setLive("ts", "ok", "Time series updating..."), 300);
  }

  function boot() {
    elTabRaw.addEventListener("click", () => setView("raw"));
    elTabSmooth.addEventListener("click", () => setView("smooth"));

    Plotly.newPlot("tsChart", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },          // global text

      margin: { l: 60, r: 20, t: 10, b: 55 },
      xaxis: { title: "Date", gridcolor: "rgba(255,255,255,.08)" },
      yaxis: { title: "Rate (%)", gridcolor: "rgba(255,255,255,.08)" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    setView("smooth");
  }

  return { boot, refreshIncremental, render };
})();

