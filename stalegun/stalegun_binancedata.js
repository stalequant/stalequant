var wsBinanceOrderBook = new WebSocket(`wss://fstream.binance.com/ws/${coinParam.toLowerCase()}usdt@depth20@100ms`);
var wsBinanceAggTrade = new WebSocket(`wss://fstream.binance.com/ws/${coinParam.toLowerCase()}usdt@aggTrade`);
var wsBinanceSpotOrderBook = new WebSocket(`wss://stream.binance.com:443/ws/${coinParam.toLowerCase()}usdt@depth20@100ms`);
var wsBinanceSpotAggTrade = new WebSocket(`wss://stream.binance.com:443/ws/${coinParam.toLowerCase()}usdt@aggTrade`);

function recreateBinanceWebSockets(coin) {
    // Close existing connections
    if (wsBinanceOrderBook) wsBinanceOrderBook.close();
    if (wsBinanceAggTrade) wsBinanceAggTrade.close();
    if (wsBinanceSpotOrderBook) wsBinanceSpotOrderBook.close();
    if (wsBinanceSpotAggTrade) wsBinanceSpotAggTrade.close();
    
    // Create new connections
    wsBinanceOrderBook = new WebSocket(`wss://fstream.binance.com/ws/${coin.toLowerCase()}usdt@depth20@100ms`);
    wsBinanceAggTrade = new WebSocket(`wss://fstream.binance.com/ws/${coin.toLowerCase()}usdt@aggTrade`);
    wsBinanceSpotOrderBook = new WebSocket(`wss://stream.binance.com:443/ws/${coin.toLowerCase()}usdt@depth20@100ms`);
    wsBinanceSpotAggTrade = new WebSocket(`wss://stream.binance.com:443/ws/${coin.toLowerCase()}usdt@aggTrade`);
    
    // Reattach handlers (use coinParam which is updated before this function is called)
    wsBinanceOrderBook.onopen = function() {
        binanceConnected = true;
        updateBinanceStatus();
    };
    
    wsBinanceOrderBook.onerror = function() {
        binanceConnected = false;
        updateBinanceStatus();
    };
    
    wsBinanceOrderBook.onclose = function() {
        binanceConnected = false;
        updateBinanceStatus();
    };
    
    wsBinanceOrderBook.onmessage = function(event) {
        const message = JSON.parse(event.data);
        let venue = 'binance futures';
    
        if (message.e === "depthUpdate" && message.s === `${coinParam}USDT`) {	
            const timestamp = parseFloat(message.E);
            updateBinanceLag(timestamp)
    
            addData(venue,'bid-ask',true, timestamp, parseFloat(message.b[0][0]));
            addData(venue,'bid-ask',false, timestamp, parseFloat(message.a[0][0]));
    
            const deepBid = getDepthPrice(message.b);
            addData(venue,'$5k spread',true, timestamp, deepBid);
            const deepAsk = getDepthPrice(message.a);
            addData(venue,'$5k spread',false, timestamp, deepAsk);
            
            // Update last tick time
            const tickTime = new Date(timestamp).toLocaleTimeString();
            setStatus("lastTick", tickTime, "status-ok");
        }
    };
    
    wsBinanceAggTrade.onmessage = function(event) {
        const venue = 'binance futures';
        const message = JSON.parse(event.data);
        if (message.e === "aggTrade" && message.s === `${coinParam}USDT`) {
            const tradePrice = parseFloat(message.p);
            const tradeQuantity = parseFloat(message.q);
            const timestamp = message.T;
    
            addData(venue, 'trades', !message.m, timestamp, tradePrice, tradeQuantity);
            
            // Update last tick time
            const tickTime = new Date(timestamp).toLocaleTimeString();
            setStatus("lastTick", tickTime, "status-ok");
        }
    };
    
    wsBinanceSpotOrderBook.onmessage = function(event) {
        const venue = 'binance spot';
        const message = JSON.parse(event.data);
        const currentTime = Date.now();
        const timestamp = currentTime - binanceLag;
                    
        addData(venue,'bid-ask', true, timestamp, parseFloat(message.bids[0][0]));
        addData(venue,'bid-ask', false, timestamp, parseFloat(message.asks[0][0]));
    
        const deepBid = getDepthPrice(message.bids);
        addData(venue,'$5k spread',true, timestamp, deepBid);
        const deepAsk = getDepthPrice(message.asks);
        addData(venue,'$5k spread',false, timestamp, deepAsk);
    };
    
    wsBinanceSpotAggTrade.onmessage = function(event) {
        const venue = 'binance spot';
        const message = JSON.parse(event.data);
        if (message.e === "aggTrade" && message.s === `${coinParam}USDT`) {
            const tradePrice = parseFloat(message.p);
            const tradeQuantity = parseFloat(message.q);
            const timestamp = message.T;
            updateBinanceLag(timestamp)
    
            addData(venue, 'trades', !message.m, timestamp, tradePrice, tradeQuantity);
        }
    };
}

var binanceLag = 0;

function setStatus(id, text, klass) {
  const el = document.getElementById(id);
  if (!el) return;
  const span = el.querySelector("span") || el.appendChild(document.createElement("span"));
  span.textContent = text;
  span.className = klass;
}

var binanceConnected = false;

function updateBinanceStatus() {
  if (binanceConnected) {
    setStatus("statusBN", "connected", "status-ok");
  } else {
    setStatus("statusBN", "connecting", "status-warn");
  }
}

updateBinanceStatus(); 

function getDepthPrice(orders) {
    let sum = 0;
    let i = 0;
    while (i < orders.length) {
        sum += parseFloat(orders[i][1]) * parseFloat(orders[i][0]);
        if (sum > reqLiq) {
            return parseFloat(orders[i][0]);
        }
        i++;
    }
    return parseFloat(orders[orders.length - 1][1]) / 1.01;
}

wsBinanceOrderBook.onopen = function() {
    binanceConnected = true;
    updateBinanceStatus();
};

wsBinanceOrderBook.onerror = function() {
    binanceConnected = false;
    updateBinanceStatus();
};

wsBinanceOrderBook.onclose = function() {
    binanceConnected = false;
    updateBinanceStatus();
};

wsBinanceOrderBook.onmessage = function(event) {
    const message = JSON.parse(event.data);
let venue = 'binance futures';

    if (message.e === "depthUpdate" && message.s === `${coinParam}USDT`) {	
        const timestamp = parseFloat(message.E);
    updateBinanceLag(timestamp)

            addData(venue,'bid-ask',true, timestamp, parseFloat(message.b[0][0]));
            addData(venue,'bid-ask',false, timestamp, parseFloat(message.a[0][0]));

            const deepBid = getDepthPrice(message.b);
            addData(venue,'$5k spread',true, timestamp, deepBid);
            const deepAsk = getDepthPrice(message.a);
            addData(venue,'$5k spread',false, timestamp, deepAsk);
            
            // Update last tick time
            const tickTime = new Date(timestamp).toLocaleTimeString();
            setStatus("lastTick", tickTime, "status-ok");
    }
};

wsBinanceAggTrade.onmessage = function(event) {
const venue = 'binance futures';
    const message = JSON.parse(event.data);
    if (message.e === "aggTrade" && message.s === `${coinParam}USDT`) {
        const tradePrice = parseFloat(message.p);
        const tradeQuantity = parseFloat(message.q);
        const timestamp = message.T;

    addData(venue, 'trades', !message.m, timestamp, tradePrice, tradeQuantity); // binance Trades
    
    // Update last tick time
    const tickTime = new Date(timestamp).toLocaleTimeString();
    setStatus("lastTick", tickTime, "status-ok");
    }
};

function updateBinanceLag(timestamp){
 		    let measuredLag = Date.now() - timestamp;
		    binanceLag = binanceLag * .9 + measuredLag*.1;
}
        wsBinanceSpotOrderBook.onmessage = function(event) {
		const venue = 'binance spot';
                const message = JSON.parse(event.data);
                const currentTime = Date.now();
	        const timestamp = currentTime - binanceLag;
                    
		addData(venue,'bid-ask', true, timestamp, parseFloat(message.bids[0][0]));
                addData(venue,'bid-ask', false, timestamp, parseFloat(message.asks[0][0]));

                const deepBid = getDepthPrice(message.bids);
                addData(venue,'$5k spread',true, timestamp, deepBid);
                const deepAsk = getDepthPrice(message.asks);
                addData(venue,'$5k spread',false, timestamp, deepAsk);

        };
 
        wsBinanceSpotAggTrade.onmessage = function(event) {
	    const venue = 'binance spot';
            const message = JSON.parse(event.data);
            if (message.e === "aggTrade" && message.s === `${coinParam}USDT`) {
                const tradePrice = parseFloat(message.p);
                const tradeQuantity = parseFloat(message.q);
                const timestamp = message.T;
	        updateBinanceLag(timestamp)

	        addData(venue, 'trades', !message.m, timestamp, tradePrice, tradeQuantity); // binance Trades
            }
        }; 
 
