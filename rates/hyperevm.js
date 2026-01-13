/* =========================
   HYPEREVM RATES (Plotly)
========================= */
const HyperEVM = (function () {
  const DEFAULT_START = "2024-11-01";
  const SM = {
    "Hypurrfi USDC": 1,
    "Hyperlend USDC": 1,
    "Hypurrfi HYPE": 1,
    "Hyperlend HYPE": 1,
    "Morpho USDC (KHYPE)": 1,
    "Morpho HYPE (KHYPE)": 1
  };

  const NEEDS_PROXY = (location.protocol === "file:");
  const CORS_PROXY = "https://corsproxy.io/?";
  const withCorsProxy = (url) => CORS_PROXY + encodeURIComponent(url);

  const elUpdated = document.getElementById("hyperevmUpdatedBadge");
  const elPts = document.getElementById("hyperevmPointsBadge");
  const elSummary = document.getElementById("hyperevmCtrlSummary");

  let view = "smooth";
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
    for (const name of HYPEREVM_KEYS) {
      if (!enabled[name]) continue;
      const raw = seriesRaw.get(name);
      if (!raw || raw.size === 0) continue;

      const startDateStr = DEFAULT_START;
      const filtered = filterFromStart(raw, startDateStr);
      const m = (view === "raw") ? filtered : rollingMeanByDate(filtered, SM[name] || 1);

      const x = Array.from(m.keys()).sort();
      const y = x.map(d => m.get(d) * 100.0);

      // HYPE rates should be dotted, USDC solid
      const isHYPE = name.includes("HYPE");
      const lineStyle = isHYPE ? { width: 2, dash: "dot" } : { width: 2 };

      traces.push({
        type: "scatter",
        mode: "lines",
        name,
        x, y,
        line: lineStyle,
        hovertemplate: name + "<br>%{x}<br>%{y:.2f}%<extra></extra>"
      });
    }
    return traces;
  }

  function computePointCount() {
    let s = 0;
    for (const k of HYPEREVM_KEYS) {
      const m = seriesRaw.get(k);
      if (m) s += m.size;
    }
    return s;
  }

  function render() {
    const traces = buildTraces();
    Plotly.react("hyperevmChart", traces, {
      font: { color: "rgba(231,236,255,.92)" },
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
    elSummary.textContent = "";
  }

  async function fetchHypurrfiUSDC() {
    const url = "https://app.hypurr.fi/api/indexer/api/chains/999/pooled/0xb88339CB7199b77E23DB6E890353E22632Ba630f/apy";
    const r = await fetch(NEEDS_PROXY ? withCorsProxy(url) : url, {
      method: "GET",
      headers: {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referrer": "https://app.hypurr.fi/markets/pooled/999/0xb88339CB7199b77E23DB6E890353E22632Ba630f"
      },
      mode: "cors",
      credentials: "omit"
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const timeSeriesData = (j && j.timeSeriesData) ? j.timeSeriesData : [];
    const out = new Map();
    for (const d of timeSeriesData) {
      if (d.lendAPY == null) continue;
      const ds = parseEpochMsToDateOnly(Number(d.timestamp));
      const v = Number(d.lendAPY) / 100.0; // Convert from percentage to decimal
      if (Number.isFinite(v)) out.set(ds, v);
    }
    return out;
  }

  async function fetchHypurrfiHYPE() {
    const url = "https://app.hypurr.fi/api/indexer/api/chains/999/pooled/0x5555555555555555555555555555555555555555/apy";
    const r = await fetch(NEEDS_PROXY ? withCorsProxy(url) : url, {
      method: "GET",
      headers: {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referrer": "https://app.hypurr.fi/markets/pooled/999/0x5555555555555555555555555555555555555555"
      },
      mode: "cors",
      credentials: "omit"
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const timeSeriesData = (j && j.timeSeriesData) ? j.timeSeriesData : [];
    const out = new Map();
    for (const d of timeSeriesData) {
      if (d.lendAPY == null) continue;
      const ds = parseEpochMsToDateOnly(Number(d.timestamp));
      const v = Number(d.lendAPY) / 100.0; // Convert from percentage to decimal
      if (Number.isFinite(v)) out.set(ds, v);
    }
    return out;
  }

  async function fetchHyperlendUSDC() {
    const url = "https://api.hyperlend.finance/data/interestRateHistory?chain=hyperEvm&token=0xb88339CB7199b77E23DB6E890353E22632Ba630f";
    // Try direct first, fallback to proxy if needed
    let r;
    try {
      r = await fetch(url, {
        method: "GET",
        headers: {
          "accept": "*/*",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "referrer": "https://app.hyperlend.finance/"
        },
        mode: "cors",
        credentials: "omit"
      });
    } catch (e) {
      // If direct fails and we need proxy, try with proxy
      if (NEEDS_PROXY) {
        r = await fetch(withCorsProxy(url), {
          method: "GET",
          headers: {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "pragma": "no-cache"
          },
          mode: "cors",
          credentials: "omit"
        });
      } else {
        throw e;
      }
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const tokenAddr = "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb";
    const secondsPerYear = 365.25 * 24 * 60 * 60; // 31557600
    const RAY = 1e27; // Ray has 27 decimals
    const out = new Map();
    for (const item of j) {
      if (!item[tokenAddr] || !item[tokenAddr].currentLiquidityRate) continue;
      const rateStr = item[tokenAddr].currentLiquidityRate;
      const rate = Number(rateStr);
      if (!Number.isFinite(rate)) continue;
      // Convert from Ray (27 decimals) to rate per second, then to annual rate
      const ratePerSecond = rate / RAY;
      const annualRate = ratePerSecond * secondsPerYear;
      if (Number.isFinite(annualRate) && annualRate > 0 && annualRate < 10) {
        const ds = parseEpochMsToDateOnly(Number(item.timestamp));
        out.set(ds, annualRate);
      }
    }
    return out;
  }

  async function fetchHyperlendHYPE() {
    const url = "https://api.hyperlend.finance/data/interestRateHistory?chain=hyperEvm&token=0x5555555555555555555555555555555555555555";
    // Try direct first, fallback to proxy if needed
    let r;
    try {
      r = await fetch(url, {
        method: "GET",
        headers: {
          "accept": "*/*",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "referrer": "https://app.hyperlend.finance/"
        },
        mode: "cors",
        credentials: "omit"
      });
    } catch (e) {
      // If direct fails and we need proxy, try with proxy
      if (NEEDS_PROXY) {
        r = await fetch(withCorsProxy(url), {
          method: "GET",
          headers: {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "pragma": "no-cache"
          },
          mode: "cors",
          credentials: "omit"
        });
      } else {
        throw e;
      }
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const tokenAddr = "0x5555555555555555555555555555555555555555";
    const secondsPerYear = 365.25 * 24 * 60 * 60; // 31557600
    const RAY = 1e27; // Ray has 27 decimals
    const out = new Map();
    for (const item of j) {
      if (!item[tokenAddr] || !item[tokenAddr].currentLiquidityRate) continue;
      const rateStr = item[tokenAddr].currentLiquidityRate;
      const rate = Number(rateStr);
      if (!Number.isFinite(rate)) continue;
      // Convert from Ray (27 decimals) to rate per second, then to annual rate
      const ratePerSecond = rate / RAY;
      const annualRate = ratePerSecond * secondsPerYear;
      if (Number.isFinite(annualRate) && annualRate > 0 && annualRate < 10) {
        const ds = parseEpochMsToDateOnly(Number(item.timestamp));
        out.set(ds, annualRate);
      }
    }
    return out;
  }

  async function fetchMorphoDailyNetSupplyApy(uniqueKey, startTs, endTs) {
    const url = "https://api.morpho.org/graphql";
    // Try with chainId first for HyperEVM
    const queryWithChain = `
      query ExampleQuery($options: TimeseriesOptions, $uniqueKey: String!, $chainId: Int!) {
        marketByUniqueKey(uniqueKey: $uniqueKey, chainId: $chainId) {
          historicalState { dailyNetSupplyApy(options: $options) { x y } }
        }
      }
    `;
    const variablesWithChain = { 
      uniqueKey, 
      chainId: 999, // HyperEVM chain ID
      options: { startTimestamp: startTs, endTimestamp: endTs, interval: "DAY" } 
    };

    let r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: queryWithChain, variables: variablesWithChain })
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    let j = await r.json();
    
    // If chainId doesn't work, try without it
    if (j.errors) {
      const queryNoChain = `
        query ExampleQuery($options: TimeseriesOptions, $uniqueKey: String!) {
          marketByUniqueKey(uniqueKey: $uniqueKey) {
            historicalState { dailyNetSupplyApy(options: $options) { x y } }
          }
        }
      `;
      const variablesNoChain = { 
        uniqueKey, 
        options: { startTimestamp: startTs, endTimestamp: endTs, interval: "DAY" } 
      };
      r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: queryNoChain, variables: variablesNoChain })
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      j = await r.json();
    }
    
    if (j.errors) throw new Error("GraphQL errors");
    const arr = j.data.marketByUniqueKey.historicalState.dailyNetSupplyApy || [];
    const m = new Map();
    for (const p of arr) {
      const ds = parseEpochSecToDateOnly(Number(p.x));
      const v = Number(p.y);
      if (Number.isFinite(v)) m.set(ds, v);
    }
    return m;
  }

  async function fetchMorphoUSDCKHYPE() {
    const nowSec = Math.floor(Date.now() / 1000);
    const startTs = nowSec - 30 * 86400 * 30; // ~30 months
    const uniqueKey = "0xe7aa046832007a975d4619260d221229e99cc27da2e6ef162881202b4cd2349b";
    return fetchMorphoDailyNetSupplyApy(uniqueKey, startTs, nowSec);
  }

  async function fetchMorphoHYPEKHYPE() {
    const nowSec = Math.floor(Date.now() / 1000);
    const startTs = nowSec - 30 * 86400 * 30; // ~30 months
    const uniqueKey = "0x64e7db7f042812d4335947a7cdf6af1093d29478aff5f1ccd93cc67f8aadfddc";
    return fetchMorphoDailyNetSupplyApy(uniqueKey, startTs, nowSec);
  }

  async function refreshIncremental() {
    const startDateStr = DEFAULT_START;

    for (const k of HYPEREVM_KEYS) {
      health[k] = health[k] || { ok: null, note: "pending" };
      health[k].ok = null;
      health[k].note = "pending";
    }
    rebuildToggles();
    setLive("hyperevm", "warn", "Loading HyperEVM rates...");

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

    runOne("Hypurrfi USDC", () => fetchHypurrfiUSDC());
    // runOne("Hyperlend USDC", () => fetchHyperlendUSDC());
    runOne("Hypurrfi HYPE", () => fetchHypurrfiHYPE());
    // runOne("Hyperlend HYPE", () => fetchHyperlendHYPE());
    runOne("Morpho USDC (KHYPE)", () => fetchMorphoUSDCKHYPE());
    runOne("Morpho HYPE (KHYPE)", () => fetchMorphoHYPEKHYPE());

    setTimeout(() => setLive("hyperevm", "ok", "HyperEVM rates updating..."), 300);
  }

  function boot() {
    Plotly.newPlot("hyperevmChart", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      margin: { l: 60, r: 20, t: 10, b: 55 },
      xaxis: { title: "Date", gridcolor: "rgba(255,255,255,.08)" },
      yaxis: { title: "Rate (%)", gridcolor: "rgba(255,255,255,.08)" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    view = "smooth";
  }

  return { boot, refreshIncremental, render };
})();
