/* =========================
   Data + accounting
========================= */
let start = (Date.now() / 1000) + 1;
const FAST_TICK_DURATION_SEC = 100; // Fast ticks for first 100 seconds

const recordedTrades = new Map(); // key -> lastSeenEpochSec
const RECORDED_TTL_SEC = 15 * 60;

const positions = new Map();        // `${exch}|${user}` -> position
const cumVol = new Map();           // exch -> cumulative abs qty
const cumPosChangesVol = new Map(); // exch -> cumulative change in abs pos
const EXCH = ["hl", "ex", "li"];

const MAX_POINTS = 60 * 60 * 4; // ~4 hours @ 1Hz
const MAX_TAPE_LINES = 5000;    // keep DOM bounded

let series = [];
let tickCount = 0;

function pruneRecordedTrades() {
  const now = Date.now() / 1000;
  const cutoff = now - RECORDED_TTL_SEC;
  for (const [k, ts] of recordedTrades) {
    if (ts < cutoff) recordedTrades.delete(k);
  }
}

function applyUserTrade(exch, user, amt) {
  const k = `${exch}|${user}`;
  const oldPos = positions.get(k) || 0;
  const newPos = oldPos + amt;
  positions.set(k, newPos);

  cumVol.set(exch, (cumVol.get(exch) || 0) + Math.abs(amt));
  cumPosChangesVol.set(
    exch,
    (cumPosChangesVol.get(exch) || 0) + (Math.abs(newPos) - Math.abs(oldPos))
  );
  return { oldPos, newPos };
}

function recordTrade(exch, buyer, seller, quantity, rawTime, h) {
  const ttime = normalizeEpochSeconds(rawTime);
  if (ttime < start) return;

  if (recordedTrades.has(h)) return;
  recordedTrades.set(h, ttime);

  if (recordedTrades.size > 200000 || Math.random() < 0.01) pruneRecordedTrades();

  buyer = String(buyer).slice(0, 27);
  seller = String(seller).slice(0, 27);

  const q = Number(quantity);

  const b = applyUserTrade(exch, buyer, q);
  const s = applyUserTrade(exch, seller, -q);

  appendTradeToTape(exch, ttime, q, buyer, b.oldPos, b.newPos, seller, s.oldPos, s.newPos);
}

function snapshotTick() {
  const now = Date.now() / 1000;
  const point = { t: now };
  for (const e of EXCH) {
    point[e] = {
      vol: cumVol.get(e) || 0,
      pos: cumPosChangesVol.get(e) || 0
    };
  }
  series.push(point);
  if (series.length > MAX_POINTS) series = series.slice(series.length - MAX_POINTS);

  tickCount++;
  const elapsed = now - start;
  
  const lastTickEl = $("lastTick");
  if (lastTickEl) {
    lastTickEl.textContent = new Date(now * 1000).toLocaleTimeString();
    lastTickEl.className = "status-ok";
  }
  renderAll();
  
  // Return the interval for the next tick: 100ms for first 100 seconds, then 1000ms
  return elapsed < FAST_TICK_DURATION_SEC ? 100 : 1000;
}

function resetAll() {
  recordedTrades.clear();
  positions.clear();
  cumVol.clear();
  cumPosChangesVol.clear();
  series = [];
  tickCount = 0;
  start = (Date.now() / 1000) + 1; // Reset start time for fast tick calculation
  for (const e of EXCH) {
    cumVol.set(e, 0);
    cumPosChangesVol.set(e, 0);
  }
  const tapeBox = $("tapeBox");
  if (tapeBox) {
    tapeBox.textContent = "";
    tapeLineCount = 0;
  }
  const tapeCountEl = $("tapeCount");
  if (tapeCountEl) tapeCountEl.textContent = "0";
  autoScroll = true;
  renderAll();
}

