/* =========================
   Coin change handler
========================= */

function changeCoin(newCoin) {
    if (!newCoin || newCoin === coinParam) return;
    
    const coinUpper = newCoin.toUpperCase();
    if (!coins.includes(coinUpper)) {
        alert(`Invalid coin: ${coinUpper}. Please select a valid coin.`);
        const coinInput = document.getElementById('coinInput');
        if (coinInput) {
            coinInput.value = '';
            coinInput.placeholder = coinParam;
        }
        return;
    }
    
    coinParam = coinUpper;
    
    // Clear chart data
    Object.keys(venueDtypeMapping).forEach(key => {
        venueDtypeMapping[key].data = [];
    });
    
    // Clear trade tape
    const tapeBox = document.getElementById("tapeBox");
    if (tapeBox) {
        tapeBox.innerHTML = '';
        const tapeCountEl = document.getElementById("tapeCount");
        if (tapeCountEl) tapeCountEl.textContent = "0";
        // Reset tape line count if accessible
        if (typeof tapeLineCount !== 'undefined') {
            tapeLineCount = 0;
        }
    }
    
    // Reset first call flag
    hyperliquidFirstCall = true;
    
    // Update Hyperliquid subscription
    if (typeof subscribeHyperliquid === 'function') {
        subscribeHyperliquid(coinParam);
    }
    
    // Recreate Binance WebSockets
    if (typeof recreateBinanceWebSockets === 'function') {
        recreateBinanceWebSockets(coinParam);
    }
    
    // Update URL without reload
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('coin', coinParam);
    window.history.pushState({}, '', newUrl);
    
    // Update input placeholder and buttons
    const coinInput = document.getElementById('coinInput');
    if (coinInput) {
        coinInput.value = '';
        coinInput.placeholder = coinParam;
    }
    document.querySelectorAll('.coin-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.coin === coinParam);
    });
    
    // Update chart
    coinChart.update();
}

