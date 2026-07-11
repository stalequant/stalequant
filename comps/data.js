/* =========================
   Binance universe (USDT PERP, TRADING)
========================= */
const UNIVERSE = { loaded: false, baseAssets: [], baseToUSDTPerp: new Map(), symbolInfo: new Map() };

async function fetchJsonWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error("HTTP " + resp.status + " " + resp.statusText + (txt ? " -- " + txt.slice(0, 200) : ""));
    }
    return await resp.json();
  } finally { clearTimeout(t); }
}

async function loadBinanceUniverse() {
  const j = await fetchJsonWithTimeout("https://fapi.binance.com/fapi/v1/exchangeInfo", 30000);

  const baseToSym = new Map();
  const symInfo = new Map();
  const bases = new Set();

  for (const s of (j.symbols || [])) {
    if (s.status !== "TRADING") continue;
    if (s.contractType !== "PERPETUAL") continue;
    if (s.quoteAsset !== "USDT") continue;

    const base = String(s.baseAsset || "").toUpperCase();
    const sym = String(s.symbol || "").toUpperCase();
    if (!base || !sym) continue;

    bases.add(base);
    if (!baseToSym.has(base)) baseToSym.set(base, sym);
    symInfo.set(sym, { symbol: sym, baseAsset: base, onboardDate: Number(s.onboardDate || 0) });
  }

  UNIVERSE.baseToUSDTPerp = baseToSym;
  UNIVERSE.symbolInfo = symInfo;
  UNIVERSE.baseAssets = Array.from(bases).sort((a, b) => a.localeCompare(b));
  UNIVERSE.loaded = true;
}

function resolveToPerpSymbol(token) {
  const t = uniqUpper(token);
  if (!t) return "";
  if (t.endsWith("USDT")) return t;
  if (UNIVERSE.loaded && UNIVERSE.baseToUSDTPerp.has(t)) return UNIVERSE.baseToUSDTPerp.get(t);
  return t + "USDT";
}

/* =========================
   Interval helpers
========================= */
function intervalFromGranularity(gr) {
  switch (gr) {
    case "M": return "1m";
    case "15M": return "15m";
    case "H": return "1h";
    case "4H": return "4h";
    case "D": return "1d";
    default: return "15m";
  }
}

function intervalMs(interval) {
  if (interval === "1m") return 60_000;
  if (interval === "15m") return 900_000;
  if (interval === "1h") return 3_600_000;
  if (interval === "4h") return 14_400_000;
  if (interval === "1d") return 86_400_000;
  return 900_000;
}

function recentWindowMsForInterval(itv) {
  if (itv === "1m") return 7 * 24 * 60 * 60 * 1000;   // 7d
  if (itv === "15m") return 60 * 24 * 60 * 60 * 1000;   // 60d
  if (itv === "1h") return 365 * 24 * 60 * 60 * 1000;   // 1y
  if (itv === "4h") return 5 * 365 * 24 * 60 * 60 * 1000;     // 5y
  if (itv === "1d") return 10 * 365 * 24 * 60 * 60 * 1000;     // 10y
  return 60 * 24 * 60 * 60 * 1000;
}

/* =========================
   Cached store (candles + cached series)
========================= */
class FuturesOHLCVStore {
  constructor() {
    this.baseUrl = "https://fapi.binance.com";
    this.timeoutMs = 30_000;
    this.sleepMs = 60;

    this.candleCache = new Map();   // "SYM|itv" -> rows
    this.seriesCache = new Map();   // "SYM|itv|field" -> {xMs,y,version}
    this.keyVersion = new Map();    // "SYM|itv" -> int
  }
  _k(sym, itv) { return sym + "|" + itv }
  _sk(sym, itv, field) { return sym + "|" + itv + "|" + field }
  _bumpVersion(key) { const v = (this.keyVersion.get(key) || 0) + 1; this.keyVersion.set(key, v); return v; }
  _invalidate(sym, itv) {
    const p = sym + "|" + itv + "|";
    for (const k of this.seriesCache.keys()) { if (k.startsWith(p)) this.seriesCache.delete(k); }
  }

  async _fetchJson(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error("HTTP " + resp.status + " " + resp.statusText + (txt ? " -- " + txt.slice(0, 200) : ""));
      }
      return await resp.json();
    } finally { clearTimeout(t); }
  }

  async _klines(symbol, interval, startMs = null, endMs = null, limit = 1500) {
    const u = new URL(this.baseUrl + "/fapi/v1/klines");
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("interval", interval);
    u.searchParams.set("limit", String(limit));
    if (startMs !== null) u.searchParams.set("startTime", String(Math.trunc(startMs)));
    if (endMs !== null) u.searchParams.set("endTime", String(Math.trunc(endMs)));
    return await this._fetchJson(u.toString());
  }

  _parseRows(rows) {
    const out = [];
    for (const r of rows) {
      out.push({ open_time: +r[0], close: +r[4] });
    }
    out.sort((a, b) => a.open_time - b.open_time);
    const dedup = []; let last = null;
    for (const row of out) {
      if (last === null || row.open_time !== last) { dedup.push(row); last = row.open_time; }
    }
    return dedup;
  }

  async fetchRange(symbol, interval, startMs, endMs = null, limit = 1500) {
    const rows = [];
    let cur = Math.trunc(startMs);
    for (; ;) {
      const chunk = await this._klines(symbol, interval, cur, endMs, limit);
      if (!chunk || chunk.length === 0) break;
      rows.push(...chunk);
      if (chunk.length < limit) break;
      cur = Number(chunk[chunk.length - 1][0]) + 1;
      if (endMs !== null && cur >= endMs) break;
      await sleep(this.sleepMs);
    }
    return rows.length ? this._parseRows(rows) : [];
  }

  async ensureOne(symbol, interval, startMs, endMs) {
    const key = this._k(symbol, interval);
    const existing = this.candleCache.get(key) || [];
    if (existing.length === 0) {
      const fetched = await this.fetchRange(symbol, interval, startMs, endMs);
      this.candleCache.set(key, fetched);
      this._bumpVersion(key);
      this._invalidate(symbol, interval);
      return;
    }
    const haveMin = existing[0].open_time;
    const haveMax = existing[existing.length - 1].open_time;
    const pieces = [existing];
    let changed = false;

    if (startMs < haveMin) {
      const leftEnd = Math.min(haveMin - 1, endMs);
      const left = await this.fetchRange(symbol, interval, startMs, leftEnd);
      if (left.length) { pieces.push(left); changed = true; }
    }
    if (endMs > haveMax) {
      const rightStart = Math.max(haveMax + 1, startMs);
      const right = await this.fetchRange(symbol, interval, rightStart, endMs);
      if (right.length) { pieces.push(right); changed = true; }
    }
    if (changed) {
      const all = pieces.flat().sort((a, b) => a.open_time - b.open_time);
      const dedup = []; let last = null;
      for (const row of all) {
        if (last === null || row.open_time !== last) { dedup.push(row); last = row.open_time; }
      }
      this.candleCache.set(key, dedup);
      this._bumpVersion(key);
      this._invalidate(symbol, interval);
    }
  }

  getSeries(symbol, interval, field = "close") {
    const candleKey = this._k(symbol, interval);
    const v = this.keyVersion.get(candleKey) || 0;
    const skey = this._sk(symbol, interval, field);
    const cached = this.seriesCache.get(skey);
    if (cached && cached.version === v) return cached;

    const arr = this.candleCache.get(candleKey);
    if (!arr || arr.length === 0) return null;

    const xMs = new Array(arr.length);
    const y = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      xMs[i] = arr[i].open_time;
      y[i] = arr[i][field];
    }
    const out = { xMs, y, version: v };
    this.seriesCache.set(skey, out);
    return out;
  }
}

const store = new FuturesOHLCVStore();

