/* =========================
   WebSocket subscribers
========================= */
async function connectWithBackoff(url, onOpenSend, onMessage, statusId) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      setStatus(statusId, `connecting (try ${attempt})`, "status-warn");
      const ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        setStatus(statusId, "connected", "status-ok");
        try { onOpenSend(ws); } catch (e) { }
      };
      ws.onmessage = (ev) => { try { onMessage(ev.data); } catch (e) { } };
      ws.onerror = () => { };
      await new Promise((resolve) => { ws.onclose = () => resolve(); });
      setStatus(statusId, "disconnected (reconnecting)", "status-bad");
    } catch (e) {
      setStatus(statusId, "error (reconnecting)", "status-bad");
    }
    const sleepMs = Math.min(15000, 500 + Math.floor(Math.random() * 500) + attempt * 600);
    await new Promise(r => setTimeout(r, sleepMs));
  }
}

function subscribeHL() {
  const url = "wss://api-ui.hyperliquid.xyz/ws";
  const subscribeMsg = { method: "subscribe", subscription: { type: "trades", coin: "BTC" } };
  return connectWithBackoff(
    url,
    (ws) => ws.send(JSON.stringify(subscribeMsg)),
    (raw) => {
      const data = JSON.parse(raw);
      if (data.channel !== "trades") return;
      const tradeList = data.data;
      if (!Array.isArray(tradeList)) return;
      for (const tr of tradeList) {
        recordTrade("hl", tr.users?.[0], tr.users?.[1], Number(tr.sz), tr.time, tr.hash);
      }
    },
    "statusHL"
  );
}

function subscribeEdgeX() {
  const url = "wss://quote.edgex.exchange/api/v1/public/ws";
  const subscribeMsg = { type: "subscribe", channel: "trades.10000001" };
  return connectWithBackoff(
    url,
    (ws) => ws.send(JSON.stringify(subscribeMsg)),
    (raw) => {
      const data = JSON.parse(raw);
      const content = data.content || {};
      const channel = content.channel || "";
      if (!channel.startsWith("trades.")) return;
      const trades = content.data || [];
      if (!Array.isArray(trades)) return;
      for (const tr of trades) {
        const isBuyerMaker = !!tr.isBuyerMaker;
        const maker = tr.makerAccountId;
        const taker = tr.takerAccountId;
        const buyer = isBuyerMaker ? maker : taker;
        const seller = isBuyerMaker ? taker : maker;
        recordTrade("ex", buyer, seller, Number(tr.size), tr.time, tr.ticketId);
      }
    },
    "statusEX"
  );
}

function subscribeLighter() {
  const url = "wss://mainnet.zklighter.elliot.ai/stream?readonly=true";
  const subscribeMsg = { type: "subscribe", channel: "trade/1" };
  return connectWithBackoff(
    url,
    (ws) => ws.send(JSON.stringify(subscribeMsg)),
    (raw) => {
      const data = JSON.parse(raw);
      const trades = data.trades || [];
      if (!Array.isArray(trades)) return;
      for (const tr of trades) {
        recordTrade("li", tr.bid_account_id, tr.ask_account_id, Number(tr.size), tr.timestamp, tr.tx_hash);
      }
    },
    "statusLI"
  );
}

