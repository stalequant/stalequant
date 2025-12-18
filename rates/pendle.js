/* =========================
   PENDLE PT MARKETS (Plotly)
========================= */
const Pendle = (function () {
  const elUpdated = document.getElementById("pendleUpdatedBadge");
  const elPts = document.getElementById("pendlePointsBadge");

  const CATEGORIES = {
    'Ethena': ['sUSDe', 'USDe'],
    'Delta-neutral': ['NUSD', 'sNUSD', 'jrUSDe', 'srUSDe', 'sUSDf'],
    'Credit': ['sUSDai', 'reUSD', 'syrupUSDT', 'stcUSD'],
    'T-Bills': ['USDai', 'thBILL']
  };

  function parseDate(dateStr) {
    return new Date(dateStr);
  }

  function daysUntilExpiry(expiryDate) {
    const now = new Date();
    const exp = new Date(expiryDate);
    const diff = exp - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function filterMarkets(markets) {
    const minDate = new Date('2025-12-20');
    const filtered = markets.filter(m => {
      // Filter by expiry date (after 2025-12-20)
      const exp = parseDate(m.expiry);
      if (exp < minDate) return false;

      // Filter by category containing 'stables'
      const categoryIds = Array.isArray(m.categoryIds) ? m.categoryIds : [];
      const hasStables = categoryIds.some(cat => String(cat).includes('stables'));
      if (!hasStables) return false;

      return true;
    });
    return filtered;
  }

  function categorizeMarket(market) {
    const name = market.name || '';
    for (const [category, coins] of Object.entries(CATEGORIES)) {
      if (coins.includes(name)) {
        return category;
      }
    }
    return null;
  }

  function buildTraces(markets) {
    const byCategory = new Map();
    
    for (const m of markets) {
      const category = categorizeMarket(m);
      if (!category) continue;

      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }

      const exp = parseDate(m.expiry);
      const impliedApy = Number(m.impliedApy) || 0;
      const totalTvl = Number(m.totalTvl) || 0;
      const size = Math.max(1.5 * Math.log(Math.max(totalTvl / 1e6, 1)), 0.5);

      byCategory.get(category).push({
        x: exp,
        y: impliedApy * 100,
        size: size,
        name: m.name,
        text: m.name,
        tvl: totalTvl
      });
    }

    const traces = [];
    const colors = {
      'Ethena': 'rgba(80, 210, 193, 0.8)',
      'Delta-neutral': 'rgba(255, 200, 87, 0.8)',
      'Credit': 'rgba(255, 107, 107, 0.8)',
      'T-Bills': 'rgba(107, 185, 255, 0.8)'
    };

    for (const [category, points] of byCategory.entries()) {
      if (points.length === 0) continue;

      traces.push({
        type: 'scatter',
        mode: 'markers+text',
        name: category,
        x: points.map(p => p.x),
        y: points.map(p => p.y),
        marker: {
          size: points.map(p => p.size),
          color: colors[category] || 'rgba(255, 255, 255, 0.8)',
          line: {
            width: 1,
            color: 'rgba(0, 0, 0, 0.3)'
          }
        },
        text: points.map(p => p.text),
        textposition: 'top right',
        textfont: {
          size: 8,
          color: 'rgba(231, 236, 255, 0.9)'
        },
        hovertemplate: '<b>%{text}</b><br>Expiry: %{x|%Y-%m-%d}<br>APY: %{y:.2f}%<br>TVL: $%{customdata:,.0f}<extra></extra>',
        customdata: points.map(p => p.tvl)
      });
    }

    return traces;
  }

  function render(markets) {
    const filtered = filterMarkets(markets);
    const traces = buildTraces(filtered);

    Plotly.react("pendleChart", traces, {
      paper_bgcolor: "rgba(0,0,0,0)",
      font: { color: "rgba(231,236,255,.92)" },
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 60, r: 20, t: 10, b: 55 },
      xaxis: {
        title: "Expiry Date",
        gridcolor: "rgba(255,255,255,.08)",
        zerolinecolor: "rgba(255,255,255,.10)",
        type: 'date'
      },
      yaxis: {
        title: "Implied APY (%)",
        gridcolor: "rgba(255,255,255,.08)",
        zerolinecolor: "rgba(255,255,255,.10)"
      },
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.02,
        xanchor: "left",
        x: 0
      },
      hoverlabel: { bgcolor: "rgba(16,26,51,.95)" }
    }, { responsive: true, displayModeBar: false, displaylogo: false });

    elPts.textContent = filtered.length + " markets";
    elUpdated.textContent = "Updated " + stamp();
  }

  async function refresh() {
    try {
      const url = "https://api-v2.pendle.finance/core/v1/markets/all";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const rawMarkets = j?.markets || [];
      
      // Flatten markets with details (similar to Python k|k['details'])
      const markets = rawMarkets.map(m => {
        const details = m.details || {};
        return { ...m, ...details };
      });

      render(markets);
    } catch (e) {
      console.error("Error fetching Pendle markets:", e);
      elUpdated.textContent = "Error: " + (e?.message || String(e));
    }
  }

  function boot() {
    Plotly.newPlot("pendleChart", [], {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 60, r: 20, t: 10, b: 55 },
      xaxis: {
        title: "Expiry Date",
        gridcolor: "rgba(255,255,255,.08)",
        type: 'date'
      },
      yaxis: {
        title: "Implied APY (%)",
        gridcolor: "rgba(255,255,255,.08)"
      }
    }, { responsive: true, displayModeBar: false, displaylogo: false });
  }

  return { boot, refresh, render };
})();

