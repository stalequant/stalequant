/* =========================
   Plotly plotting
========================= */
const COLORS = { hl: "#35d07f", ex: "#ff6b6b", li: "#4aa3ff" };
const EXCH_LABELS = { hl: "Hyperliquid", ex: "EdgeX", li: "Lighter" };

function maxTotalsNeeded() {
  let maxY = 0;
  for (const p of series) {
    for (const e of EXCH) maxY = Math.max(maxY, p[e].vol, p[e].pos);
  }
  return maxY;
}

function drawLeftPlot() {
  if (series.length < 2) {
    Plotly.react("chartLeft", [], {
      margin: { l: 54, r: 24, t: 34, b: 48 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial", size: 12, color: "rgba(231,236,255,.9)" },
      xaxis: { title: { text: "" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      yaxis: { title: { text: "BTC Volume" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      legend: { orientation: "h", y: 1.03, x: 0, bgcolor: "rgba(0,0,0,0)" },
      title: { text: "", font: { size: 13, color: "rgba(170,180,212,.95)" } }
    }, { displayModeBar: false, responsive: true, scrollZoom: true });
    return;
  }

  const traces = [];
  const tmin = series[0].t * 1000; // Convert to ms
  const tmax = series[series.length - 1].t * 1000;
  const ymax = Math.max(1e-9, maxTotalsNeeded());
  const ymin = 0;

  const times = series.map(p => new Date(p.t * 1000));

  for (const e of EXCH) {
    // Position changes (solid line)
    traces.push({
      x: times,
      y: series.map(p => p[e].pos),
      name: EXCH_LABELS[e] + " - Total position changes",
      type: "scatter",
      mode: "lines",
      line: { color: COLORS[e], width: 2 }
    });

    // Volume (dashed line)
    traces.push({
      x: times,
      y: series.map(p => p[e].vol),
      name: EXCH_LABELS[e] + " - Raw volume",
      type: "scatter",
      mode: "lines",
      line: { color: COLORS[e], width: 2, dash: "dash" },
      showlegend: true
    });
  }

  const layout = {
    margin: { l: 54, r: 24, t: 34, b: 48 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial", size: 12, color: "rgba(231,236,255,.9)" },
    xaxis: { title: { text: "" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      yaxis: { title: { text: "BTC Volume" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)", range: [ymin, ymax] },
    legend: { orientation: "h", y: 1.03, x: 0, bgcolor: "rgba(0,0,0,0)" },
    title: { text: "", font: { size: 13, color: "rgba(170,180,212,.95)" } }
  };

  Plotly.react("chartLeft", traces, layout, { displayModeBar: false, responsive: true, scrollZoom: true });
}

function drawRightPlot() {
  if (series.length < 2) {
    Plotly.react("chartRight", [], {
      margin: { l: 54, r: 24, t: 34, b: 48 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial", size: 12, color: "rgba(231,236,255,.9)" },
      xaxis: { title: { text: "" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      yaxis: { 
        title: { text: "Volume Quality (%)" }, 
        gridcolor: "rgba(255,255,255,.08)", 
        zerolinecolor: "rgba(255,255,255,.10)",
        tickformat: ".0%"
      },
      legend: { orientation: "h", y: 1.03, x: 0, bgcolor: "rgba(0,0,0,0)" },
      title: { text: "", font: { size: 13, color: "rgba(170,180,212,.95)" } }
    }, { displayModeBar: false, responsive: true, scrollZoom: true });
    return;
  }

  const traces = [];
  const times = series.map(p => new Date(p.t * 1000));
  const ymin = 0;
  const ymax = 1;

  for (const e of EXCH) {
    const ratios = series.map(p => {
      const v = p[e].vol;
      let r = v > 0 ? (p[e].pos / v) : 0;
      if (r < 0) r = 0;
      if (r > 1) r = 1;
      return r;
    });

    traces.push({
      x: times,
      y: ratios,
      name: EXCH_LABELS[e],
      type: "scatter",
      mode: "lines",
      line: { color: COLORS[e], width: 2 }
    });
  }

  const layout = {
    margin: { l: 54, r: 24, t: 34, b: 48 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial", size: 12, color: "rgba(231,236,255,.9)" },
    xaxis: { title: { text: "" }, gridcolor: "rgba(255,255,255,.08)", zerolinecolor: "rgba(255,255,255,.10)" },
      yaxis: { 
        title: { text: "Volume Quality (%)" }, 
        gridcolor: "rgba(255,255,255,.08)", 
        zerolinecolor: "rgba(255,255,255,.10)", 
        range: [ymin, ymax],
        tickformat: ".0%"
      },
    legend: { orientation: "h", y: 1.03, x: 0, bgcolor: "rgba(0,0,0,0)" },
    title: { text: "", font: { size: 13, color: "rgba(170,180,212,.95)" } }
  };

  Plotly.react("chartRight", traces, layout, { displayModeBar: false, responsive: true, scrollZoom: true });
}

function renderAll() {
  drawLeftPlot();
  drawRightPlot();
}

