/* =========================
   Chart plotting
========================= */
const ACCENT = getComputedStyle(document.documentElement).getPropertyValue('--link-primary').trim() || '#50D2C1';

function plotCoin(data, coin) {
  const rows = data[coin] || [];
  if (!rows.length) { return; }

  const x = rows.map(r => r.time);
  const yOI = rows.map(r => (r.hlpOiShare ?? 0) * 100);
  const yVol = rows.map(r => (r.hlpVolShare ?? 0) * 100);

  Plotly.newPlot('plot', [
    { x, y: yOI, mode: 'lines', name: 'HLP OI Share %', line: { width: 2, color: 'rgba(231,236,255,.9)' } },
    { x, y: yVol, mode: 'lines', name: 'HLP Vol Share %', line: { width: 2, color: ACCENT, dash: 'dash' } }
  ], {
    margin: { l: 54, r: 24, t: 34, b: 48 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial', size: 12, color: 'rgba(231,236,255,.9)' },
    xaxis: {
      title: { text: '' },
      gridcolor: 'rgba(255,255,255,.08)',
      zerolinecolor: 'rgba(255,255,255,.10)'
    },
    yaxis: {
      title: { text: 'Share %' },
      ticksuffix: '%',
      rangemode: 'tozero',
      range: [0, null],
      gridcolor: 'rgba(255,255,255,.08)',
      zerolinecolor: 'rgba(255,255,255,.10)'
    },
    legend: {
      orientation: 'h',
      y: 1.03,
      x: 0,
      bgcolor: 'rgba(0,0,0,0)',
      font: { size: 12, color: 'rgba(231,236,255,.9)' }
    },
    title: { text: '', font: { size: 13, color: 'rgba(170,180,212,.95)' } }
  }, { responsive: true, displayModeBar: false, scrollZoom: true });
  
  // Update badges
  const updatedBadge = $('hlpUpdatedBadge');
  if (updatedBadge) updatedBadge.textContent = 'Updated ' + stamp();
  
  // Get date range from data
  if (rows.length > 0) {
    const firstDate = rows[0].time;
    const lastDate = rows[rows.length - 1].time;
    const statusBadge = $('hlpStatusBadge');
    if (statusBadge) {
      const dateStr = firstDate.toLocaleDateString() + ' - ' + lastDate.toLocaleDateString();
      statusBadge.textContent = dateStr;
    }
  }
}

