/* =========================
   Shared helpers
========================= */
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
function setLive(which, state, text) {
}
function stamp() {
  return new Date().toLocaleString();
}
function togglePanel(barId, panelId, chevId) {
  const panel = document.getElementById(panelId);
  const chev = document.getElementById(chevId);
  if (!panel || !chev) return; // Handle missing elements gracefully
  const open = !panel.classList.contains("open");
  panel.classList.toggle("open", open);
  chev.classList.toggle("open", open);
}

/* =========================
   Keys + enabled + health
========================= */
const TS_KEYS = [
  "AAVE USDC",
  "Morpho cbBTC USDC",
  "SKY Savings Rate",
  "USD SOFR",
  "Binance BTCUSD Carry",
  "Ethena sUSDe"
];
const CURVE_KEYS = [
  "Binance BTCUSD futures",
  "Bybit BTCUSDT futures",
  "Deribit BTC futures",
  "Pendle PTUSDe",
  "US Treasuries",
  "Bybit USDT loan"
];

const enabled = {};
for (const k of [...TS_KEYS, ...CURVE_KEYS]) enabled[k] = true;

const health = {}; // key -> { ok: true/false/null, note }

/* =========================
   Toggle UI (split: TS list + curve list)
========================= */
function buildToggleList(keys, hostId) {
  const host = document.getElementById(hostId);
  host.innerHTML = "";

  for (const k of keys) {
    const div = document.createElement("div");
    div.className = "toggle";

    const left = document.createElement("div");
    left.className = "name";

    const strong = document.createElement("strong");
    strong.textContent = k;

    const span = document.createElement("span");
    const h = health[k];
    if (h && h.ok === true) {
      span.innerHTML = "<span class='badge ok'>OK</span> " + escapeHtml(h.note || "");
    } else if (h && h.ok === false) {
      span.innerHTML = "<span class='badge bad'>FAIL</span> " + escapeHtml(h.note || "");
    } else {
      span.innerHTML = "<span class='badge'>...</span> " + escapeHtml((h && h.note) ? h.note : "pending");
    }

    left.appendChild(strong);
    left.appendChild(span);

    const sw = document.createElement("label");
    sw.className = "switch";
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.checked = !!enabled[k];
    inp.addEventListener("change", () => {
      enabled[k] = inp.checked;
      if (typeof TS !== "undefined" && TS.render) TS.render();
      if (typeof Curve !== "undefined" && Curve.render) Curve.render();
    });
    const slider = document.createElement("span");
    slider.className = "slider";
    sw.appendChild(inp);
    sw.appendChild(slider);

    div.appendChild(left);
    div.appendChild(sw);
    host.appendChild(div);
  }
}
function rebuildToggles() {
  buildToggleList(TS_KEYS, "toggleListTS");
  buildToggleList(CURVE_KEYS, "toggleListCurve");
}

