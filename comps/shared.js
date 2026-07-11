/* =========================
   Shared helpers
========================= */
function uniqUpper(s) { return (s || "").trim().toUpperCase(); }
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
function stamp() {
  return new Date().toLocaleString();
}

const $ = (id) => document.getElementById(id);

/* =========================
   State
========================= */
const state = {
  targets: new Set(["MORPHO", "AAVE"]),
  benchmarks: new Set(["AAVE", "COMP", "ETH", "MORPHO", "ENA"]),
  options: {
    benchmarkMode: "demean_beta1",
    granularity: "15M",          // default 15m
    comparables: "auto",
    dataSource: "binance",
    censor: "no"
  }
};

/* =========================
   UI helpers
========================= */
function setStatus(kind, text) {
  // Status is now shown via badges, not a status dot
  // This function kept for compatibility but doesn't update UI
}

let toastTimer = null;
function showToast(title, body) {
  const toast = $("toast");
  const toastTitle = $("toastTitle");
  const toastBody = $("toastBody");
  if (!toast || !toastTitle || !toastBody) return;
  toastTitle.textContent = title || "Notice";
  toastBody.textContent = body || "";
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = "none"; }, 9000);
}

// Initialize toast close button
document.addEventListener("DOMContentLoaded", () => {
  const toastClose = $("toastClose");
  if (toastClose) {
    toastClose.addEventListener("click", () => {
      const toast = $("toast");
      if (toast) toast.style.display = "none";
    });
  }
});

