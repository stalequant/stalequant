/* =========================
   UI and initialization
========================= */
let metrics = null;
let currentCoin = 'TOTAL';

function activate(coin) {
  currentCoin = coin;
  const input = $('coinInput');
  if (input) {
    input.value = '';
    input.placeholder = coin;
  }
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

    const input = $('coinInput');
    const dropdown = $('coinDropdown');
    const btnBox = $('coin-buttons');

    if (!input || !dropdown || !btnBox) return;

    // Store coins globally for filtering
    window.coins = coins;

    // build quick buttons
    quick.forEach(c => {
      if (coins.includes(c)) {
        const btn = document.createElement('button');
        btn.textContent = c;
        btn.className = 'coin-btn';
        btn.dataset.coin = c;
        btnBox.appendChild(btn);
      }
    });

    // Dropdown functions
    function closeDropdown() {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }

    function filterCoinSuggestions(query) {
      if (!query) return [];
      const q = query.toUpperCase().trim();
      if (!q) return [];
      return coins.filter(c => c.includes(q)).slice(0, 10);
    }

    function openDropdown(suggestions) {
      dropdown.innerHTML = '';
      if (suggestions.length === 0) {
        closeDropdown();
        return;
      }

      // Calculate position relative to viewport (using fixed positioning like stalegun)
      const inputRect = input.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.left = inputRect.left + 'px';
      dropdown.style.top = (inputRect.bottom + 6) + 'px';
      dropdown.style.width = inputRect.width + 'px';
      dropdown.style.zIndex = '9999';

      suggestions.forEach(coin => {
        const item = document.createElement('div');
        item.className = 'comps-ddItem';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.innerHTML = `<div class="sym">${coin}</div>`;
        item.addEventListener('click', () => {
          activate(coin);
          closeDropdown();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    }

    // Handle input changes
    input.addEventListener('input', () => {
      const suggestions = filterCoinSuggestions(input.value);
      openDropdown(suggestions);
    });

    // Handle Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.toUpperCase().trim();
        if (value && coins.includes(value)) {
          activate(value);
          closeDropdown();
        } else if (value) {
          alert(`Invalid coin: ${value}. Please select a valid coin from the list.`);
          input.value = '';
          input.placeholder = 'TOTAL';
          closeDropdown();
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== input) {
        closeDropdown();
      }
    });

    // Handle blur - validate and update coin if valid
    input.addEventListener('blur', () => {
      const value = input.value.toUpperCase().trim();
      if (value && coins.includes(value) && value !== currentCoin) {
        activate(value);
      } else if (value && !coins.includes(value)) {
        input.value = '';
        input.placeholder = currentCoin;
      } else if (!value) {
        input.placeholder = currentCoin;
      }
    });

    // Handle button clicks
    btnBox.addEventListener('click', e => {
      if (e.target.classList.contains('coin-btn')) {
        activate(e.target.dataset.coin);
        closeDropdown();
      }
    });

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

