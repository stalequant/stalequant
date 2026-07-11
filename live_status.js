(function () {
  "use strict";

  const freshness = new Map();

  function normalizeTimestamp(value) {
    if (value == null) return Date.now();
    if (value instanceof Date) return value.getTime();
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function timeLabel(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function classifyAge(ageMs) {
    if (ageMs < 2 * 60 * 1000) return { label: "Live", className: "ok" };
    if (ageMs < 15 * 60 * 1000) return { label: "Delayed", className: "" };
    return { label: "Stale", className: "bad" };
  }

  function renderFreshness(id) {
    const entry = freshness.get(id);
    const el = document.getElementById(id);
    if (!entry || !el) return;
    const state = classifyAge(Math.max(0, Date.now() - entry.timestamp));
    el.textContent = state.label + " · " + timeLabel(entry.timestamp);
    el.classList.remove("ok", "bad");
    if (state.className) el.classList.add(state.className);
    el.title = "Last successful refresh: " + new Date(entry.timestamp).toLocaleString();
  }

  window.markFreshness = function (id, timestamp) {
    freshness.set(id, { timestamp: normalizeTimestamp(timestamp) });
    renderFreshness(id);
  };

  window.markFreshnessError = function (id, text) {
    freshness.delete(id);
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = "Stale · " + (text || "feed error");
    el.classList.remove("ok");
    el.classList.add("bad");
  };

  function latencyLabel(ageMs) {
    if (ageMs < 1000) return Math.round(ageMs) + " ms";
    if (ageMs < 60 * 1000) return (ageMs / 1000).toFixed(ageMs < 10 * 1000 ? 1 : 0) + " s";
    return Math.floor(ageMs / 60000) + " m " + Math.floor((ageMs % 60000) / 1000) + " s";
  }

  window.markFeedLatency = function (statusId, eventTimestamp, liveLimitMs, staleLimitMs) {
    const el = document.getElementById(statusId);
    if (!el) return;
    const latency = el.querySelector(".feed-latency");
    if (!latency) return;
    const observedAt = normalizeTimestamp(eventTimestamp);
    const ageMs = Math.max(0, Date.now() - observedAt);
    const liveLimit = Number.isFinite(liveLimitMs) ? liveLimitMs : 2000;
    const staleLimit = Number.isFinite(staleLimitMs) ? staleLimitMs : 10000;
    latency.textContent = latencyLabel(ageMs);
    latency.title = "Age of latest venue observation";
    latency.className = "feed-latency " + (ageMs < liveLimit ? "status-ok" : ageMs < staleLimit ? "status-warn" : "status-bad");
  };

  setInterval(function () {
    freshness.forEach(function (_, id) { renderFreshness(id); });
  }, 15000);
})();
