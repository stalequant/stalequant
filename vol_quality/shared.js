/* =========================
   Shared helpers
========================= */
function padRight(s, n) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return " ".repeat(n - s.length) + s;
}

function fmtFixedWidth(x, width, decimals) {
  const s = Number(x).toFixed(decimals);
  if (s.length >= width) return s.slice(0, width);
  return " ".repeat(width - s.length) + s;
}

function normalizeEpochSeconds(raw) {
  let x = Number(raw);
  if (!Number.isFinite(x)) return Date.now() / 1000;

  // seconds ~= 1e9, ms ~= 1e12, us ~= 1e15, ns ~= 1e18
  if (x > 1e18) x = x / 1e9;       // ns -> s
  else if (x > 1e15) x = x / 1e6;  // us -> s
  else if (x > 1e12) x = x / 1e3;  // ms -> s
  else if (x > 1e10) x = x / 1e3;  // some feeds use ms but smaller threshold

  return x;
}

function fmtDateTime(ttimeSec) {
  const d = new Date(ttimeSec * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function exchLabel(exch) {
  return exch === "hl" ? "Hyperliquid" : (exch === "ex" ? "EdgeX" : "Lighter");
}

function setStatus(id, text, klass) {
  const el = document.getElementById(id);
  const span = el.querySelector("span") || el.appendChild(document.createElement("span"));
  span.textContent = text;
  span.className = klass;
}

const $ = (id) => document.getElementById(id);

