/**
 * Oil charts using Lightweight Charts (TradingView) with native panes: price, BP, volume.
 * Single chart, three panes, synchronized x-axis. Same window API for data scripts.
 */
(function () {
  "use strict";

  var LWC = typeof window !== "undefined" && window.LightweightCharts;
  if (!LWC) return;

  var createChart = LWC.createChart;
  var LineSeries = LWC.LineSeries;
  var HistogramSeries = LWC.HistogramSeries;

  const DATA_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
  const MAX_POINTS = 50000;

  function getMaxCandles() {
    return (typeof window !== "undefined" && typeof window.OIL_CANDLE_LIMIT === "number")
      ? window.OIL_CANDLE_LIMIT : 400;
  }

  /** ms -> LWC time (seconds since epoch) */
  function toTime(ms) {
    return Math.floor(Number(ms) / 1000);
  }

  var container = document.getElementById("oil-chart-container");
  if (!container) return;

  var timeAxisEl = document.getElementById("oil-time-axis");

  function formatTimeAxisLabel(ts) {
    if (ts == null || typeof ts !== "number") return "";
    var d = new Date(ts * 1000);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function updateTimeAxis() {
    if (!timeAxisEl || !chart) return;
    try {
      var range = chart.timeScale().getVisibleRange();
      if (range && range.from != null && range.to != null) {
        var fromStr = formatTimeAxisLabel(range.from);
        var toStr = formatTimeAxisLabel(range.to);
        timeAxisEl.textContent = fromStr + " — " + toStr;
      } else {
        timeAxisEl.textContent = "";
      }
    } catch (_) {
      timeAxisEl.textContent = "";
    }
  }

  var chart = createChart(container, {
    layout: {
      textColor: "rgba(255,255,255,0.8)",
      background: { type: "solid", color: "transparent" },
      panes: {
        separatorColor: "rgba(255,255,255,0.1)",
        separatorHoverColor: "rgba(255,255,255,0.2)",
        enableResize: false,
      },
    },
    grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
    width: container.clientWidth,
    height: container.clientHeight,
    autoSize: true,
    timeScale: {
      visible: true,
      minimumHeight: 56,
      borderVisible: true,
      borderColor: "rgba(255,255,255,0.35)",
      timeVisible: true,
      secondsVisible: false,
    },
    rightPriceScale: { visible: false },
    leftPriceScale: { visible: true, borderColor: "rgba(255,255,255,0.2)" },
  });

  try {
    chart.timeScale().subscribeVisibleTimeRangeChange(updateTimeAxis);
  } catch (_) {}

  var seriesList = [];
  var priceDataBySeries = {};
  var volumeRawBySeries = {};
  var usoilRawData = [];
  var usoilScaleFactor = 1;
  var stackedBarSeries = null;

  function isUSOILById(seriesId) {
    return (seriesId || "").toUpperCase().indexOf("USOIL") !== -1;
  }

  function trimToMax(data, max) {
    if (!data || data.length <= max) return;
    data.splice(0, data.length - max);
  }

  function centered3PointAvg(arr) {
    if (!arr || arr.length < 3) return arr;
    var out = arr.slice();
    for (var i = 1; i < arr.length - 1; i++) out[i] = (arr[i - 1] + arr[i] + arr[i + 1]) / 3;
    return out;
  }

  function valueAt(data, t) {
    if (!data || data.length === 0) return NaN;
    if (data.length === 1) return data[0].x === t ? data[0].y : NaN;
    if (t <= data[0].x) return data[0].y;
    if (t >= data[data.length - 1].x) return data[data.length - 1].y;
    var lo = 0, hi = data.length - 1;
    while (lo + 1 < hi) {
      var mid = (lo + hi) >> 1;
      if (data[mid].x <= t) lo = mid; else hi = mid;
    }
    var a = data[lo], b = data[hi];
    var f = (t - a.x) / (b.x - a.x);
    return a.y + f * (b.y - a.y);
  }

  function toLwcPoints(arr) {
    if (!arr || !arr.length) return [];
    return arr.map(function (p) {
      return { time: toTime(p.x), value: p.y };
    });
  }

  function fitTimeScale() {
    try {
      chart.timeScale().fitContent();
      requestAnimationFrame(updateTimeAxis);
    } catch (_) {}
  }

  window.registerOilSeries = function (seriesId, label, color) {
    if (seriesList.some(function (s) { return s.seriesId === seriesId; })) return;
    var priceSeries = chart.addSeries(LineSeries, {
      color: color,
      lineWidth: 2,
      title: label,
      priceScaleId: "left",
    }, 0);
    var bpSeries = chart.addSeries(LineSeries, {
      color: color,
      lineWidth: 2,
      title: label,
      priceScaleId: "left",
    }, 1);
    if (!stackedBarSeries && typeof window.StackedBarsSeries === "function" && typeof chart.addCustomSeries === "function") {
      try {
        stackedBarSeries = chart.addCustomSeries(new window.StackedBarsSeries(), {
          colors: [color],
          priceFormat: { type: "volume" },
          priceScaleId: "left",
        }, 2);
      } catch (e) {
        stackedBarSeries = null;
      }
    }
    var entry = {
      seriesId: seriesId,
      label: label,
      color: color,
      priceSeries: priceSeries,
      bpSeries: bpSeries,
      visible: true,
    };
    if (!stackedBarSeries) {
      entry.volSeries = chart.addSeries(HistogramSeries, {
        color: color,
        priceFormat: { type: "volume" },
        title: label,
        priceScaleId: "left",
      }, 2);
    }
    seriesList.push(entry);
    priceDataBySeries[seriesId] = [];
    volumeRawBySeries[seriesId] = [];
    var panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(2);
    if (panes[1]) panes[1].setStretchFactor(1);
    if (panes[2]) panes[2].setStretchFactor(1);
    if (stackedBarSeries) stackedBarSeries.applyOptions({ colors: seriesList.length ? seriesList.map(function (s) { return s.color; }) : [] });
    buildLegend();
  };

  window.getOilSeriesList = function () {
    return seriesList.map(function (s, i) {
      return { seriesId: s.seriesId, label: s.label, color: s.color, index: i };
    });
  };

  function buildLegend() {
    var legendEl = document.getElementById("oil-legend");
    if (!legendEl) return;
    legendEl.innerHTML = "";
    legendEl.style.display = "flex";
    legendEl.style.flexWrap = "wrap";
    legendEl.style.gap = "0.5rem";
    legendEl.style.alignItems = "center";

    for (var i = 0; i < seriesList.length; i++) {
      var s = seriesList[i];
      var ds = { seriesId: s.seriesId, label: s.label, color: s.color, index: i };
      var item = document.createElement("div");
      item.className = "legend-item";
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.gap = "0.25rem";
      item.style.cursor = "pointer";
      item.style.userSelect = "none";

      var color = document.createElement("span");
      color.style.width = "12px";
      color.style.height = "12px";
      color.style.backgroundColor = ds.color || "#888";
      color.style.borderRadius = "2px";

      var isUSOIL = (ds.seriesId === "USOIL" || String(ds.label || "").toUpperCase() === "USOIL");
      var labelText = isUSOIL ? "km:USOIL " : (ds.label || ds.seriesId || "Series " + (i + 1));

      var text = document.createElement("span");
      text.appendChild(document.createTextNode(labelText));
      var rescaleLink = null;
      if (isUSOIL) {
        rescaleLink = document.createElement("span");
        rescaleLink.textContent = "(Rescaled)";
        rescaleLink.style.cursor = "pointer";
        rescaleLink.style.textDecoration = "underline";
        rescaleLink.style.opacity = "0.8";
        rescaleLink.addEventListener("click", function (e) {
          e.stopPropagation();
          if (typeof window.rescaleUSOILOnce === "function") window.rescaleUSOILOnce();
        });
        text.appendChild(document.createTextNode(" "));
        text.appendChild(rescaleLink);
      }

      item.appendChild(color);
      item.appendChild(text);
      legendEl.appendChild(item);

      (function (idx) {
        item.addEventListener("click", function (e) {
          if (isUSOIL && rescaleLink && rescaleLink.contains(e.target)) return;
          window.toggleOilSeriesVisibility(idx);
        });
      })(i);
    }
  }

  window.rebuildOilLegends = buildLegend;

  window.toggleOilSeriesVisibility = function (datasetIndex) {
    var entry = seriesList[datasetIndex];
    if (!entry) return;
    entry.visible = !entry.visible;
    entry.priceSeries.applyOptions({ visible: entry.visible });
    entry.bpSeries.applyOptions({ visible: entry.visible });
    if (entry.volSeries) entry.volSeries.applyOptions({ visible: entry.visible });
    if (stackedBarSeries) rebuildVolumeChart();
  };

  function applyUSOILScale() {
    var entry = seriesList.find(function (s) { return isUSOILById(s.seriesId); });
    if (!entry || usoilRawData.length === 0) return;
    var cutoff = usoilRawData[usoilRawData.length - 1].x - DATA_WINDOW_MS;
    var out = [];
    for (var i = 0; i < usoilRawData.length; i++) {
      if (usoilRawData[i].x < cutoff) continue;
      out.push({ x: usoilRawData[i].x, y: usoilRawData[i].y * usoilScaleFactor });
    }
    entry.priceSeries.setData(toLwcPoints(out));
    requestAnimationFrame(fitTimeScale);
  }

  function getPriceDataForSeries(entry) {
    if (isUSOILById(entry.seriesId)) {
      if (usoilRawData.length === 0) return [];
      return usoilRawData.map(function (p) { return { x: p.x, y: p.y * usoilScaleFactor }; });
    }
    return priceDataBySeries[entry.seriesId] || [];
  }

  function rebuildBpChart() {
    var allT = [];
    seriesList.forEach(function (entry) {
      var data = getPriceDataForSeries(entry);
      if (data) for (var i = 0; i < data.length; i++) allT.push(data[i].x);
    });
    if (allT.length === 0) return;
    allT.sort(function (a, b) { return a - b; });
    var uniqueT = [];
    for (var i = 0; i < allT.length; i++) if (i === 0 || allT[i] !== allT[i - 1]) uniqueT.push(allT[i]);

    var medianAtT = [];
    for (var ti = 0; ti < uniqueT.length; ti++) {
      var t = uniqueT[ti];
      var prices = [];
      seriesList.forEach(function (entry) {
        var data = getPriceDataForSeries(entry);
        if (data && data.length) {
          var v = valueAt(data, t);
          if (!Number.isNaN(v) && v > 0) prices.push(v);
        }
      });
      if (prices.length === 0) {
        medianAtT.push(NaN);
        continue;
      }
      prices.sort(function (a, b) { return a - b; });
      var midIdx = (prices.length - 1) >> 1;
      var med = prices.length % 2 === 1 ? prices[midIdx] : (prices[midIdx] + prices[midIdx + 1]) / 2;
      medianAtT.push(med);
    }

    seriesList.forEach(function (entry) {
      var data = getPriceDataForSeries(entry);
      if (!data || data.length === 0) return;
      var bpPoints = [];
      for (var ti = 0; ti < uniqueT.length; ti++) {
        var med = medianAtT[ti];
        if (!isFinite(med) || med <= 0) {
          bpPoints.push({ x: uniqueT[ti], y: 0 });
          continue;
        }
        var v = valueAt(data, uniqueT[ti]);
        var bp = Number.isNaN(v) || v <= 0 ? 0 : (v / med - 1) * 10000;
        bpPoints.push({ x: uniqueT[ti], y: bp });
      }
      if (bpPoints.length > 2) {
        var ys = bpPoints.map(function (p) { return p.y; });
        var smoothed = centered3PointAvg(ys);
        for (var i = 0; i < bpPoints.length; i++) bpPoints[i].y = smoothed[i];
      }
      entry.bpSeries.setData(toLwcPoints(bpPoints));
    });
    requestAnimationFrame(fitTimeScale);
  }

  var bpRebuildScheduled = false;
  function requestBpRebuild() {
    if (bpRebuildScheduled) return;
    bpRebuildScheduled = true;
    requestAnimationFrame(function () {
      bpRebuildScheduled = false;
      rebuildBpChart();
    });
  }

  function volumeAt(raw, t) {
    if (!raw || !raw.length) return NaN;
    return valueAt(raw.slice().sort(function (a, b) { return a.x - b.x; }), t);
  }

  function rebuildVolumeChart() {
    var allT = [];
    seriesList.forEach(function (entry) {
      var raw = volumeRawBySeries[entry.seriesId];
      if (raw) for (var i = 0; i < raw.length; i++) allT.push(raw[i].x);
    });
    if (allT.length === 0) {
      if (stackedBarSeries) stackedBarSeries.setData([]);
      else seriesList.forEach(function (entry) { if (entry.volSeries) entry.volSeries.setData([]); });
      requestAnimationFrame(fitTimeScale);
      return;
    }
    allT.sort(function (a, b) { return a - b; });
    var uniqueT = [];
    for (var i = 0; i < allT.length; i++) if (i === 0 || allT[i] !== allT[i - 1]) uniqueT.push(allT[i]);

    if (stackedBarSeries) {
      var points = [];
      for (var ti = 0; ti < uniqueT.length; ti++) {
        var t = uniqueT[ti];
        var values = seriesList.map(function (entry) {
          if (!entry.visible) return 0;
          var v = volumeAt(volumeRawBySeries[entry.seriesId], t);
          return Number.isNaN(v) || v < 0 ? 0 : v;
        });
        var total = 0;
        for (var k = 0; k < values.length; k++) total += values[k];
        if (total > 0) points.push({ time: toTime(t), values: values });
      }
      stackedBarSeries.setData(points);
      stackedBarSeries.applyOptions({ colors: seriesList.map(function (s) { return s.color; }) });
    } else {
      var n = seriesList.length;
      for (var si = 0; si < n; si++) {
        var revIdx = n - 1 - si;
        var pts = [];
        for (var ti = 0; ti < uniqueT.length; ti++) {
          var t = uniqueT[ti];
          var val = 0;
          for (var sj = 0; sj <= revIdx; sj++) {
            var v = volumeAt(volumeRawBySeries[seriesList[sj].seriesId], t);
            if (!Number.isNaN(v) && v > 0) val += v;
          }
          if (val > 0) pts.push({ time: toTime(t), value: val, color: seriesList[revIdx].color });
        }
        if (seriesList[si].volSeries) seriesList[si].volSeries.setData(pts);
      }
    }
    requestAnimationFrame(fitTimeScale);
  }

  window.rescaleUSOILOnce = function () {
    var entry = seriesList.find(function (s) { return isUSOILById(s.seriesId); });
    if (!entry || usoilRawData.length === 0) return;
    var latests = [];
    seriesList.forEach(function (s) {
      if (isUSOILById(s.seriesId)) return;
      var data = priceDataBySeries[s.seriesId];
      if (data && data.length > 0) latests.push(data[data.length - 1].y);
    });
    if (latests.length === 0) return;
    latests.sort(function (a, b) { return a - b; });
    var mid = (latests.length - 1) >> 1;
    var median = latests.length % 2 === 1 ? latests[mid] : (latests[mid] + latests[mid + 1]) / 2;
    var uLast = usoilRawData[usoilRawData.length - 1].y;
    if (uLast <= 0 || !isFinite(median) || median <= 0) return;
    usoilScaleFactor = median / uLast;
    applyUSOILScale();
    requestBpRebuild();
  };

  var usoilFlushScheduled = false;
  function flushUSOILToChart() {
    if (usoilRawData.length === 0) return;
    usoilRawData.sort(function (a, b) { return a.x - b.x; });
    var cutoff = usoilRawData[usoilRawData.length - 1].x - DATA_WINDOW_MS;
    var i = 0;
    while (i < usoilRawData.length && usoilRawData[i].x < cutoff) i++;
    if (i > 0) usoilRawData.splice(0, i);
    applyUSOILScale();
    requestBpRebuild();
  }
  function scheduleUSOILFlush() {
    if (usoilFlushScheduled) return;
    usoilFlushScheduled = true;
    requestAnimationFrame(function () {
      usoilFlushScheduled = false;
      flushUSOILToChart();
    });
  }

  var rescaleUSOILTimer = null;
  function scheduleRescaleUSOIL() {
    if (rescaleUSOILTimer != null) clearTimeout(rescaleUSOILTimer);
    rescaleUSOILTimer = setTimeout(function () {
      rescaleUSOILTimer = null;
      window.rescaleUSOILOnce();
    }, 500);
  }

  window.appendOilPoint = function (seriesId, tMs, y, volume) {
    var data = priceDataBySeries[seriesId];
    if (!data) return;
    var t = typeof tMs === "number" ? tMs : parseInt(tMs, 10);
    var yNum = typeof y === "number" ? y : parseFloat(y);
    if (Number.isNaN(t) || Number.isNaN(yNum)) return;
    if (volume != null && volumeRawBySeries[seriesId]) {
      var vNum = typeof volume === "number" ? volume : parseFloat(volume);
      if (!Number.isNaN(vNum)) {
        volumeRawBySeries[seriesId].push({ x: t, y: vNum });
        trimToMax(volumeRawBySeries[seriesId], getMaxCandles());
        rebuildVolumeChart();
      }
    }
    if (isUSOILById(seriesId)) {
      usoilRawData.push({ x: t, y: yNum });
      scheduleUSOILFlush();
      return;
    }
    data.push({ x: t, y: yNum });
    trimToMax(data, getMaxCandles());
    if (data.length > MAX_POINTS) trimToMax(data, MAX_POINTS);
    var entry = seriesList.find(function (s) { return s.seriesId === seriesId; });
    if (entry) entry.priceSeries.setData(toLwcPoints(data));
    requestBpRebuild();
  };

  window.setOilSeriesData = function (seriesId, points) {
    var data = priceDataBySeries[seriesId];
    if (!data || !Array.isArray(points)) return;
    var arr = points.map(function (p) {
      var x = typeof p.t !== "undefined" ? p.t : p.x;
      var y = typeof p.y !== "undefined" ? p.y : p.y;
      return { x: Number(x), y: Number(y) };
    }).filter(function (p) { return !Number.isNaN(p.x) && !Number.isNaN(p.y); });
    arr.sort(function (a, b) { return a.x - b.x; });
    trimToMax(arr, getMaxCandles());
    if (volumeRawBySeries[seriesId] && points.length > 0) {
      var volArr = points.map(function (p) {
        var x = typeof p.t !== "undefined" ? p.t : p.x;
        var v = typeof p.v !== "undefined" ? p.v : (p.volume != null ? p.volume : 0);
        return { x: Number(x), y: Number(v) || 0 };
      }).filter(function (p) { return !Number.isNaN(p.x); });
      volArr.sort(function (a, b) { return a.x - b.x; });
      trimToMax(volArr, getMaxCandles());
      volumeRawBySeries[seriesId] = volArr;
      rebuildVolumeChart();
    }
    if (isUSOILById(seriesId)) {
      usoilRawData = arr.slice();
      var cutoff = usoilRawData.length > 0 ? usoilRawData[usoilRawData.length - 1].x - DATA_WINDOW_MS : 0;
      var idx = 0;
      while (idx < usoilRawData.length && usoilRawData[idx].x < cutoff) idx++;
      if (idx > 0) usoilRawData.splice(0, idx);
      applyUSOILScale();
      requestBpRebuild();
      scheduleRescaleUSOIL();
      return;
    }
    priceDataBySeries[seriesId] = arr;
    var entry = seriesList.find(function (s) { return s.seriesId === seriesId; });
    if (entry) entry.priceSeries.setData(toLwcPoints(arr));
    requestBpRebuild();
    requestAnimationFrame(fitTimeScale);
  };

  window.registerHLOilSeries = window.registerOilSeries;
  window.appendHLOilPoint = window.appendOilPoint;
})();
