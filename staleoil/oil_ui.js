/**
 * Oil chart UI: interval buttons and scheduled legend refresh.
 * Legend is built in oil_chart.js (buildLegend / rebuildOilLegends).
 */
(function () {
  "use strict";

  function attachIntervalButtons() {
    var container = document.getElementById("oilIntervalButtons");
    if (!container) return;
    container.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".oil-interval-btn");
      if (!btn) return;
      var val = btn.getAttribute("data-interval");
      if (val !== "1m" && val !== "5m" && val !== "15m" && val !== "1h") return;
      window.OIL_CANDLE_INTERVAL = val;
      var all = container.querySelectorAll(".oil-interval-btn");
      for (var i = 0; i < all.length; i++) {
        all[i].classList.remove("btn-primary");
        all[i].classList.add("btn-outline-secondary");
      }
      btn.classList.remove("btn-outline-secondary");
      btn.classList.add("btn-primary");
      if (typeof window.refetchHLOil === "function") window.refetchHLOil();
      if (typeof window.refetchLighterOil === "function") window.refetchLighterOil();
      if (typeof window.refetchAsterOil === "function") window.refetchAsterOil();
    });
  }

  function scheduleLegendRebuilds() {
    attachIntervalButtons();
    [200, 600, 1200, 2500, 5000].forEach(function (delay) {
      setTimeout(function () {
        if (typeof window.rebuildOilLegends === "function") window.rebuildOilLegends();
      }, delay);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleLegendRebuilds);
  } else {
    scheduleLegendRebuilds();
  }
})();
