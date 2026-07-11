/* =========================
   Boot
========================= */
const resetBtn = $("resetBtn");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    resetAll();
    scheduleNextTick();
  });
}

window.addEventListener("resize", renderAll);

let tickInterval = null;

function scheduleNextTick() {
  if (tickInterval) clearTimeout(tickInterval);
  const interval = snapshotTick();
  tickInterval = setTimeout(() => {
    scheduleNextTick();
  }, interval);
}

resetAll();
renderAll(); // Initial render
scheduleNextTick();

subscribeHL();
subscribeEdgeX();
subscribeLighter();

