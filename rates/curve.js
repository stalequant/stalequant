/* =========================
   CURVE (Plotly)
========================= */
const Curve = (function () {
  const elUpdated = document.getElementById("curveUpdatedBadge");
  const elPts = document.getElementById("curvePointsBadge");

  let rawPoints = [];

  function todayUTCDate() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function daysBetween(d2, d1) {
    const ms = 24 * 60 * 60 * 1000;
    return Math.round((d2 - d1) / ms);
  }

  async function fetchBinanceBTCBasis() {
    const label = "Binance BTCUSD futures";
    try {
      const url = "https://dapi.binance.com/dapi/v1/premiumIndex";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const arr = await r.json();

      const btc = arr.filter(x => (x.symbol || "").startsWith("BTCUSD_"));
      const map = {};
      for (const x of btc) {
        const suffix = String(x.symbol).split("_").pop();
        map[suffix] = Number(x.markPrice);
      }
      if (!Number.isFinite(map.PERP)) throw new Error("Missing PERP");
      const perp = map.PERP;

      const t0 = todayUTCDate();
      const out = [];
      for (const [k, mark] of Object.entries(map)) {
        if (k === "PERP") continue;
        if (!/^\d{6}$/.test(k)) continue;
        const yy = 2000 + Number(k.slice(0, 2));
        const mm = Number(k.slice(2, 4)) - 1;
        const dd = Number(k.slice(4, 6));
        const exp = new Date(yy, mm, dd);
        const d = daysBetween(exp, t0);
        const yf = d / 365.25;
        if (yf <= 0) continue;
        const ratePct = ((mark / perp) - 1) / yf * 100;
        out.push({ series: label, days: d, ratePct, maturityDate: exp });
      }
      return { ok: true, label, points: out };
    } catch (e) {
      return { ok: false, label, points: [], error: String(e?.message ?? e) };
    }
  }

  async function fetchDeribitBTCFutures() {
    const label = "Deribit BTC futures";
    try {
      const url = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=future";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const data = j?.result ?? [];
      const t0 = todayUTCDate();

      const out = [];
      for (const x of data) {
        const name = x.instrument_name || "";
        if (name.includes("PERP")) continue;

        const last = name.split("-").pop();
        const m = last.match(/^(\d{1,2})([A-Za-z]{3})(\d{2})$/);
        if (!m) continue;

        const dd = Number(m[1]);
        const monStr = m[2].toUpperCase();
        const yy = 2000 + Number(m[3]);
        const monMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
        if (!(monStr in monMap)) continue;

        const exp = new Date(yy, monMap[monStr], dd);
        const d = daysBetween(exp, t0);
        const yf = d / 365.25;
        if (yf <= 0) continue;

        const mark = Number(x.mark_price);
        const edp = Number(x.estimated_delivery_price);
        if (!Number.isFinite(mark) || !Number.isFinite(edp) || edp === 0) continue;

        const ratePct = ((mark / edp) - 1) / yf * 100;
        out.push({ series: label, days: d, ratePct, maturityDate: exp });
      }
      return { ok: true, label, points: out };
    } catch (e) {
      return { ok: false, label, points: [], error: String(e?.message ?? e) };
    }
  }

  async function fetchPendlePT(tokenName) {
    const label = "Pendle PT" + tokenName;
    try {
      const aUrl = "https://api-v2.pendle.finance/core/v1/assets/all";
      const pUrl = "https://api-v2.pendle.finance/core/v1/prices/assets";
      const [ra, rp] = await Promise.all([fetch(aUrl, { cache: "no-store" }), fetch(pUrl, { cache: "no-store" })]);
      if (!ra.ok) throw new Error("assets/all HTTP " + ra.status);
      if (!rp.ok) throw new Error("prices/assets HTTP " + rp.status);

      const aj = await ra.json();
      const pj = await rp.json();
      const assets = aj?.assets ?? [];
      const prices = pj?.prices ?? {};

      const t0 = todayUTCDate();
      const out = [];
      for (const a of assets) {
        const nm = a?.name ?? "";
        if (!nm.startsWith("PT " + tokenName)) continue;

        const key = String(a.chainId) + "-" + String(a.address);
        const px = Number(prices[key]);
        if (!Number.isFinite(px) || px <= 0) continue;

        const exp = new Date(String(a.expiry));
        if (Number.isNaN(exp.getTime())) continue;
        const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());

        const d = daysBetween(expDay, t0);
        if (d <= 0) continue;

        const ratePct = (((1 / px) - 1) / d * 365.0) * 100;
        out.push({ series: label, days: d, ratePct, maturityDate: expDay });
      }
      return { ok: true, label, points: out };
    } catch (e) {
      return { ok: false, label, points: [], error: String(e?.message ?? e) };
    }
  }

  function extractBetween(s, left, right) {
    const i0 = s.indexOf(left);
    if (i0 === -1) return null;
    const i = i0 + left.length;
    const j = s.indexOf(right, i);
    if (j === -1) return null;
    return s.slice(i, j);
  }
  function parseTreasuryEntries(xml) {
    const entries = xml.split("<entry>");
    const out = [];
    for (let idx = 1; idx < entries.length; idx++) {
      const e = entries[idx];
      const date = extractBetween(e, "<d:INDEX_DATE m:type=\"Edm.DateTime\">", "</d:INDEX_DATE>");
      if (!date) continue;
      const row = {
        INDEX_DATE: date.slice(0, 10),
        YIELD_4WK: extractBetween(e, "<d:ROUND_B1_YIELD_4WK_2", "</d:ROUND_B1_YIELD_4WK_2>"),
        YIELD_6WK: extractBetween(e, "<d:ROUND_B1_YIELD_6WK_2", "</d:ROUND_B1_YIELD_6WK_2>"),
        YIELD_8WK: extractBetween(e, "<d:ROUND_B1_YIELD_8WK_2", "</d:ROUND_B1_YIELD_8WK_2>"),
        YIELD_13WK: extractBetween(e, "<d:ROUND_B1_YIELD_13WK_2", "</d:ROUND_B1_YIELD_13WK_2>"),
        YIELD_17WK: extractBetween(e, "<d:ROUND_B1_YIELD_17WK_2", "</d:ROUND_B1_YIELD_17WK_2>"),
        YIELD_26WK: extractBetween(e, "<d:ROUND_B1_YIELD_26WK_2", "</d:ROUND_B1_YIELD_26WK_2>"),
        YIELD_52WK: extractBetween(e, "<d:ROUND_B1_YIELD_52WK_2", "</d:ROUND_B1_YIELD_52WK_2>"),
      };
      for (const k of Object.keys(row)) {
        const v = row[k];
        if (v && v.includes(">")) row[k] = v.split(">", 2)[1];
      }
      out.push(row);
    }
    return out;
  }

  async function fetchTreasuryBills() {
    const label = "US Treasuries";
    try {
      const now = new Date();
      const d = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
      const ym = String(d.getFullYear()) + String(d.getMonth() + 1);
      const url = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml"
        + "?data=daily_treasury_bill_rates"
        + "&field_tdr_date_value_month=" + encodeURIComponent(ym);

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const xml = await r.text();
      const rows = parseTreasuryEntries(xml);
      if (!rows.length) throw new Error("No rows parsed");

      rows.sort((a, b) => a.INDEX_DATE < b.INDEX_DATE ? -1 : 1);
      const latest = rows[rows.length - 1];

      const t0 = todayUTCDate();
      const wkMap = { "4WK": 4, "6WK": 6, "8WK": 8, "13WK": 13, "17WK": 17, "26WK": 26, "52WK": 52 };

      const out = [];
      for (const [k, v] of Object.entries(latest)) {
        if (!k.startsWith("YIELD_")) continue;
        const tag = k.replace("YIELD_", "");
        const wks = wkMap[tag];
        if (!wks) continue;
        const y = Number(v);
        if (!Number.isFinite(y)) continue;

        const days = wks * 7;
        const exp = new Date(t0.getTime() + days * 24 * 60 * 60 * 1000);
        out.push({ series: label, days, ratePct: y, maturityDate: exp });
      }
      return { ok: true, label, points: out };
    } catch (e) {
      return { ok: false, label, points: [], error: String(e?.message ?? e) };
    }
  }

  async function fetchBybitBTCUSDTFutures() {
    const label = "Bybit BTCUSDT futures";
    try {
      const url = "https://api.bybit.com/v5/market/tickers?category=linear";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const data = j?.result?.list ?? [];
      const t0 = todayUTCDate();

      const monMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      const out = [];
      for (const a of data) {
        const sym = a?.symbol;
        if (!sym || !sym.startsWith("BTCUSDT-")) continue;

        const suf = sym.split("-").pop();
        const m = suf.match(/^(\d{1,2})([A-Za-z]{3})(\d{2})$/);
        if (!m) continue;

        const dd = Number(m[1]);
        const monStr = m[2].toUpperCase();
        const yy = 2000 + Number(m[3]);
        if (!(monStr in monMap)) continue;

        const exp = new Date(yy, monMap[monStr], dd);
        const d = daysBetween(exp, t0);
        if (d <= 0) continue;

        const mark = Number(a.markPrice);
        const index = Number(a.indexPrice);
        if (!Number.isFinite(mark) || !Number.isFinite(index) || index <= 0) continue;

        const ratePct = ((mark / index) - 1) / (d / 365.25) * 100;
        out.push({ series: label, days: d, ratePct, maturityDate: exp });
      }
      return { ok: true, label, points: out };
    } catch (e) {
      return { ok: false, label, points: [], error: String(e?.message ?? e) };
    }
  }

  async function fetchBybitUSDTLoan() {
    const label = "Bybit USDT loan";
    try {
      const url = "https://api.bybit.com/v5/crypto-loan-common/loanable-data";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const list = j?.result?.list ?? [];
      const usdt = list.find(x => x.currency === "USDT");
      if (!usdt) throw new Error("USDT not found");

      const t0 = todayUTCDate();
      const out = [];
      for (const [k, v] of Object.entries(usdt)) {
        if (!k.startsWith("annualizedInterestRate")) continue;
        const m = k.match(/^annualizedInterestRate(\d+)\D/i);
        if (!m) continue;
        const days = Number(m[1]);
        const rate = Number(v);
        if (!Number.isFinite(days) || !Number.isFinite(rate)) continue;
        const exp = new Date(t0.getTime() + days * 24 * 60 * 60 * 1000);
        out.push({ series: label, days, ratePct: rate * 100, maturityDate: exp });
      }
      return { ok: true, label, points: out };
    } catch (e) {
      return { ok: false, label, points: [], error: String(e?.message ?? e) };
    }
  }

  function getCurveFilters() {
    const minDays = Number(document.getElementById("minDays").value);
    const maxDays = Number(document.getElementById("maxDays").value);
    const minRatePct = Number(document.getElementById("minRatePct").value);
    const maxRatePct = Number(document.getElementById("maxRatePct").value);
    return {
      minDays: Number.isFinite(minDays) ? minDays : 0,
      maxDays: Number.isFinite(maxDays) ? maxDays : 1e9,
      minRatePct: Number.isFinite(minRatePct) ? minRatePct : -1e9,
      maxRatePct: Number.isFinite(maxRatePct) ? maxRatePct : 1e9
    };
  }

  function filteredPoints() {
    const f = getCurveFilters();
    return rawPoints.filter(p => {
      if (!enabled[p.series]) return false;
      if (p.days < f.minDays || p.days > f.maxDays) return false;
      if (!Number.isFinite(p.ratePct)) return false;
      if (p.ratePct < f.minRatePct || p.ratePct > f.maxRatePct) return false;
      return true;
    });
  }

  function buildTraces(points) {
    const bySeries = new Map();
    for (const p of points) {
      if (!bySeries.has(p.series)) bySeries.set(p.series, []);
      bySeries.get(p.series).push(p);
    }
    const traces = [];
    for (const [series, arr] of bySeries.entries()) {
      arr.sort((a, b) => a.days - b.days);
      traces.push({
        type: "scatter",
        mode: "lines+markers",
        name: series,
        x: arr.map(o => o.days),
        y: arr.map(o => o.ratePct),
        line: { width: 2 },
        marker: { size: 7 },
        hovertemplate: series + "<br>Maturity: %{x}d<br>Rate: %{y:.2f}%<extra></extra>"
      });
    }
    return traces;
  }

  function render() {
    const pts = filteredPoints();
    const traces = buildTraces(pts);

    Plotly.react("curveChart", traces, {
      paper_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },          // global text

      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 60, r: 20, t: 10, b: 55 },
      xaxis: { title: "Maturity (days)", gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      yaxis: { title: "Interest Rate (%)", gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0 },
      hoverlabel: { bgcolor: "rgba(16,26,51,.95)" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    elPts.textContent = pts.length + " pts";
    elUpdated.textContent = "Updated " + stamp(); // (2) wired
  }

  async function refresh() {
    for (const k of CURVE_KEYS) health[k] = { ok: null, note: "pending" };
    rebuildToggles();

    setLive("curve", "warn", "Loading curve...");

    const tasks = [
      fetchBinanceBTCBasis(),
      fetchDeribitBTCFutures(),
      fetchPendlePT("USDe"),
      fetchBybitBTCUSDTFutures(),
      fetchTreasuryBills(),
      fetchBybitUSDTLoan()
    ];

    const res = await Promise.all(tasks);
    rawPoints = [];

    let okCount = 0, failCount = 0;
    const lines = [];
    for (const r of res) {
      if (r.ok) {
        okCount++;
        rawPoints.push(...r.points);
        health[r.label] = { ok: true, note: "(" + r.points.length + ")" };
        lines.push("OK: " + r.label + " (" + r.points.length + " pts)");
      } else {
        failCount++;
        health[r.label] = { ok: false, note: r.error || "error" };
        lines.push("FAIL: " + r.label + " -- " + (r.error || "error"));
      }
    }

    rebuildToggles();
    render();

    setLive("curve", okCount > 0 ? "ok" : "bad", "Curve loaded (" + okCount + " OK, " + failCount + " failed)");
    elUpdated.textContent = "Updated " + stamp(); // (2) wired on refresh too
  }

  function boot() {
    Plotly.newPlot("curveChart", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 60, r: 20, t: 10, b: 55 },
      xaxis: { title: "Maturity (days)", gridcolor: "rgba(255,255,255,.08)" },
      yaxis: { title: "Interest Rate (%)", gridcolor: "rgba(255,255,255,.08)" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    for (const id of ["minDays", "maxDays", "minRatePct", "maxRatePct"]) {
      document.getElementById(id).addEventListener("change", render);
    }
  }

  return { boot, refresh, render };
})();

