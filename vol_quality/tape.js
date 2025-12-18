/* =========================
   Trade tape
========================= */
const tapeBox = $("tapeBox");
const tapeCountEl = $("tapeCount");
let tapeLineCount = 0;
let autoScroll = true;

if (tapeBox) {
  tapeBox.addEventListener("scroll", () => {
    const nearBottom = (tapeBox.scrollTop + tapeBox.clientHeight) >= (tapeBox.scrollHeight - 8);
    autoScroll = nearBottom;
  });
}

function appendTradeToTape(exch, ttimeSec, qty, buyer, bOld, bNew, seller, sOld, sNew) {
  if (!tapeBox) return;
  
  const exName = padRight(exchLabel(exch), 11);
  const dt = fmtDateTime(ttimeSec);
  const qStr = padLeft(Number(qty).toFixed(8), 12);
  const buyerId = padLeft(buyer, 30);
  const sellerId = padLeft(seller, 30);
  const bOldS = fmtFixedWidth(bOld, 6, 2);
  const bNewS = fmtFixedWidth(bNew, 6, 2);
  const sOldS = fmtFixedWidth(sOld, 6, 2);
  const sNewS = fmtFixedWidth(sNew, 6, 2);

  const line =
    `${exName} ${dt} trade of ${qStr}  ` +
    `${buyerId} ${bOldS} -> ${bNewS}    ` +
    `${sellerId} ${sOldS} -> ${sNewS}`;

  const block = document.createElement("div");
  block.className = `rowline ${exch}`;
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

