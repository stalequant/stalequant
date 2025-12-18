/* =========================
   UI and initialization
========================= */
let metrics = null;

function activate(coin) {
  const select = $('coin-select');
  if (select) select.value = coin;
  document.querySelectorAll('.coin-btn').forEach(b => b.classList.toggle('active', b.dataset.coin === coin));
  location.hash = coin;
  if (metrics) plotCoin(metrics, coin);
}

async function init() {
  // Initialize badges
  const updatedBadge = $('hlpUpdatedBadge');
  if (updatedBadge) updatedBadge.textContent = 'Not updated';
  const statusBadge = $('hlpStatusBadge');
  if (statusBadge) statusBadge.textContent = 'Loading...';
  
  // Initialize empty plot with loading state
  Plotly.newPlot('plot', [], {
    margin: { l: 54, r: 24, t: 34, b: 48 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial', size: 12, color: 'rgba(231,236,255,.9)' },
    xaxis: { title: { text: '' }, gridcolor: 'rgba(255,255,255,.08)', zerolinecolor: 'rgba(255,255,255,.10)' },
    yaxis: { title: { text: 'Share %' }, ticksuffix: '%', rangemode: 'tozero', range: [0, null], gridcolor: 'rgba(255,255,255,.08)', zerolinecolor: 'rgba(255,255,255,.10)' },
    legend: { orientation: 'h', y: 1.03, x: 0, bgcolor: 'rgba(0,0,0,0)' },
    title: { text: 'Loading...', font: { size: 13, color: 'rgba(170,180,212,.95)' } }
  }, { responsive: true, displayModeBar: false, scrollZoom: true });

  try {
    const nested = await fetchThunderhead();
    metrics = computeMetrics(nested);
    
    // Update status badge
    if (statusBadge) statusBadge.textContent = 'Ready';

    const coins = Object.keys(metrics).sort((a, b) => a === 'TOTAL' ? -1 : b === 'TOTAL' ? 1 : a.localeCompare(b));
    const quick = ['TOTAL', 'BTC', 'ETH', 'HYPE'];

    const select = $('coin-select');
    const btnBox = $('coin-buttons');

    if (!select || !btnBox) return;

    // build controls
    coins.forEach(c => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = c;
      select.appendChild(opt);
      if (quick.includes(c)) {
        const btn = document.createElement('button');
        btn.textContent = c;
        btn.className = 'coin-btn';
        btn.dataset.coin = c;
        btnBox.appendChild(btn);
      }
    });

    btnBox.addEventListener('click', e => {
      if (e.target.classList.contains('coin-btn')) activate(e.target.dataset.coin);
    });
    select.addEventListener('change', () => activate(select.value));

    const initial = (location.hash.replace('#', '') || 'TOTAL').toUpperCase();
    activate(coins.includes(initial) ? initial : 'TOTAL');

  } catch (err) {
    console.error(err);
    const plotEl = $('plot');
    if (plotEl) plotEl.textContent = err.message;
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

