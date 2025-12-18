/* =========================
   Wire up
========================= */
(function boot() {
  // init health
  for (const k of [...TS_KEYS, ...CURVE_KEYS]) health[k] = { ok: null, note: "pending" };

  // collapsible controls
  document.getElementById("tsCtrlBar").addEventListener("click", () => togglePanel("tsCtrlBar", "tsCtrlPanel", "tsChev"));
  document.getElementById("curveCtrlBar").addEventListener("click", () => togglePanel("curveCtrlBar", "curveCtrlPanel", "curveChev"));
  document.getElementById("pendleCtrlBar").addEventListener("click", () => togglePanel("pendleCtrlBar", "pendleCtrlPanel", "pendleChev"));

  rebuildToggles();
  TS.boot();
  Curve.boot();
  Pendle.boot();

  // auto refresh
  window.addEventListener("load", async () => {
    setLive("ts", "warn", "Loading...");
    setLive("curve", "warn", "Loading...");
    Curve.refresh();
    TS.refreshIncremental();
    Pendle.refresh();
  });
})();
