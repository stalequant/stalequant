/* =========================
   Data fetch and processing
========================= */
const THUNDERHEAD_URL = 'https://d2v1fiwobg9w6.cloudfront.net';
const ENDPOINTS = [
  'daily_usd_volume_by_coin',
  'total_volume',
  'asset_ctxs',
  'hlp_positions',
];
const WINDOW = 7;

async function fetchThunderhead() {
  const raw = Object.fromEntries(
    await Promise.all(ENDPOINTS.map(async ep => {
      const res = await fetch(`${THUNDERHEAD_URL}/${ep}`, { headers: { accept: '*/*' } });
      if (!res.ok) { throw new Error(`${ep}: HTTP ${res.status}`); }
      const { chart_data = [] } = await res.json();
      return [ep, chart_data];
    }))
  );

  const nested = {}; // coin→time→metrics
  for (const [key, rows] of Object.entries(raw)) {
    for (const row of rows) {
      const { coin, time, ...rest } = row;
      if (!coin || !time) continue;
      getOrInit(nested, coin, time)[key] = rest;
    }
  }
  return nested;
}

function computeMetrics(nested) {
  const perCoin = {}, agg = {};

  for (const [coin, times] of Object.entries(nested)) {
    if (coin.includes('@')) continue; // skip dated contracts
    const sorted = Object.entries(times).sort((a, b) => a[0].localeCompare(b[0]));

    // rolling buffers
    const buf = { tot: [], usd: [], oi: [], px: [], ntl: [] };
    const rows = [];

    for (const [t, m] of sorted) {
      const tot = m.total_volume?.total_volume ?? m.total_volume?.value ?? m.total_volume ?? 0;
      const usd = m.daily_usd_volume_by_coin?.daily_usd_volume ?? m.daily_usd_volume_by_coin?.value ?? m.daily_usd_volume ?? 0;
      const oi = m.asset_ctxs?.avg_open_interest ?? m.avg_open_interest ?? 0;
      const px = m.asset_ctxs?.avg_oracle_px ?? m.avg_oracle_px ?? 0;
      const ntl = m.hlp_positions?.daily_ntl_abs ?? m.daily_ntl_abs ?? 0;

      // aggregate for TOTAL series later
      const A = agg[t] ?? (agg[t] = { tot: 0, usd: 0, notional: 0, ntl: 0 });
      A.tot += tot; A.usd += usd; A.notional += oi * px; A.ntl += ntl;

      // update rolling buffers
      buf.tot.push(tot); if (buf.tot.length > WINDOW) buf.tot.shift();
      buf.usd.push(usd); if (buf.usd.length > WINDOW) buf.usd.shift();
      buf.oi.push(oi); if (buf.oi.length > WINDOW) buf.oi.shift();
      buf.px.push(px); if (buf.px.length > WINDOW) buf.px.shift();
      buf.ntl.push(ntl); if (buf.ntl.length > WINDOW) buf.ntl.shift();

      const maTot = mean(buf.tot), maUsd = mean(buf.usd), maOi = mean(buf.oi), maPx = mean(buf.px), maNtl = mean(buf.ntl);
      const maNotional = (maOi ?? 0) * (maPx ?? 0);

      rows.push({
        time: new Date(t),
        hlpVolShare: maTot ? (maTot - (maUsd ?? 0) / 2) / maTot : null,
        hlpOiShare: maNotional ? (maNtl ?? 0) / maNotional : null,
      });
    }
    perCoin[coin] = rows;
  }

  // build TOTAL
  const totBuf = { tot: [], usd: [], not: [], ntl: [] };
  const totRows = [];
  for (const t of Object.keys(agg).sort()) {
    const { tot, usd, notional, ntl } = agg[t];
    totBuf.tot.push(tot); if (totBuf.tot.length > WINDOW) totBuf.tot.shift();
    totBuf.usd.push(usd); if (totBuf.usd.length > WINDOW) totBuf.usd.shift();
    totBuf.not.push(notional); if (totBuf.not.length > WINDOW) totBuf.not.shift();
    totBuf.ntl.push(ntl); if (totBuf.ntl.length > WINDOW) totBuf.ntl.shift();

    const maTot = mean(totBuf.tot), maUsd = mean(totBuf.usd), maNot = mean(totBuf.not), maNtl = mean(totBuf.ntl);
    totRows.push({
      time: new Date(t),
      hlpVolShare: maTot ? (maTot - (maUsd ?? 0) / 2) / maTot : null,
      hlpOiShare: maNot ? (maNtl ?? 0) / maNot : null,
    });
  }
  perCoin.TOTAL = totRows;
  return perCoin;
}

