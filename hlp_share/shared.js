/* =========================
   Shared helpers
========================= */
function getOrInit(obj, k1, k2) {
  if (!obj[k1]) obj[k1] = {};
  if (!obj[k1][k2]) obj[k1][k2] = {};
  return obj[k1][k2];
}

function mean(arr) {
  const v = arr.filter(n => n != null && !isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const $ = (id) => document.getElementById(id);

function stamp() {
  return new Date().toLocaleString();
}

