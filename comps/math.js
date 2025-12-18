/* =========================
   Math helpers
========================= */
function meanFinite(arr) {
  let s = 0, n = 0;
  for (const v of arr) { if (Number.isFinite(v)) { s += v; n++; } }
  return n ? s / n : NaN;
}

function logDiff(y) {
  const out = [];
  for (let i = 1; i < y.length; i++) {
    const a = y[i - 1], b = y[i];
    out.push((a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)) ? (Math.log(b) - Math.log(a)) : NaN);
  }
  return out;
}

function winsorizeLogReturns(lr, cap) {
  const out = new Array(lr.length);
  for (let i = 0; i < lr.length; i++) {
    const v = lr[i];
    out[i] = Number.isFinite(v) ? Math.max(-cap, Math.min(cap, v)) : NaN;
  }
  return out;
}

function reconstructFromLogReturns(x0, lr) {
  const y = [x0]; let cur = x0;
  for (const v of lr) {
    if (!Number.isFinite(v)) { y.push(NaN); continue; }
    cur = cur * Math.exp(v);
    y.push(cur);
  }
  return y;
}

function estimateBeta(y_lr, bm_lr) {
  const prods = [], sqs = [];
  const n = Math.min(y_lr.length, bm_lr.length);
  for (let i = 0; i < n; i++) {
    const a = y_lr[i], b = bm_lr[i];
    if (Number.isFinite(a) && Number.isFinite(b)) { prods.push(a * b); sqs.push(b * b); }
  }
  const denom = meanFinite(sqs);
  return (Number.isFinite(denom) && denom !== 0) ? meanFinite(prods) / denom : NaN;
}

/* =========================
   Benchmark build + adjust
========================= */
function intersectTimesMs(seriesList) {
  if (seriesList.length === 0) return [];
  const sets = seriesList.map(s => new Set(s.xMs));
  sets.sort((a, b) => a.size - b.size);
  const base = sets[0];
  const out = [];
  for (const t of base) {
    let ok = true;
    for (let i = 1; i < sets.length; i++) { if (!sets[i].has(t)) { ok = false; break; } }
    if (ok) out.push(t);
  }
  out.sort((a, b) => a - b);
  return out;
}

function reindexYOnTimes(series, times) {
  const m = new Map();
  for (let i = 0; i < series.xMs.length; i++) m.set(series.xMs[i], series.y[i]);
  return times.map(t => m.get(t));
}

function buildBenchmarkAggregate(bmAligned, overlapTimes) {
  const n = overlapTimes.length;
  if (n < 3) return null;
  const meanLR = []; const outTimes = [];
  for (let k = 1; k < n; k++) {
    const lrs = []; let ok = true;
    for (const c of bmAligned) {
      const a = c.y[k - 1], b = c.y[k];
      if (!(a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b))) { ok = false; break; }
      lrs.push(Math.log(b) - Math.log(a));
    }
    if (!ok) continue;
    const m = meanFinite(lrs);
    if (!Number.isFinite(m)) continue;
    meanLR.push(m);
    outTimes.push(overlapTimes[k]);
  }
  if (meanLR.length < 2) return null;
  const y = []; let cur = 0;
  for (const lr of meanLR) { cur += lr; y.push(Math.exp(cur)); }
  return { xMs: outTimes, y };
}

function alignOnCommonTimes(x1, y1, x2, y2) {
  const m2 = new Map();
  for (let i = 0; i < x2.length; i++) m2.set(x2[i], y2[i]);
  const outX = [], outA = [], outB = [];
  for (let i = 0; i < x1.length; i++) {
    const t = x1[i];
    const v2 = m2.get(t);
    if (v2 === undefined) continue;
    const v1 = y1[i];
    if (!Number.isFinite(v1) || !Number.isFinite(v2) || v1 <= 0 || v2 <= 0) continue;
    outX.push(t); outA.push(v1); outB.push(v2);
  }
  return { x: outX, a: outA, b: outB };
}

function applyBenchmarkAdjust(name, xMs, y, bmXMs, bmY) {
  const mode = state.options.benchmarkMode;
  if (mode === "raw") return { name, xMs, y };
  const al = alignOnCommonTimes(xMs, y, bmXMs, bmY);
  if (al.x.length < 3) return null;
  if (mode === "demean_beta1") return { name, xMs: al.x, y: al.a.map((v, i) => v / al.b[i]) };
  if (mode === "beta_adjust") {
    const beta = estimateBeta(logDiff(al.a), logDiff(al.b));
    const out = Number.isFinite(beta) ? al.a.map((v, i) => v / Math.pow(al.b[i], beta)) : al.a.slice();
    return { name, xMs: al.x, y: out };
  }
  return { name, xMs, y };
}

function applyCensorOnly(xMs, y) {
  const xx = [], yy = [];
  for (let i = 0; i < y.length; i++) { if (Number.isFinite(y[i])) { xx.push(xMs[i]); yy.push(y[i]); } }
  if (yy.length < 3) return null;

  const capStr = state.options.censor;
  const cap = (capStr === "no") ? null : Number(capStr);
  let y2 = yy.slice();
  if (cap && Number.isFinite(cap) && cap > 0) {
    const lr2 = winsorizeLogReturns(logDiff(y2), cap);
    y2 = reconstructFromLogReturns(y2[0], lr2);
  }
  return { xMs: xx, y: y2 };
}

function chooseComparablesMode() {
  const c = state.options.comparables;
  const nBench = state.benchmarks.size;
  if (c === "yes") return "yes";
  if (c === "no") return "no";
  return (nBench > 2) ? "aggregate" : "yes";
}

