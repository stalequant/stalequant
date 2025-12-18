/* =========================
   Wire up
========================= */
async function init() {
  // Initialize badges
  const updatedBadge = $("compsUpdatedBadge");
  if (updatedBadge) updatedBadge.textContent = "Not updated";
  const cacheBadge = $("compsCacheBadge");
  if (cacheBadge) cacheBadge.textContent = "0 keys";
  
  try {
    await loadBinanceUniverse();
  } catch (e) {
    showToast("Universe load failed", String(e && e.message ? e.message : e));
  }

  attachDropZone($("listTarget"), () => state.targets);
  attachDropZone($("listBench"), () => state.benchmarks);
  setupPicker($("inputTarget"), $("ddTarget"), () => state.targets);
  setupPicker($("inputBench"), $("ddBench"), () => state.benchmarks);
  setupOptionGroups();
  renderAll();

  await Plotly.newPlot("comps-plot", [], {
    margin: { l: 54, r: 24, t: 34, b: 48 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial", size: 12, color: "rgba(231,236,255,.9)" },
    xaxis: { title: { text: "" }, gridcolor: "rgba(255,255,255,.08)" },
    yaxis: { title: { text: "Price" }, gridcolor: "rgba(255,255,255,.08)" },
    title: { text: "Loading...", font: { size: 13, color: "rgba(170,180,212,.95)" } }
  }, { displayModeBar: false, responsive: true, scrollZoom: true });

  const plotDiv = document.getElementById("comps-plot");
  if (plotDiv) {
    plotDiv.on("plotly_relayout", async (ev) => {
      if (suppressRelayout) return;
      const xr = getXRangeFromRelayout(ev);
      await redrawWithDynamicNormalization(xr);
    });
  }

  // Setup collapsible control bar
  const ctrlBar = document.getElementById("compsCtrlBar");
  if (ctrlBar) {
    ctrlBar.addEventListener("click", () => {
      const panel = document.getElementById("compsCtrlPanel");
      const chev = document.getElementById("compsChev");
      if (panel && chev) {
        const open = !panel.classList.contains("open");
        panel.classList.toggle("open", open);
        chev.classList.toggle("open", open);
      }
    });
  }

  scheduleReplot();
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

