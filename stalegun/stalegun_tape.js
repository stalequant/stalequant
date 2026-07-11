/* =========================
   Trade tape for stalegun
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

function fmtDateTime(ttimeSec) {
  const d = new Date(ttimeSec);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function exchLabel(exch) {
  if (exch === "hyperliquid") return "Hyperliquid";
  if (exch === "binance futures") return "Binance";
  if (exch === "binance spot") return "Binance Spot";
  if (exch === "stalegun") return "Inferred HL Price";
  return exch;
}

const tapeBox = document.getElementById("tapeBox");
const tapeCountEl = document.getElementById("tapeCount");
let tapeLineCount = 0;
let autoScroll = true;
const MAX_TAPE_LINES = 500;

if (tapeBox) {
  tapeBox.addEventListener("scroll", () => {
    const nearBottom = (tapeBox.scrollTop + tapeBox.clientHeight) >= (tapeBox.scrollHeight - 8);
    autoScroll = nearBottom;
  });
}

function appendTradeToTape(venue, timestamp, price, side, quantity) {
  if (!tapeBox) return;
  
  const exName = padRight(exchLabel(venue), 15);
  const dt = fmtDateTime(timestamp);
  const priceStr = fmtFixedWidth(price, 12, 2);
  const sideStr = side ? "BUY " : "SELL";
  const qtyStr = quantity !== undefined && quantity !== null 
    ? padLeft(Number(quantity).toFixed(8), 12) 
    : padLeft("--", 12);
  
  const line = `${exName} ${dt} ${sideStr} ${qtyStr} @ ${priceStr}`;

  const block = document.createElement("div");
  // Map venue names to CSS class names
  let venueClass = venue.replace(/\s+/g, '').toLowerCase();
  if (venueClass === 'binancefutures') venueClass = 'binancefutures';
  else if (venueClass === 'binancespot') venueClass = 'binancespot';
  block.className = `rowline ${venueClass}`;
  block.textContent = line;
  tapeBox.appendChild(block);
  tapeLineCount++;

  while (tapeLineCount > MAX_TAPE_LINES && tapeBox.firstChild) {
    tapeBox.removeChild(tapeBox.firstChild);
    tapeLineCount--;
  }
  if (tapeCountEl) tapeCountEl.textContent = String(tapeLineCount);

  if (autoScroll) tapeBox.scrollTop = tapeBox.scrollHeight;
}

