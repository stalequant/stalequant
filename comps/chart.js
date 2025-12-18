/* =========================
   Dynamic normalization on zoom/pan
   - stores raw traces (post-censor, post-adjust) and rescales so leftmost visible point = 1
========================= */
let suppressRelayout = false;

const RAW_PLOT = {
  traces: [],  // {name, xMs, yRaw, opacity}
  layout: null
};

function getXRangeFromRelayout(ev) {
  if (!ev) return null;
  if (ev["xaxis.autorange"] === true) return null;
  const r0 = ev["xaxis.range[0]"];
  const r1 = ev["xaxis.range[1]"];
  if (!r0 || !r1) return null;
  const t0 = Date.parse(r0);
  const t1 = Date.parse(r1);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return [Math.min(t0, t1), Math.max(t0, t1)];
}

function leftmostIndexInRange(xMs, lo, hi) {
  for (let i = 0; i < xMs.length; i++) {
    const t = xMs[i];
    if (t < lo) continue;
    if (t > hi) break;
    return i;
  }
  return -1;
}

function scaleToLeftmostVisible(xMs, yRaw, lo, hi) {
  const i0 = leftmostIndexInRange(xMs, lo, hi);
  if (i0 < 0) return yRaw.slice();
  const base = yRaw[i0];
  if (!Number.isFinite(base) || base === 0) return yRaw.slice();
  const out = new Array(yRaw.length);
  for (let i = 0; i < yRaw.length; i++) {
    const v = yRaw[i];
    out[i] = Number.isFinite(v) ? (v / base) : NaN;
  }
  return out;
}

async function redrawWithDynamicNormalization(xRange) {
  if (!RAW_PLOT.layout || RAW_PLOT.traces.length === 0) return;

  const traces = [];
  for (const tr of RAW_PLOT.traces) {
    let yScaled;
    if (xRange) {
      yScaled = scaleToLeftmostVisible(tr.xMs, tr.yRaw, xRange[0], xRange[1]);
    } else {
      // initial/global: leftmost finite overall
      const first = tr.yRaw.find(v => Number.isFinite(v));
      const base = (Number.isFinite(first) && first !== 0) ? first : 1.0;
      yScaled = tr.yRaw.map(v => Number.isFinite(v) ? v / base : NaN);
    }

    traces.push({
      type: "scatter",
      mode: "lines",
      name: tr.name,
      x: tr.xMs.map(t => new Date(t)),
      y: yScaled,
      opacity: tr.opacity,
      hovertemplate: "%{x|%Y-%m-%d %H:%M:%S}Z<br>%{y:.6f}<extra>%{fullData.name}</extra>"
    });
  }

  suppressRelayout = true;
  try {
    await Plotly.react("comps-plot", traces, RAW_PLOT.layout, { displayModeBar: false, responsive: true, scrollZoom: true });
  } finally {
    setTimeout(() => { suppressRelayout = false; }, 0);
  }
}

/* =========================
   Fast fetching: concurrency pool
========================= */
async function runWithConcurrency(items, workerFn, concurrency) {
  let idx = 0;
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      await workerFn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/* =========================
   Plot update (build RAW_PLOT then draw with dynamic normalization)
========================= */
let plotRunId = 0;

async function updatePlot() {
  const runId = ++plotRunId;

  const targets = [...state.targets].map(uniqUpper).filter(Boolean);
  const benches = [...state.benchmarks].map(uniqUpper).filter(Boolean);
  if (benches.length === 0) {
    showToast("Need a benchmark", "Add at least one benchmark symbol (e.g., BTC, ETH).");
    return;
  }

  const itv = intervalFromGranularity(state.options.granularity);
  const step = intervalMs(itv);
  const now = Date.now();
  const endMs = Math.floor(now / step) * step;

  const benchSyms = benches.map(resolveToPerpSymbol).filter(Boolean);
  const targetSyms = targets.map(resolveToPerpSymbol).filter(Boolean);
  const allSyms = [...new Set([...benchSyms, ...targetSyms])];

  const startMs = endMs - recentWindowMsForInterval(itv);

  const tasks = allSyms.map(sym => ({ sym, startMs }));

  try {
    const concurrency = 3;
    await runWithConcurrency(tasks, async (t, i) => {
      if (runId !== plotRunId) return;
      await store.ensureOne(t.sym, itv, t.startMs, endMs);
      const cacheBadge = $("compsCacheBadge");
      if (cacheBadge) cacheBadge.textContent = store.candleCache.size + " keys";
      await sleep(0);
    }, concurrency);
  } catch (e) {
    showToast("Fetch error", String(e && e.message ? e.message : e));
    return;
  }

  // Benchmark aggregate
  const bmConstituents = [];
  for (const sym of benchSyms) {
    const s = store.getSeries(sym, itv, "close");
    if (s) bmConstituents.push({ name: sym, xMs: s.xMs, y: s.y });
  }
  if (bmConstituents.length === 0) {
    showToast("No benchmark data", "None of the benchmark symbols returned data.");
    return;
  }

  const overlap = intersectTimesMs(bmConstituents);
  const bmAligned = bmConstituents.map(c => ({ name: c.name, y: reindexYOnTimes(c, overlap) }));
  const bmAgg = buildBenchmarkAggregate(bmAligned, overlap);
  if (!bmAgg) {
    showToast("Benchmark build failed", "Not enough overlapping clean return steps across benchmark constituents.");
    return;
  }

  // Build RAW traces (post-adjust, post-censor; NOT normalized)
  const rawTraces = [];

  // Targets
  for (const sym of targetSyms) {
    const s = store.getSeries(sym, itv, "close");
    if (!s) continue;
    const adj = applyBenchmarkAdjust(sym, s.xMs, s.y, bmAgg.xMs, bmAgg.y) || { name: sym, xMs: s.xMs, y: s.y };
    const fin = applyCensorOnly(adj.xMs, adj.y);
    if (fin) rawTraces.push({ name: sym, xMs: fin.xMs, yRaw: fin.y, opacity: 1.0 });
  }
  // Comparables (bench constituents also adjusted) + Benchmark line behavior
  const compMode = chooseComparablesMode();
  const mode = state.options.benchmarkMode;

  // Helper: "Benchmark" should be flat 1 when demeaned / beta-adjusted
  function makeBenchmarkOnesTrace() {
    const fin = applyCensorOnly(bmAgg.xMs, bmAgg.y);
    if (!fin) return null;
    return { name: "Benchmark", xMs: fin.xMs, yRaw: new Array(fin.y.length).fill(1.0), opacity: 1.0 };
  }

  if (mode !== "raw") {
    // Always show benchmark as 1 in adjusted modes
    const bm1 = makeBenchmarkOnesTrace();
    if (bm1) rawTraces.push(bm1);
  } else {
    // Raw mode: benchmark is the actual benchmark index (aggregate)
    const fin = applyCensorOnly(bmAgg.xMs, bmAgg.y);
    if (fin) rawTraces.push({ name: "Benchmark", xMs: fin.xMs, yRaw: fin.y, opacity: 1.0 });
  }

  if (compMode === "aggregate") {
    // nothing else to add (benchmark already added above)
  } else if (compMode === "yes") {
    for (const c of bmConstituents) {
      const adj = applyBenchmarkAdjust(c.name, c.xMs, c.y, bmAgg.xMs, bmAgg.y) || { name: c.name, xMs: c.xMs, y: c.y };
      const fin = applyCensorOnly(adj.xMs, adj.y);
      if (fin) rawTraces.push({ name: c.name, xMs: fin.xMs, yRaw: fin.y, opacity: 0.35 });
    }
  }

  if (rawTraces.length === 0) {
    const fin = applyCensorOnly(bmAgg.xMs, bmAgg.y);
    if (fin) rawTraces.push({ name: "Benchmark", xMs: fin.xMs, yRaw: fin.y, opacity: 1.0 });
  }

  const layout = {
    margin: { l: 54, r: 24, t: 34, b: 48 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial", size: 12, color: "rgba(231,236,255,.9)" },
    xaxis: { title: { text: "" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
    yaxis: { title: { text: "Price" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
    legend: { orientation: "h", y: 1.03, x: 0, bgcolor: "rgba(0,0,0,0)" },
    title: { text: "", font: { size: 13, color: "rgba(170,180,212,.95)" } }
  };

  RAW_PLOT.traces = rawTraces;
  RAW_PLOT.layout = layout;

  await redrawWithDynamicNormalization(null);
  
  // Update badges
  const updatedBadge = $("compsUpdatedBadge");
  if (updatedBadge) updatedBadge.textContent = "Updated " + stamp();
  const cacheBadge = $("compsCacheBadge");
  if (cacheBadge) cacheBadge.textContent = store.candleCache.size + " keys";
}

