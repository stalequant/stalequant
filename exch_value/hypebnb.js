/* =========================
   HYPE/BNB Comparison Charts
========================= */
const HypeBnb = (function () {
  // Helper function for timestamps
  function stamp() {
    return new Date().toLocaleString();
  }

  // Data storage: timestamp -> {hypePrice, bnbPrice, hlBtcVolume, binanceBtcVolume, ratios}
  const dataPoints = new Map(); // timestamp -> data object

  // Fetch HYPE price from Hyperliquid perp API (current)
  async function fetchHypePrice() {
    try {
      const url = "https://api.hyperliquid.xyz/info";
      const body = { type: "metaAndAssetCtxs" };
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) throw new Error("HTTP " + response.status);
      
      const data = await response.json();
      
      // Find HYPE in the universe
      const universe = data[0].universe;
      const assetCtxs = data[1];
      
      for (let i = 0; i < universe.length; i++) {
        if (universe[i].name === "HYPE") {
          const price = parseFloat(assetCtxs[i].markPx);
          return price;
        }
      }
      throw new Error("HYPE not found in universe");
    } catch (error) {
      console.error("[fetchHypePrice] Error:", error);
      throw error;
    }
  }

  // Fetch historical HYPE prices (daily for past year)
  async function fetchHypePriceHistory() {
    const prices = new Map();
    
    try {
      // Fetch daily candles from Hyperliquid
      // Calculate timestamp for 365 days ago
      const now = Date.now();
      const daysAgo365 = now - (365 * 24 * 60 * 60 * 1000);
      
      const url = "https://api.hyperliquid.xyz/info";
      // Try different API formats - Hyperliquid might use different structures
      const body1 = {
        type: "candleSnapshot",
        req: {
          coin: "HYPE",
          interval: "1d",
          startTime: daysAgo365,
          endTime: now
        }
      };
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body1)
      });
      
      if (!response.ok) throw new Error("HTTP " + response.status);
      
      const data = await response.json();
      
      // Hyperliquid candle format might be: {candles: [[time, open, high, low, close, volume], ...]}
      // or just an array of candles
      let candles = [];
      if (Array.isArray(data)) {
        candles = data;
      } else if (data && data.candles) {
        candles = data.candles;
      } else if (data && Array.isArray(data.data)) {
        candles = data.data;
      }
      
      
      for (const candle of candles) {
        // Candle format might be: [timestamp_ms, open, high, low, close, volume]
        // or {time, open, high, low, close, volume}
        let timestamp, closePrice;
        
        if (Array.isArray(candle)) {
          timestamp = candle[0]; // timestamp in ms
          closePrice = parseFloat(candle[4]); // close price
        } else if (typeof candle === 'object' && candle !== null) {
          timestamp = candle.time || candle.t;
          closePrice = parseFloat(candle.close || candle.c);
        }
        
        if (timestamp && Number.isFinite(closePrice) && closePrice > 0) {
          prices.set(timestamp, closePrice);
          if (prices.size <= 3) {
          }
        }
      }
      
      if (prices.size > 0) {
        const sorted = Array.from(prices.entries()).sort((a, b) => a[0] - b[0]);
      }
      
      return prices;
    } catch (error) {
      console.error("[fetchHypePriceHistory] Error:", error);
      // Fallback: use current price for all days if historical fetch fails
      try {
        const currentPrice = await fetchHypePrice();
        const now = Date.now();
        for (let daysAgo = 0; daysAgo < 365; daysAgo++) {
          const timestamp = now - (daysAgo * 24 * 60 * 60 * 1000);
          const dayStart = new Date(timestamp);
          dayStart.setUTCHours(0, 0, 0, 0);
          prices.set(dayStart.getTime(), currentPrice);
        }
      } catch (fallbackError) {
        console.error("[fetchHypePriceHistory] Fallback also failed:", fallbackError);
      }
      return prices;
    }
  }

  // Fetch BNB price from Binance perp API (current)
  async function fetchBnbPrice() {
    try {
      const url = "https://fapi.binance.com/fapi/v1/ticker/price?symbol=BNBUSDT";
      const response = await fetch(url);
      
      if (!response.ok) throw new Error("HTTP " + response.status);
      
      const data = await response.json();
      const price = parseFloat(data.price);
      return price;
    } catch (error) {
      console.error("[fetchBnbPrice] Error:", error);
      throw error;
    }
  }

  // Fetch historical BNB prices (daily for past year)
  async function fetchBnbPriceHistory() {
    const prices = new Map();
    
    try {
      // Fetch daily candles for BNB (limit 1000 covers ~2.7 years, we'll use 365)
      const url = "https://fapi.binance.com/fapi/v1/klines?symbol=BNBUSDT&interval=1d&limit=365";
      const response = await fetch(url);
      
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      
      // OHLCV: [timestamp, open, high, low, close, volume, ...]
      for (const candle of data) {
        const timestamp = candle[0]; // Opening time
        const closePrice = parseFloat(candle[4]); // Close price
        prices.set(timestamp, closePrice);
      }
      
      return prices;
    } catch (error) {
      console.error("[fetchBnbPriceHistory] Error:", error);
      return prices;
    }
  }

  // Fetch HL BTC volume from Hyperliquid perp API (current)
  async function fetchHlBtcVolume() {
    try {
      const url = "https://api.hyperliquid.xyz/info";
      const body = { type: "metaAndAssetCtxs" };
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) throw new Error("HTTP " + response.status);
      
      const data = await response.json();
      
      // Find BTC in the universe
      const universe = data[0].universe;
      const assetCtxs = data[1];
      
      for (let i = 0; i < universe.length; i++) {
        if (universe[i].name === "BTC") {
          // dayNtlVlm is daily notional volume
          const volume = parseFloat(assetCtxs[i].dayNtlVlm);
          return volume;
        }
      }
      throw new Error("BTC not found in universe");
    } catch (error) {
      console.error("[fetchHlBtcVolume] Error:", error);
      throw error;
    }
  }

  // Fetch historical HL BTC volumes (daily for past year, will calculate rolling weekly)
  async function fetchHlBtcVolumeHistory() {
    const dailyVolumes = new Map();
    
    try {
      // Try to fetch historical daily candles for BTC from Hyperliquid
      const now = Date.now();
      const daysAgo365 = now - (365 * 24 * 60 * 60 * 1000);
      
      const url = "https://api.hyperliquid.xyz/info";
      const body = {
        type: "candleSnapshot",
        req: {
          coin: "BTC",
          interval: "1d",
          startTime: daysAgo365,
          endTime: now
        }
      };
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Parse candle data
        let candles = [];
        if (Array.isArray(data)) {
          candles = data;
        } else if (data && data.candles) {
          candles = data.candles;
        } else if (data && Array.isArray(data.data)) {
          candles = data.data;
        }
        
        
        // Candle format: [timestamp_ms, open, high, low, close, volume]
        // Volume is notional volume (volume * price)
        for (const candle of candles) {
          let timestamp, volume;
          
          if (Array.isArray(candle)) {
            timestamp = candle[0]; // timestamp in ms
            const baseVolume = parseFloat(candle[5]); // base volume
            const closePrice = parseFloat(candle[4]); // close price
            volume = baseVolume * closePrice; // notional volume
          } else if (typeof candle === 'object' && candle !== null) {
            timestamp = candle.time || candle.t;
            const baseVolume = parseFloat(candle.volume || candle.v);
            const closePrice = parseFloat(candle.close || candle.c);
            volume = baseVolume * closePrice;
          }
          
          if (timestamp && Number.isFinite(volume) && volume > 0) {
            dailyVolumes.set(timestamp, volume);
            if (dailyVolumes.size <= 3) {
            }
          }
        }
        
      } else {
        throw new Error("Historical fetch failed");
      }
    } catch (error) {
      console.error("[fetchHlBtcVolumeHistory] Error fetching historical:", error);
      // Fallback: use current volume for all days
      try {
        const currentVolume = await fetchHlBtcVolume();
        const now = Date.now();
        for (let daysAgo = 0; daysAgo < 365; daysAgo++) {
          const timestamp = now - (daysAgo * 24 * 60 * 60 * 1000);
          const dayStart = new Date(timestamp);
          dayStart.setUTCHours(0, 0, 0, 0);
          dailyVolumes.set(dayStart.getTime(), currentVolume);
        }
      } catch (fallbackError) {
        console.error("[fetchHlBtcVolumeHistory] Fallback also failed:", fallbackError);
      }
    }
    
    // Calculate rolling 7-day weekly volume
    const weeklyVolumes = new Map();
    const sortedTimestamps = Array.from(dailyVolumes.keys()).sort();
    
    
    for (let i = 0; i < sortedTimestamps.length; i++) {
      const currentTs = sortedTimestamps[i];
      let weeklySum = 0;
      
      // Sum volumes for the past 7 days (including current day)
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        const vol = dailyVolumes.get(sortedTimestamps[j]);
        if (vol != null && Number.isFinite(vol)) {
          weeklySum += vol;
        }
      }
      
      weeklyVolumes.set(currentTs, weeklySum);
      
      if (i < 3 || i === sortedTimestamps.length - 1) {
      }
    }
    
    if (weeklyVolumes.size > 0) {
      const sorted = Array.from(weeklyVolumes.entries()).sort((a, b) => a[0] - b[0]);
    }
    
    return weeklyVolumes;
  }

  // Fetch Binance BTC volume from candles (current)
  async function fetchBinanceBtcVolume() {
    try {
      const url = "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=1";
      const response = await fetch(url);
      
      if (!response.ok) throw new Error("HTTP " + response.status);
      
      const data = await response.json();
      
      if (!data || data.length === 0) throw new Error("No data");
      
      // OHLCV format: [timestamp, open, high, low, close, volume, ...]
      const candle = data[data.length - 1];
      const volume = parseFloat(candle[5]); // volume in base asset
      const closePrice = parseFloat(candle[4]); // close price
      
      // Convert to notional volume (volume * price)
      const notionalVolume = volume * closePrice;
      return notionalVolume;
    } catch (error) {
      console.error("[fetchBinanceBtcVolume] Error:", error);
      throw error;
    }
  }

  // Fetch historical Binance BTC volumes (daily for past year, will calculate rolling weekly)
  async function fetchBinanceBtcVolumeHistory() {
    const dailyVolumes = new Map();
    
    try {
      // Fetch daily candles for BTC (limit 1000 covers ~2.7 years, we'll use 365)
      const url = "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=365";
      const response = await fetch(url);
      
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      
      // OHLCV: [timestamp, open, high, low, close, volume, ...]
      for (const candle of data) {
        const timestamp = candle[0]; // Opening time
        const volume = parseFloat(candle[5]); // volume in base asset
        const closePrice = parseFloat(candle[4]); // close price
        const notionalVolume = volume * closePrice;
        dailyVolumes.set(timestamp, notionalVolume);
      }
      
      // Calculate rolling 7-day weekly volume
      const weeklyVolumes = new Map();
      const sortedTimestamps = Array.from(dailyVolumes.keys()).sort();
      
      for (let i = 0; i < sortedTimestamps.length; i++) {
        const currentTs = sortedTimestamps[i];
        let weeklySum = 0;
        let daysCounted = 0;
        
        // Sum volumes for the past 7 days (including current day)
        for (let j = Math.max(0, i - 6); j <= i; j++) {
          const vol = dailyVolumes.get(sortedTimestamps[j]);
          if (vol != null) {
            weeklySum += vol;
            daysCounted++;
          }
        }
        
        weeklyVolumes.set(currentTs, weeklySum);
      }
      
      return weeklyVolumes;
    } catch (error) {
      console.error("[fetchBinanceBtcVolumeHistory] Error:", error);
      return new Map();
    }
  }

  function calculateRatios(data) {
    const ratios = {};
    
    // Calculate FDV values
    const hypeFdv = data.hypePrice ? data.hypePrice * 1e9 : null; // HYPE price * 1B
    const bnbFdv = data.bnbPrice ? data.bnbPrice * 137.73e6 : null; // BNB price * 137.73M
    
    // FDV per weekly volume ratios
    if (hypeFdv && data.hlBtcVolume && data.hlBtcVolume > 0) {
      ratios.hypePvRatio = hypeFdv / data.hlBtcVolume;
    }
    
    if (bnbFdv && data.binanceBtcVolume && data.binanceBtcVolume > 0) {
      ratios.bnbPvRatio = bnbFdv / data.binanceBtcVolume;
    }
    
    // Exchange ratio (HYPE FDV/HL volume) / (BNB FDV/Binance volume)
    if (ratios.hypePvRatio && ratios.bnbPvRatio && ratios.bnbPvRatio > 0) {
      ratios.exchPvRatio = ratios.hypePvRatio / ratios.bnbPvRatio;
    }
    
    return ratios;
  }

  function renderChart1() {
    
    if (dataPoints.size === 0) {
      Plotly.react("chart1", [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(231,236,255,.92)" }
      }, { responsive: true, displayModeBar: false, displaylogo: false });
      return;
    }

    const sortedData = Array.from(dataPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({ ts, ...data }));


    const hypeData = sortedData
      .filter(d => d.hypePrice != null)
      .map(d => ({ ts: new Date(d.ts), price: d.hypePrice }));
    
    const bnbData = sortedData
      .filter(d => d.bnbPrice != null)
      .map(d => ({ ts: new Date(d.ts), price: d.bnbPrice }));

    if (hypeData.length > 0) {
    }
    if (bnbData.length > 0) {
    }

    const traces = [];

    // BNB FDV (scaled by 137.73M) - left axis
    if (bnbData.length > 0) {
      const x = bnbData.map(d => d.ts);
      const y = bnbData.map(d => d.price * 137.73e6); // Scale by 137.73M
      traces.push({
        x: x,
        y: y,
        type: "scatter",
        mode: "lines",
        name: "BNB FDV",
        yaxis: "y",
        line: { color: "#ff7f0e", width: 2 },
        hoverinfo: "skip"
      });
    }

    // HYPE FDV (scaled by 1B) - right axis
    if (hypeData.length > 0) {
      const x = hypeData.map(d => d.ts);
      // Scale HYPE price by 1 billion (1,000,000,000)
      const HYPE_FDV_SCALE = 1000000000; // 1B = 1,000,000,000
      
      const y = hypeData.map((d, idx) => {
        const rawPrice = parseFloat(d.price);
        if (!Number.isFinite(rawPrice)) {
          console.error("[renderChart1] Invalid HYPE price at index", idx, ":", d.price);
          return null;
        }
        const fdv = rawPrice * HYPE_FDV_SCALE;
        const fdvBillions = fdv / 1e9; // Convert to billions
        if (idx < 5 || idx === hypeData.length - 1) {
        }
        return fdvBillions;
      }).filter(v => v !== null);
      
      // Filter x to match filtered y
      const xFiltered = x.slice(0, y.length);
      
      if (y.length > 0) {
      }
      
      traces.push({
        x: xFiltered,
        y: y,
        type: "scatter",
        mode: "lines",
        name: "HYPE FDV",
        yaxis: "y2",
        line: { color: "#50D2C1", width: 2 },
        hoverinfo: "skip"
      });
    }


    const layout = {
      font: { color: "rgba(231,236,255,.92)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 400,
      width: null, // Use container width
      margin: { l: 60, r: 80, t: 50, b: 60 },
      xaxis: { title: "Time", gridcolor: "rgba(255,255,255,.08)" },
      yaxis: { 
        title: "BNB FDV ($)", 
        gridcolor: "rgba(255,255,255,.08)",
        side: "left"
      },
      yaxis2: {
        title: "HYPE FDV ($B)",
        gridcolor: "rgba(255,255,255,.08)",
        side: "right",
        overlaying: "y",
        tickformat: ".2f"
      },
      legend: { orientation: "h", yanchor: "bottom", y: 1.02 },
      hovermode: false
    };

    try {
      Plotly.react("chart1", traces, layout, {
        responsive: true,
        displayModeBar: false,
        displaylogo: false
      });
    } catch (error) {
      console.error("[renderChart1] Plotly.react error:", error);
    }

    document.getElementById("chart1Badge").textContent = "Updated " + stamp();
  }

  function renderChart2() {
    
    if (dataPoints.size === 0) {
      Plotly.react("chart2", [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(231,236,255,.92)" }
      }, { responsive: true, displayModeBar: false, displaylogo: false });
      return;
    }

    const sortedData = Array.from(dataPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({ ts, ...data }));

    const hlVolumeData = sortedData
      .filter(d => d.hlBtcVolume != null)
      .map(d => ({ ts: new Date(d.ts), volume: d.hlBtcVolume }));
    
    const binanceVolumeData = sortedData
      .filter(d => d.binanceBtcVolume != null)
      .map(d => ({ ts: new Date(d.ts), volume: d.binanceBtcVolume }));

    
    if (hlVolumeData.length > 0) {
    }
    
    if (binanceVolumeData.length > 0) {
    }

    const traces = [];

    // Binance BTC Volume - left axis
    if (binanceVolumeData.length > 0) {
      const x = binanceVolumeData.map(d => d.ts);
      const y = binanceVolumeData.map(d => d.volume);
      traces.push({
        x: x,
        y: y,
        type: "scatter",
        mode: "lines",
        name: "Binance BTC Volume",
        yaxis: "y",
        line: { color: "#ff7f0e", width: 2 },
        hoverinfo: "skip"
      });
    }

    // HL BTC Volume - right axis
    if (hlVolumeData.length > 0) {
      const x = hlVolumeData.map(d => d.ts);
      const y = hlVolumeData.map(d => d.volume);
      traces.push({
        x: x,
        y: y,
        type: "scatter",
        mode: "lines",
        name: "HL BTC Volume",
        yaxis: "y2",
        line: { color: "#50D2C1", width: 2 },
        hoverinfo: "skip"
      });
    }

    const layout = {
      font: { color: "rgba(231,236,255,.92)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 400,
      width: null,
      margin: { l: 60, r: 80, t: 50, b: 60 },
      xaxis: { title: "Time", gridcolor: "rgba(255,255,255,.08)" },
      yaxis: { 
        title: "Binance BTC Volume ($)", 
        gridcolor: "rgba(255,255,255,.08)",
        side: "left"
      },
      yaxis2: {
        title: "HL BTC Volume ($)",
        gridcolor: "rgba(255,255,255,.08)",
        side: "right",
        overlaying: "y"
      },
      legend: { orientation: "h", yanchor: "bottom", y: 1.02 },
      hovermode: false
    };

    Plotly.react("chart2", traces, layout, {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    });

    document.getElementById("chart2Badge").textContent = "Updated " + stamp();
  }

  function renderChart3() {
    
    if (dataPoints.size === 0) {
      Plotly.react("chart3", [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(231,236,255,.92)" }
      }, { responsive: true, displayModeBar: false, displaylogo: false });
      return;
    }

    const sortedData = Array.from(dataPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({ ts, ...data }));

    // Calculate volume ratio: HL volume / Binance volume
    const volumeRatioData = sortedData
      .filter(d => d.hlBtcVolume != null && d.binanceBtcVolume != null && d.binanceBtcVolume > 0)
      .map(d => {
        const volumeRatio = d.hlBtcVolume / d.binanceBtcVolume;
        return { ts: new Date(d.ts), ratio: volumeRatio };
      });

    // Calculate FDV ratio: HYPE FDV / BNB FDV
    const fdvRatioData = sortedData
      .filter(d => d.hypePrice != null && d.bnbPrice != null && d.bnbPrice > 0)
      .map(d => {
        const hypeFdv = d.hypePrice * 1e9; // HYPE price * 1B
        const bnbFdv = d.bnbPrice * 137.73e6; // BNB price * 137.73M
        const fdvRatio = hypeFdv / bnbFdv;
        return { ts: new Date(d.ts), ratio: fdvRatio };
      });

    const traces = [];

    // Volume ratio - left axis (convert to percentage points)
    if (volumeRatioData.length > 0) {
      traces.push({
        x: volumeRatioData.map(d => d.ts),
        y: volumeRatioData.map(d => d.ratio * 100), // Convert to percentage points
        type: "scatter",
        mode: "lines",
        name: "Volume Ratio (HL / Binance)",
        yaxis: "y",
        line: { color: "#3498db", width: 2 },
        hoverinfo: "skip"
      });
    }

    // FDV ratio - right axis (convert to percentage points)
    if (fdvRatioData.length > 0) {
      traces.push({
        x: fdvRatioData.map(d => d.ts),
        y: fdvRatioData.map(d => d.ratio * 100), // Convert to percentage points
        type: "scatter",
        mode: "lines",
        name: "FDV Ratio (HYPE / BNB)",
        yaxis: "y2",
        line: { color: "#2ecc71", width: 2 },
        hoverinfo: "skip"
      });
    }

    const layout = {
      font: { color: "rgba(231,236,255,.92)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 400,
      width: null,
      margin: { l: 60, r: 80, t: 50, b: 60 },
      xaxis: { title: "Time", gridcolor: "rgba(255,255,255,.08)" },
      yaxis: { 
        title: "Volume Ratio (HL / Binance, %)", 
        gridcolor: "rgba(255,255,255,.08)",
        side: "left",
        tickformat: ".0f"
      },
      yaxis2: {
        title: "FDV Ratio (HYPE / BNB, %)",
        gridcolor: "rgba(255,255,255,.08)",
        side: "right",
        overlaying: "y",
        tickformat: ".0f"
      },
      legend: { orientation: "h", yanchor: "bottom", y: 1.02 },
      hovermode: false
    };

    Plotly.react("chart3", traces, layout, {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    });

    document.getElementById("chart3Badge").textContent = "Updated " + stamp();
  }

  function renderChart4() {
    
    if (dataPoints.size === 0) {
      Plotly.react("chart4", [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(231,236,255,.92)" }
      }, { responsive: true, displayModeBar: false, displaylogo: false });
      return;
    }

    const sortedData = Array.from(dataPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({ ts, ...data }));

    // Calculate HYPE FDV / HL BTC perp volume
    // Skip first 6 days to ensure full 7-day rolling window
    const hypePvData = sortedData
      .filter((d, idx) => idx >= 6 && d.hypePrice != null && d.hlBtcVolume != null && d.hlBtcVolume > 0)
      .map(d => {
        const hypeFdv = d.hypePrice * 1e9; // HYPE price * 1B
        const ratio = hypeFdv / d.hlBtcVolume;
        return { ts: new Date(d.ts), ratio };
      });

    // Calculate BNB FDV / Binance BTC perp volume
    // Skip first 6 days to ensure full 7-day rolling window
    const bnbPvData = sortedData
      .filter((d, idx) => idx >= 6 && d.bnbPrice != null && d.binanceBtcVolume != null && d.binanceBtcVolume > 0)
      .map(d => {
        const bnbFdv = d.bnbPrice * 137.73e6; // BNB price * 137.73M
        const ratio = bnbFdv / d.binanceBtcVolume;
        return { ts: new Date(d.ts), ratio };
      });

    if (hypePvData.length > 0) {
    }
    if (bnbPvData.length > 0) {
    }

    const traces = [];

    if (hypePvData.length > 0) {
      traces.push({
        x: hypePvData.map(d => d.ts),
        y: hypePvData.map(d => d.ratio),
        type: "scatter",
        mode: "lines",
        name: "HYPE FDV / HL BTC perp volume",
        line: { color: "#50D2C1", width: 2 },
        hoverinfo: "skip"
      });
    }

    if (bnbPvData.length > 0) {
      traces.push({
        x: bnbPvData.map(d => d.ts),
        y: bnbPvData.map(d => d.ratio),
        type: "scatter",
        mode: "lines",
        name: "BNB FDV / Binance BTC perp volume",
        line: { color: "#ff7f0e", width: 2 },
        hoverinfo: "skip"
      });
    }

    const layout = {
      font: { color: "rgba(231,236,255,.92)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      height: 400,
      width: null,
      margin: { l: 60, r: 20, t: 50, b: 60 },
      xaxis: { title: "Time", gridcolor: "rgba(255,255,255,.08)" },
      yaxis: { 
        title: "$FDV per weekly BTC perp volume", 
        gridcolor: "rgba(255,255,255,.08)",
        tickformat: ",.0f",
        dtick: 1
      },
      legend: { orientation: "h", yanchor: "bottom", y: 1.02 },
      hovermode: false
    };

    Plotly.react("chart4", traces, layout, {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    });

    document.getElementById("chart4Badge").textContent = "Updated " + stamp();
  }

  function renderChart5() {
    
    if (dataPoints.size === 0) {
      Plotly.react("chart5", [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(231,236,255,.92)" }
      }, { responsive: true, displayModeBar: false, displaylogo: false });
      return;
    }

    const sortedData = Array.from(dataPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({ ts, ...data }));

    // Skip first 6 days (need full weekly volume) and last 14 days (need future price)
    const validData = sortedData.slice(6, sortedData.length - 14);

    // Create maps for quick price lookup by timestamp
    const hypePriceMap = new Map();
    const bnbPriceMap = new Map();
    sortedData.forEach(d => {
      if (d.hypePrice != null) {
        hypePriceMap.set(d.ts, d.hypePrice);
      }
      if (d.bnbPrice != null) {
        bnbPriceMap.set(d.ts, d.bnbPrice);
      }
    });

    const scatterPoints = [];
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    validData.forEach((d, idx) => {
      // Calculate exchange ratio: (HYPE FDV/HL volume) / (BNB FDV/Binance volume)
      let exchangeRatio = null;
      if (d.hypePrice && d.bnbPrice && d.hlBtcVolume && d.binanceBtcVolume && 
          d.hlBtcVolume > 0 && d.binanceBtcVolume > 0 && d.bnbPrice > 0) {
        const hypeFdv = d.hypePrice * 1e9; // HYPE price * 1B
        const bnbFdv = d.bnbPrice * 137.73e6; // BNB price * 137.73M
        const hypePvRatio = hypeFdv / d.hlBtcVolume;
        const bnbPvRatio = bnbFdv / d.binanceBtcVolume;
        if (bnbPvRatio > 0) {
          exchangeRatio = hypePvRatio / bnbPvRatio;
        }
      }

      // Calculate 14-day forward relative price change (HYPE/BNB ratio change)
      let priceChange = null;
      const currentHypePrice = d.hypePrice;
      const currentBnbPrice = d.bnbPrice;
      const futureTs = d.ts + fourteenDaysMs;
      
      // Find the closest future prices (within ±2 days window for flexibility)
      let futureHypePrice = null;
      let futureBnbPrice = null;
      let closestTs = null;
      let minDiff = Infinity;
      
      for (const [ts, hypePrice] of hypePriceMap.entries()) {
        const diff = Math.abs(ts - futureTs);
        // Look for price within ±2 days of target
        if (diff < (2 * 24 * 60 * 60 * 1000) && diff < minDiff) {
          minDiff = diff;
          futureHypePrice = hypePrice;
          closestTs = ts;
        }
      }
      
      // Find BNB price at the same timestamp
      if (closestTs != null) {
        futureBnbPrice = bnbPriceMap.get(closestTs);
      }
      
      if (currentHypePrice != null && currentBnbPrice != null && 
          futureHypePrice != null && futureBnbPrice != null && 
          currentBnbPrice > 0 && futureBnbPrice > 0) {
        // Calculate HYPE/BNB ratio change
        const currentRatio = currentHypePrice / currentBnbPrice;
        const futureRatio = futureHypePrice / futureBnbPrice;
        priceChange = ((futureRatio - currentRatio) / currentRatio) * 100; // Percentage change in ratio
        if (idx < 3) {
        }
      }

      if (exchangeRatio != null && priceChange != null) {
        const dayStr = new Date(d.ts).toISOString().split('T')[0];
        scatterPoints.push({
          dayStr,
          exchangeRatio,
          priceChange,
          ts: d.ts
        });
      }
    });

    // Group by day (take last point of each day), but preserve timestamp for sorting
    const dailyPoints = new Map();
    scatterPoints.forEach(point => {
      // Keep the point with the latest timestamp for each day
      const existing = dailyPoints.get(point.dayStr);
      if (!existing || point.ts > existing.ts) {
        dailyPoints.set(point.dayStr, point);
      }
    });


    const currentDate = new Date();
    const currentDayStr = currentDate.toISOString().split('T')[0];

    // Sort daily points by timestamp to get the rightmost point
    const sortedDailyPoints = Array.from(dailyPoints.values()).sort((a, b) => a.ts - b.ts);
    const rightmostPoint = sortedDailyPoints.length > 0 ? sortedDailyPoints[sortedDailyPoints.length - 1] : null;

    const regularX = [];
    const regularY = [];
    const currentX = [];
    const currentY = [];

    sortedDailyPoints.forEach(point => {
      if (point.dayStr === currentDayStr) {
        currentX.push(point.exchangeRatio);
        currentY.push(point.priceChange);
      } else {
        regularX.push(point.exchangeRatio);
        regularY.push(point.priceChange);
      }
    });


    // Calculate linear regression for all points (regular + current) using log(x)
    const allX = [...regularX, ...currentX];
    const allY = [...regularY, ...currentY];
    
    // Transform x to log scale for regression (filter out non-positive values)
    const allLogX = allX.filter(x => x > 0).map(x => Math.log(x));
    const allYFiltered = allY.filter((y, i) => allX[i] > 0);
    
    let slope = 0;
    let intercept = 0;
    let currentXValue = null;
    let fitYAtCurrentX = null;
    
    if (allLogX.length >= 2) {
      // Linear regression: y = slope * log(x) + intercept
      const n = allLogX.length;
      const sumLogX = allLogX.reduce((a, b) => a + b, 0);
      const sumY = allYFiltered.reduce((a, b) => a + b, 0);
      const sumLogXY = allLogX.reduce((sum, logX, i) => sum + logX * allYFiltered[i], 0);
      const sumLogXX = allLogX.reduce((sum, logX) => sum + logX * logX, 0);
      
      const denominator = n * sumLogXX - sumLogX * sumLogX;
      if (Math.abs(denominator) > 1e-10) {
        slope = (n * sumLogXY - sumLogX * sumY) / denominator;
        intercept = (sumY - slope * sumLogX) / n;
      }
      
      
      // Get current x value from the rightmost point (most recent by timestamp)
      // Use the exchange ratio from the rightmost point we identified earlier
      if (rightmostPoint && rightmostPoint.exchangeRatio > 0) {
        currentXValue = rightmostPoint.exchangeRatio;
      } else if (allX.length > 0) {
        // Fallback: use the last point from allX (which should be sorted by timestamp now)
        const validXValues = allX.filter(x => x > 0);
        if (validXValues.length > 0) {
          currentXValue = validXValues[validXValues.length - 1];
        }
      }
      
      // Fallback: if no plotted points, calculate from most recent valid data
      if (currentXValue == null || currentXValue <= 0) {
        // Find the most recent valid data point (from validData, not the full sortedData)
        for (let i = validData.length - 1; i >= 0; i--) {
          const d = validData[i];
          if (d.hypePrice && d.bnbPrice && d.hlBtcVolume && d.binanceBtcVolume && 
              d.hlBtcVolume > 0 && d.binanceBtcVolume > 0 && d.bnbPrice > 0) {
            const hypeFdv = d.hypePrice * 1e9;
            const bnbFdv = d.bnbPrice * 137.73e6;
            const hypePvRatio = hypeFdv / d.hlBtcVolume;
            const bnbPvRatio = bnbFdv / d.binanceBtcVolume;
            if (bnbPvRatio > 0) {
              currentXValue = hypePvRatio / bnbPvRatio;
              break;
            }
          }
        }
      }
      
      if (currentXValue != null && currentXValue > 0) {
        const logCurrentX = Math.log(currentXValue);
        fitYAtCurrentX = slope * logCurrentX + intercept;
      }
    }

    const traces = [];

    // Add horizontal line at y=0
    const validXForZero = allX.filter(x => x > 0);
    if (validXForZero.length > 0) {
      const minX = Math.min(...validXForZero);
      const maxX = Math.max(...validXForZero);
      traces.push({
        x: [minX, maxX],
        y: [0, 0],
        type: "scatter",
        mode: "lines",
        name: "Zero Line",
        line: { color: "white", width: 3 },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    // Add scatter points
    if (regularX.length > 0) {
      traces.push({
        x: regularX,
        y: regularY,
        type: "scatter",
        mode: "markers",
        name: "Daily",
        marker: { color: "lightblue", size: 8, opacity: 0.5 },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    if (currentX.length > 0) {
      traces.push({
        x: currentX,
        y: currentY,
        type: "scatter",
        mode: "markers",
        name: "Current Day",
        marker: {
          color: "red",
          size: 15,
          opacity: 0.5,
          line: { width: 2, color: "white" }
        },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    // Add linear fit line (using log scale for x)
    if (allX.length >= 2 && slope !== 0) {
      const validX = allX.filter(x => x > 0);
      if (validX.length >= 2) {
        const minX = Math.min(...validX);
        const maxX = Math.max(...validX);
        // Generate points for the fit line using log scale
        const numPoints = 100;
        const fitX = [];
        const fitY = [];
        for (let i = 0; i <= numPoints; i++) {
          const x = minX * Math.pow(maxX / minX, i / numPoints);
          const logX = Math.log(x);
          const y = slope * logX + intercept;
          fitX.push(x);
          fitY.push(y);
        }
        
        traces.push({
          x: fitX,
          y: fitY,
          type: "scatter",
          mode: "lines",
          name: "Best Fit Line",
          line: { color: "white", width: 2, dash: "dash" },
          showlegend: true,
          hoverinfo: "skip"
        });
      }
    }

    // Add black vertical line at current x value with white outline
    if (currentXValue != null && allY.length > 0) {
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);
      const yRange = maxY - minY;
      const lineY = [minY - yRange * 0.1, maxY + yRange * 0.1]; // Extend slightly beyond data range
      
      // Add white outline line (thicker, behind)
      traces.push({
        x: [currentXValue, currentXValue],
        y: lineY,
        type: "scatter",
        mode: "lines",
        name: "Current X Outline",
        line: { color: "white", width: 5 },
        showlegend: false,
        hoverinfo: "skip"
      });
      
      // Add black line (thinner, on top)
      traces.push({
        x: [currentXValue, currentXValue],
        y: lineY,
        type: "scatter",
        mode: "lines",
        name: "Current X",
        line: { color: "black", width: 3 },
        showlegend: false,
        hoverinfo: "skip"
      });
      
      // Add circle at intersection of vertical line and linear fit
      if (fitYAtCurrentX != null) {
        traces.push({
          x: [currentXValue],
          y: [fitYAtCurrentX],
          type: "scatter",
          mode: "markers",
          name: "Intersection",
          marker: {
            color: "black",
            size: 12,
            line: { width: 2, color: "white" },
            symbol: "circle"
          },
          showlegend: false,
          hoverinfo: "skip"
        });
      }
    }

    // Prepare chart title with current ratio and predicted return
    let chartTitle = "";
    if (currentXValue != null && fitYAtCurrentX != null) {
      chartTitle = `HYPE relative value: ${currentXValue.toFixed(6)} | Predicted 14 day return on HYPE/BNB: ${fitYAtCurrentX.toFixed(2)}%`;
    }

    const layout = {
      font: { color: "rgba(231,236,255,.92)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      title: chartTitle,
      height: 400,
      width: null,
      margin: { l: 60, r: 20, t: 80, b: 60 },
      xaxis: { 
        title: "HL FDV/vol / Binance FDV/vol", 
        gridcolor: "rgba(255,255,255,.08)",
        type: "log"
      },
      yaxis: { 
        title: "Relative HYPE Price Change (HYPE/BNB, 14 days, %)", 
        gridcolor: "rgba(255,255,255,.08)",
        tickformat: ".0f"
      },
      legend: { 
        orientation: "h", 
        yanchor: "bottom", 
        y: 1.02,
        xanchor: "right",
        x: 1
      },
      hovermode: false
    };

    Plotly.react("chart5", traces, layout, {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    });

    document.getElementById("chart5Badge").textContent = "Updated " + stamp();
  }

  function renderChart6() {
    
    if (dataPoints.size === 0) {
      Plotly.react("chart6", [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(231,236,255,.92)" }
      }, { responsive: true, displayModeBar: false, displaylogo: false });
      return;
    }

    const sortedData = Array.from(dataPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({ ts, ...data }));

    // Skip first 6 days (need full weekly volume) and last 7 days (need future price)
    const validData = sortedData.slice(6, sortedData.length - 7);

    // Create maps for quick price lookup by timestamp
    const hypePriceMap = new Map();
    const bnbPriceMap = new Map();
    sortedData.forEach(d => {
      if (d.hypePrice != null) {
        hypePriceMap.set(d.ts, d.hypePrice);
      }
      if (d.bnbPrice != null) {
        bnbPriceMap.set(d.ts, d.bnbPrice);
      }
    });

    const scatterPoints = [];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    validData.forEach((d, idx) => {
      // Calculate exchange ratio: (HYPE FDV/HL volume) / (BNB FDV/Binance volume)
      let exchangeRatio = null;
      if (d.hypePrice && d.bnbPrice && d.hlBtcVolume && d.binanceBtcVolume && 
          d.hlBtcVolume > 0 && d.binanceBtcVolume > 0 && d.bnbPrice > 0) {
        const hypeFdv = d.hypePrice * 1e9; // HYPE price * 1B
        const bnbFdv = d.bnbPrice * 137.73e6; // BNB price * 137.73M
        const hypePvRatio = hypeFdv / d.hlBtcVolume;
        const bnbPvRatio = bnbFdv / d.binanceBtcVolume;
        if (bnbPvRatio > 0) {
          exchangeRatio = hypePvRatio / bnbPvRatio;
        }
      }

      // Calculate 7-day forward relative price change (HYPE/BNB ratio change)
      let priceChange = null;
      const currentHypePrice = d.hypePrice;
      const currentBnbPrice = d.bnbPrice;
      const futureTs = d.ts + sevenDaysMs;
      
      // Find the closest future prices (within ±2 days window for flexibility)
      let futureHypePrice = null;
      let futureBnbPrice = null;
      let closestTs = null;
      let minDiff = Infinity;
      
      for (const [ts, hypePrice] of hypePriceMap.entries()) {
        const diff = Math.abs(ts - futureTs);
        // Look for price within ±2 days of target
        if (diff < (2 * 24 * 60 * 60 * 1000) && diff < minDiff) {
          minDiff = diff;
          futureHypePrice = hypePrice;
          closestTs = ts;
        }
      }
      
      // Find BNB price at the same timestamp
      if (closestTs != null) {
        futureBnbPrice = bnbPriceMap.get(closestTs);
      }
      
      if (currentHypePrice != null && currentBnbPrice != null && 
          futureHypePrice != null && futureBnbPrice != null && 
          currentBnbPrice > 0 && futureBnbPrice > 0) {
        // Calculate HYPE/BNB ratio change
        const currentRatio = currentHypePrice / currentBnbPrice;
        const futureRatio = futureHypePrice / futureBnbPrice;
        priceChange = ((futureRatio - currentRatio) / currentRatio) * 100; // Percentage change in ratio
        if (idx < 3) {
        }
      }

      if (exchangeRatio != null && priceChange != null) {
        const dayStr = new Date(d.ts).toISOString().split('T')[0];
        scatterPoints.push({
          dayStr,
          exchangeRatio,
          priceChange,
          ts: d.ts
        });
      }
    });

    // Group by day (take last point of each day), but preserve timestamp for sorting
    const dailyPoints = new Map();
    scatterPoints.forEach(point => {
      // Keep the point with the latest timestamp for each day
      const existing = dailyPoints.get(point.dayStr);
      if (!existing || point.ts > existing.ts) {
        dailyPoints.set(point.dayStr, point);
      }
    });


    const currentDate = new Date();
    const currentDayStr = currentDate.toISOString().split('T')[0];

    // Sort daily points by timestamp to get the rightmost point
    const sortedDailyPoints = Array.from(dailyPoints.values()).sort((a, b) => a.ts - b.ts);
    const rightmostPoint = sortedDailyPoints.length > 0 ? sortedDailyPoints[sortedDailyPoints.length - 1] : null;

    const regularX = [];
    const regularY = [];
    const currentX = [];
    const currentY = [];

    sortedDailyPoints.forEach(point => {
      if (point.dayStr === currentDayStr) {
        currentX.push(point.exchangeRatio);
        currentY.push(point.priceChange);
      } else {
        regularX.push(point.exchangeRatio);
        regularY.push(point.priceChange);
      }
    });


    // Calculate linear regression for all points (regular + current) using log(x)
    const allX = [...regularX, ...currentX];
    const allY = [...regularY, ...currentY];
    
    // Transform x to log scale for regression (filter out non-positive values)
    const allLogX = allX.filter(x => x > 0).map(x => Math.log(x));
    const allYFiltered = allY.filter((y, i) => allX[i] > 0);
    
    let slope = 0;
    let intercept = 0;
    let currentXValue = null;
    let fitYAtCurrentX = null;
    
    if (allLogX.length >= 2) {
      // Linear regression: y = slope * log(x) + intercept
      const n = allLogX.length;
      const sumLogX = allLogX.reduce((a, b) => a + b, 0);
      const sumY = allYFiltered.reduce((a, b) => a + b, 0);
      const sumLogXY = allLogX.reduce((sum, logX, i) => sum + logX * allYFiltered[i], 0);
      const sumLogXX = allLogX.reduce((sum, logX) => sum + logX * logX, 0);
      
      const denominator = n * sumLogXX - sumLogX * sumLogX;
      if (Math.abs(denominator) > 1e-10) {
        slope = (n * sumLogXY - sumLogX * sumY) / denominator;
        intercept = (sumY - slope * sumLogX) / n;
      }
      
      
      // Get current x value from the rightmost point (most recent by timestamp)
      // Use the exchange ratio from the rightmost point we identified earlier
      if (rightmostPoint && rightmostPoint.exchangeRatio > 0) {
        currentXValue = rightmostPoint.exchangeRatio;
      } else if (allX.length > 0) {
        // Fallback: use the last point from allX (which should be sorted by timestamp now)
        const validXValues = allX.filter(x => x > 0);
        if (validXValues.length > 0) {
          currentXValue = validXValues[validXValues.length - 1];
        }
      }
      
      // Fallback: if no plotted points, calculate from most recent valid data
      if (currentXValue == null || currentXValue <= 0) {
        // Find the most recent valid data point (from validData, not the full sortedData)
        for (let i = validData.length - 1; i >= 0; i--) {
          const d = validData[i];
          if (d.hypePrice && d.bnbPrice && d.hlBtcVolume && d.binanceBtcVolume && 
              d.hlBtcVolume > 0 && d.binanceBtcVolume > 0 && d.bnbPrice > 0) {
            const hypeFdv = d.hypePrice * 1e9;
            const bnbFdv = d.bnbPrice * 137.73e6;
            const hypePvRatio = hypeFdv / d.hlBtcVolume;
            const bnbPvRatio = bnbFdv / d.binanceBtcVolume;
            if (bnbPvRatio > 0) {
              currentXValue = hypePvRatio / bnbPvRatio;
              break;
            }
          }
        }
      }
      
      if (currentXValue != null && currentXValue > 0) {
        const logCurrentX = Math.log(currentXValue);
        fitYAtCurrentX = slope * logCurrentX + intercept;
      }
    }

    const traces = [];

    // Add horizontal line at y=0
    const validXForZero = allX.filter(x => x > 0);
    if (validXForZero.length > 0) {
      const minX = Math.min(...validXForZero);
      const maxX = Math.max(...validXForZero);
      traces.push({
        x: [minX, maxX],
        y: [0, 0],
        type: "scatter",
        mode: "lines",
        name: "Zero Line",
        line: { color: "white", width: 3 },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    // Add scatter points
    if (regularX.length > 0) {
      traces.push({
        x: regularX,
        y: regularY,
        type: "scatter",
        mode: "markers",
        name: "Daily",
        marker: { color: "lightblue", size: 8, opacity: 0.5 },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    if (currentX.length > 0) {
      traces.push({
        x: currentX,
        y: currentY,
        type: "scatter",
        mode: "markers",
        name: "Current Day",
        marker: {
          color: "red",
          size: 15,
          opacity: 0.5,
          line: { width: 2, color: "white" }
        },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    // Add linear fit line (using log scale for x)
    if (allX.length >= 2 && slope !== 0) {
      const validX = allX.filter(x => x > 0);
      if (validX.length >= 2) {
        const minX = Math.min(...validX);
        const maxX = Math.max(...validX);
        // Generate points for the fit line using log scale
        const numPoints = 100;
        const fitX = [];
        const fitY = [];
        for (let i = 0; i <= numPoints; i++) {
          const x = minX * Math.pow(maxX / minX, i / numPoints);
          const logX = Math.log(x);
          const y = slope * logX + intercept;
          fitX.push(x);
          fitY.push(y);
        }
        
        traces.push({
          x: fitX,
          y: fitY,
          type: "scatter",
          mode: "lines",
          name: "Best Fit Line",
          line: { color: "white", width: 2, dash: "dash" },
          showlegend: true,
          hoverinfo: "skip"
        });
      }
    }

    // Add black vertical line at current x value with white outline
    if (currentXValue != null && allY.length > 0) {
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);
      const yRange = maxY - minY;
      const lineY = [minY - yRange * 0.1, maxY + yRange * 0.1]; // Extend slightly beyond data range
      
      // Add white outline line (thicker, behind)
      traces.push({
        x: [currentXValue, currentXValue],
        y: lineY,
        type: "scatter",
        mode: "lines",
        name: "Current X Outline",
        line: { color: "white", width: 5 },
        showlegend: false,
        hoverinfo: "skip"
      });
      
      // Add black line (thinner, on top)
      traces.push({
        x: [currentXValue, currentXValue],
        y: lineY,
        type: "scatter",
        mode: "lines",
        name: "Current X",
        line: { color: "black", width: 3 },
        showlegend: false,
        hoverinfo: "skip"
      });
      
      // Add circle at intersection of vertical line and linear fit
      if (fitYAtCurrentX != null) {
        traces.push({
          x: [currentXValue],
          y: [fitYAtCurrentX],
          type: "scatter",
          mode: "markers",
          name: "Intersection",
          marker: {
            color: "black",
            size: 12,
            line: { width: 2, color: "white" },
            symbol: "circle"
          },
          showlegend: false,
          hoverinfo: "skip"
        });
      }
    }

    // Prepare chart title with current ratio and predicted return
    let chartTitle = "";
    if (currentXValue != null && fitYAtCurrentX != null) {
      chartTitle = `HYPE relative value: ${currentXValue.toFixed(6)} | Predicted 7 day return on HYPE/BNB: ${fitYAtCurrentX.toFixed(2)}%`;
    }

    const layout = {
      font: { color: "rgba(231,236,255,.92)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      title: chartTitle,
      height: 400,
      width: null,
      margin: { l: 60, r: 20, t: 80, b: 60 },
      xaxis: { 
        title: "HL FDV/vol / Binance FDV/vol", 
        gridcolor: "rgba(255,255,255,.08)",
        type: "log"
      },
      yaxis: { 
        title: "Relative HYPE Price Change (HYPE/BNB, 7 days, %)", 
        gridcolor: "rgba(255,255,255,.08)",
        tickformat: ".0f"
      },
      legend: { 
        orientation: "h", 
        yanchor: "bottom", 
        y: 1.02,
        xanchor: "right",
        x: 1
      },
      hovermode: false
    };

    Plotly.react("chart6", traces, layout, {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    });

    document.getElementById("chart6Badge").textContent = "Updated " + stamp();
  }

  function renderChart7() {
    
    if (dataPoints.size === 0) {
      Plotly.react("chart7", [], {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(231,236,255,.92)" }
      }, { responsive: true, displayModeBar: false, displaylogo: false });
      return;
    }

    const sortedData = Array.from(dataPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({ ts, ...data }));

    // Skip first 6 days (need full weekly volume) and last 14 days (need future price)
    const validData = sortedData.slice(6, sortedData.length - 14);

    // Create maps for quick price lookup by timestamp
    const hypePriceMap = new Map();
    const bnbPriceMap = new Map();
    sortedData.forEach(d => {
      if (d.hypePrice != null) {
        hypePriceMap.set(d.ts, d.hypePrice);
      }
      if (d.bnbPrice != null) {
        bnbPriceMap.set(d.ts, d.bnbPrice);
      }
    });

    // First, calculate all exchange ratios and store with timestamps
    const exchangeRatios = [];
    validData.forEach((d, idx) => {
      let exchangeRatio = null;
      if (d.hypePrice && d.bnbPrice && d.hlBtcVolume && d.binanceBtcVolume && 
          d.hlBtcVolume > 0 && d.binanceBtcVolume > 0 && d.bnbPrice > 0) {
        const hypeFdv = d.hypePrice * 1e9;
        const bnbFdv = d.bnbPrice * 137.73e6;
        const hypePvRatio = hypeFdv / d.hlBtcVolume;
        const bnbPvRatio = bnbFdv / d.binanceBtcVolume;
        if (bnbPvRatio > 0) {
          exchangeRatio = hypePvRatio / bnbPvRatio;
          exchangeRatios.push({ ts: d.ts, ratio: exchangeRatio, idx });
        }
      }
    });

    // Calculate 2-month (60-day) rolling average of exchange ratios
    const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
    const normalizedRatios = new Map();
    
    exchangeRatios.forEach((point, i) => {
      // Find all ratios within the past 60 days (including current point)
      const cutoffTs = point.ts - twoMonthsMs;
      const recentRatios = exchangeRatios
        .filter(p => p.ts >= cutoffTs && p.ts <= point.ts)
        .map(p => p.ratio);
      
      if (recentRatios.length > 0) {
        const avgRatio = recentRatios.reduce((a, b) => a + b, 0) / recentRatios.length;
        const normalizedRatio = point.ratio / avgRatio;
        normalizedRatios.set(point.ts, { ratio: point.ratio, normalizedRatio, avgRatio });
        if (i < 3 || i === exchangeRatios.length - 1) {
        }
      }
    });


    const scatterPoints = [];
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    validData.forEach((d, idx) => {
      // Get normalized exchange ratio
      const normalizedData = normalizedRatios.get(d.ts);
      if (!normalizedData) return;

      // Calculate 14-day forward relative price change (HYPE/BNB ratio change)
      let priceChange = null;
      const currentHypePrice = d.hypePrice;
      const currentBnbPrice = d.bnbPrice;
      const futureTs = d.ts + fourteenDaysMs;
      
      // Find the closest future prices (within ±2 days window for flexibility)
      let futureHypePrice = null;
      let futureBnbPrice = null;
      let closestTs = null;
      let minDiff = Infinity;
      
      for (const [ts, hypePrice] of hypePriceMap.entries()) {
        const diff = Math.abs(ts - futureTs);
        // Look for price within ±2 days of target
        if (diff < (2 * 24 * 60 * 60 * 1000) && diff < minDiff) {
          minDiff = diff;
          futureHypePrice = hypePrice;
          closestTs = ts;
        }
      }
      
      // Find BNB price at the same timestamp
      if (closestTs != null) {
        futureBnbPrice = bnbPriceMap.get(closestTs);
      }
      
      if (currentHypePrice != null && currentBnbPrice != null && 
          futureHypePrice != null && futureBnbPrice != null && 
          currentBnbPrice > 0 && futureBnbPrice > 0) {
        // Calculate HYPE/BNB ratio change
        const currentRatio = currentHypePrice / currentBnbPrice;
        const futureRatio = futureHypePrice / futureBnbPrice;
        priceChange = ((futureRatio - currentRatio) / currentRatio) * 100; // Percentage change in ratio
      }

      if (normalizedData.normalizedRatio != null && priceChange != null) {
        const dayStr = new Date(d.ts).toISOString().split('T')[0];
        scatterPoints.push({
          dayStr,
          normalizedRatio: normalizedData.normalizedRatio,
          priceChange,
          ts: d.ts
        });
      }
    });

    // Group by day (take last point of each day), but preserve timestamp for sorting
    const dailyPoints = new Map();
    scatterPoints.forEach(point => {
      // Keep the point with the latest timestamp for each day
      const existing = dailyPoints.get(point.dayStr);
      if (!existing || point.ts > existing.ts) {
        dailyPoints.set(point.dayStr, point);
      }
    });


    const currentDate = new Date();
    const currentDayStr = currentDate.toISOString().split('T')[0];

    // Sort daily points by timestamp to get the rightmost point
    const sortedDailyPoints = Array.from(dailyPoints.values()).sort((a, b) => a.ts - b.ts);
    const rightmostPoint = sortedDailyPoints.length > 0 ? sortedDailyPoints[sortedDailyPoints.length - 1] : null;

    const regularX = [];
    const regularY = [];
    const currentX = [];
    const currentY = [];

    sortedDailyPoints.forEach(point => {
      if (point.dayStr === currentDayStr) {
        currentX.push(point.normalizedRatio);
        currentY.push(point.priceChange);
      } else {
        regularX.push(point.normalizedRatio);
        regularY.push(point.priceChange);
      }
    });


    // Calculate linear regression for all points (regular + current) using log(x)
    const allX = [...regularX, ...currentX];
    const allY = [...regularY, ...currentY];
    
    // Transform x to log scale for regression (filter out non-positive values)
    const allLogX = allX.filter(x => x > 0).map(x => Math.log(x));
    const allYFiltered = allY.filter((y, i) => allX[i] > 0);
    
    let slope = 0;
    let intercept = 0;
    let currentXValue = null;
    let fitYAtCurrentX = null;
    
    if (allLogX.length >= 2) {
      // Linear regression: y = slope * log(x) + intercept
      const n = allLogX.length;
      const sumLogX = allLogX.reduce((a, b) => a + b, 0);
      const sumY = allYFiltered.reduce((a, b) => a + b, 0);
      const sumLogXY = allLogX.reduce((sum, logX, i) => sum + logX * allYFiltered[i], 0);
      const sumLogXX = allLogX.reduce((sum, logX) => sum + logX * logX, 0);
      
      const denominator = n * sumLogXX - sumLogX * sumLogX;
      if (Math.abs(denominator) > 1e-10) {
        slope = (n * sumLogXY - sumLogX * sumY) / denominator;
        intercept = (sumY - slope * sumLogX) / n;
      }
      
      
      // Get current x value from the rightmost point (most recent by timestamp)
      if (rightmostPoint && rightmostPoint.normalizedRatio > 0) {
        currentXValue = rightmostPoint.normalizedRatio;
      } else if (allX.length > 0) {
        // Fallback: use the last point from allX
        const validXValues = allX.filter(x => x > 0);
        if (validXValues.length > 0) {
          currentXValue = validXValues[validXValues.length - 1];
        }
      }
      
      if (currentXValue != null && currentXValue > 0) {
        const logCurrentX = Math.log(currentXValue);
        fitYAtCurrentX = slope * logCurrentX + intercept;
      }
    }

    const traces = [];

    // Add horizontal line at y=0
    const validXForZero = allX.filter(x => x > 0);
    if (validXForZero.length > 0) {
      const minX = Math.min(...validXForZero);
      const maxX = Math.max(...validXForZero);
      traces.push({
        x: [minX, maxX],
        y: [0, 0],
        type: "scatter",
        mode: "lines",
        name: "Zero Line",
        line: { color: "white", width: 3 },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    // Add scatter points
    if (regularX.length > 0) {
      traces.push({
        x: regularX,
        y: regularY,
        type: "scatter",
        mode: "markers",
        name: "Daily",
        marker: { color: "lightblue", size: 8, opacity: 0.5 },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    if (currentX.length > 0) {
      traces.push({
        x: currentX,
        y: currentY,
        type: "scatter",
        mode: "markers",
        name: "Current Day",
        marker: {
          color: "red",
          size: 15,
          opacity: 0.5,
          line: { width: 2, color: "white" }
        },
        showlegend: false,
        hoverinfo: "skip"
      });
    }

    // Add linear fit line (using log scale for x)
    if (allX.length >= 2 && slope !== 0) {
      const validX = allX.filter(x => x > 0);
      if (validX.length >= 2) {
        const minX = Math.min(...validX);
        const maxX = Math.max(...validX);
        // Generate points for the fit line using log scale
        const numPoints = 100;
        const fitX = [];
        const fitY = [];
        for (let i = 0; i <= numPoints; i++) {
          const x = minX * Math.pow(maxX / minX, i / numPoints);
          const logX = Math.log(x);
          const y = slope * logX + intercept;
          fitX.push(x);
          fitY.push(y);
        }
        
        traces.push({
          x: fitX,
          y: fitY,
          type: "scatter",
          mode: "lines",
          name: "Best Fit Line",
          line: { color: "white", width: 2, dash: "dash" },
          showlegend: true,
          hoverinfo: "skip"
        });
      }
    }

    // Add red vertical line at current x value
    if (currentXValue != null && allY.length > 0) {
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);
      const yRange = maxY - minY;
      const lineY = [minY - yRange * 0.1, maxY + yRange * 0.1];
      
      traces.push({
        x: [currentXValue, currentXValue],
        y: lineY,
        type: "scatter",
        mode: "lines",
        name: "Current X",
        line: { color: "black", width: 3 },
        showlegend: false,
        hoverinfo: "skip"
      });
      
      // Add circle at intersection of vertical line and linear fit
      if (fitYAtCurrentX != null) {
        traces.push({
          x: [currentXValue],
          y: [fitYAtCurrentX],
          type: "scatter",
          mode: "markers",
          name: "Intersection",
          marker: {
            color: "black",
            size: 12,
            line: { width: 2, color: "white" },
            symbol: "circle"
          },
          showlegend: false,
          hoverinfo: "skip"
        });
      }
    }

    // Prepare chart title with current normalized ratio and predicted return
    let chartTitle = "";
    if (currentXValue != null && fitYAtCurrentX != null) {
      chartTitle = `HYPE relative value (normalized): ${currentXValue.toFixed(6)} | Predicted 14 day return on HYPE/BNB: ${fitYAtCurrentX.toFixed(2)}%`;
    }

    const layout = {
      font: { color: "rgba(231,236,255,.92)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      title: chartTitle,
      height: 400,
      width: null,
      margin: { l: 60, r: 20, t: 80, b: 60 },
      xaxis: { 
        title: "Exchange Ratio / 2-month Average", 
        gridcolor: "rgba(255,255,255,.08)",
        type: "log"
      },
      yaxis: { 
        title: "Relative HYPE Price Change (HYPE/BNB, 14 days, %)", 
        gridcolor: "rgba(255,255,255,.08)",
        tickformat: ".0f"
      },
      legend: { 
        orientation: "h", 
        yanchor: "bottom", 
        y: 1.02,
        xanchor: "right",
        x: 1
      },
      hovermode: false
    };

    Plotly.react("chart7", traces, layout, {
      responsive: true,
      displayModeBar: false,
      displaylogo: false
    });

    document.getElementById("chart7Badge").textContent = "Updated " + stamp();
  }

  function render() {
    renderChart1();
    renderChart2();
    renderChart3();
    renderChart4();
    renderChart5();
    renderChart6();
  }

  async function refresh() {
    try {
      // Fetch historical weekly data for both venues
      const [hypePrices, bnbPrices, hlVolumes, binanceVolumes] = await Promise.all([
        fetchHypePriceHistory(),
        fetchBnbPriceHistory(),
        fetchHlBtcVolumeHistory(),
        fetchBinanceBtcVolumeHistory()
      ]);


      // Use Binance timestamps as the canonical timestamps (they have actual daily candle times)
      // We'll align all other data to these timestamps
      const canonicalTimestamps = Array.from(binanceVolumes.keys()).sort();

      // Align HYPE prices and HL volumes to Binance timestamps
      // Find closest HYPE price for each Binance timestamp (or use current if no historical)
      const currentHypePrice = await fetchHypePrice().catch(() => null);
      const currentHlVolume = await fetchHlBtcVolume().catch(() => null);

      // Clear existing data points
      dataPoints.clear();

      // Helper to find closest HYPE price for a given timestamp
      function findClosestHypePrice(targetTs) {
        if (hypePrices.size === 0) return currentHypePrice;
        
        const sortedHype = Array.from(hypePrices.entries()).sort((a, b) => a[0] - b[0]);
        let closest = sortedHype[0];
        let minDiff = Math.abs(targetTs - closest[0]);
        
        for (const [ts, price] of sortedHype) {
          const diff = Math.abs(targetTs - ts);
          if (diff < minDiff) {
            minDiff = diff;
            closest = [ts, price];
          }
        }
        
        // If within 24 hours, use it; otherwise use current price
        if (minDiff < 24 * 60 * 60 * 1000) {
          return closest[1];
        }
        return currentHypePrice;
      }
      
      // Helper to find closest HL volume for a given timestamp
      function findClosestHlVolume(targetTs) {
        if (hlVolumes.size === 0) return currentHlVolume;
        
        const sortedHl = Array.from(hlVolumes.entries()).sort((a, b) => a[0] - b[0]);
        let closest = sortedHl[0];
        let minDiff = Math.abs(targetTs - closest[0]);
        
        for (const [ts, volume] of sortedHl) {
          const diff = Math.abs(targetTs - ts);
          if (diff < minDiff) {
            minDiff = diff;
            closest = [ts, volume];
          }
        }
        
        // If within 24 hours, use it; otherwise use current volume
        if (minDiff < 24 * 60 * 60 * 1000) {
          return closest[1];
        }
        return currentHlVolume;
      }
      
      // Create data points using canonical timestamps
      let addedCount = 0;
      for (const ts of canonicalTimestamps) {
        const dataObj = {
          hypePrice: findClosestHypePrice(ts), // Use historical price if available
          bnbPrice: bnbPrices.get(ts) || null,
          hlBtcVolume: findClosestHlVolume(ts), // Use historical volume if available
          binanceBtcVolume: binanceVolumes.get(ts) || null
        };
        
        if (addedCount < 3 || addedCount === canonicalTimestamps.length - 1) {
        }
        
        const ratios = calculateRatios(dataObj);
        const data = {
          ...dataObj,
          ratios
        };
        
        dataPoints.set(ts, data);
        addedCount++;
      }

      render();
    } catch (error) {
      console.error("[refresh] Error:", error);
    }
  }

  function boot() {
    
    // Check if chart elements exist
    const chart1El = document.getElementById("chart1");
    const chart2El = document.getElementById("chart2");
    const chart3El = document.getElementById("chart3");
    const chart4El = document.getElementById("chart4");
    
    if (!chart1El || !chart2El || !chart3El || !chart4El) {
      console.error("[boot] Missing chart elements!");
      return;
    }
    
    // Initialize empty charts
    Plotly.newPlot("chart1", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      height: 400,
      width: null,
      yaxis: { title: "BNB FDV ($)", side: "left" },
      yaxis2: { title: "HYPE FDV ($B)", side: "right", overlaying: "y", tickformat: ".2f" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    Plotly.newPlot("chart2", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      height: 400,
      width: null,
      yaxis: { title: "Binance BTC Volume ($)", side: "left" },
      yaxis2: { title: "HL BTC Volume ($)", side: "right", overlaying: "y" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    Plotly.newPlot("chart3", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      height: 400,
      width: null,
      yaxis: { title: "Volume Ratio (HL / Binance, %)", side: "left", tickformat: ".0f" },
      yaxis2: { title: "FDV Ratio (HYPE / BNB, %)", side: "right", overlaying: "y", tickformat: ".0f" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    Plotly.newPlot("chart4", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      height: 400,
      width: null
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    Plotly.newPlot("chart5", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      height: 400,
      width: null,
      xaxis: { title: "HL FDV/vol / Binance FDV/vol", type: "log" },
      yaxis: { title: "Relative HYPE Price Change (HYPE/BNB, 14 days, %)", tickformat: ".0f" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    Plotly.newPlot("chart6", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      height: 400,
      width: null,
      xaxis: { title: "HL FDV/vol / Binance FDV/vol", type: "log" },
      yaxis: { title: "Relative HYPE Price Change (HYPE/BNB, 7 days, %)", tickformat: ".0f" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    // Initial refresh
    refresh();
    
    // Auto-refresh every 30 seconds
    setInterval(() => {
      refresh();
    }, 30000);
  }

  return { boot, refresh, render };
})();
