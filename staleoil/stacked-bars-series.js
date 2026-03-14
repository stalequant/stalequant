/**
 * Minimal StackedBars custom series for Lightweight Charts.
 * Data: { time, values: number[] } — one bar per time, segments stack (non-cumulative).
 * Options: { colors: string[] } — one color per segment.
 * @see https://tradingview.github.io/lightweight-charts/plugin-examples/plugins/stacked-bars-series/example/
 */
(function () {
  "use strict";

  var LWC = typeof window !== "undefined" && window.LightweightCharts;
  if (!LWC) return;

  function cumulativeSum(arr) {
    var sum = 0;
    return arr.map(function (v) {
      sum += v;
      return sum;
    });
  }

  function StackedBarsRenderer() {
    this._data = null;
    this._options = null;
  }

  StackedBarsRenderer.prototype.update = function (data, options) {
    this._data = data;
    this._options = options;
  };

  StackedBarsRenderer.prototype.draw = function (target, priceToCoordinate) {
    var data = this._data;
    var options = this._options;
    if (!data || !data.bars || data.bars.length === 0 || !data.visibleRange || !options) return;

    var visibleFrom = data.visibleRange.from;
    var visibleTo = data.visibleRange.to;
    var barSpacing = data.barSpacing;
    var colors = options.colors || [];

    target.useMediaCoordinateSpace(function (scope) {
      var ctx = scope.context;
      ctx.save();
      try {
        var zeroY = priceToCoordinate(0);
        var barWidth = Math.max(2, barSpacing * 0.85);

        for (var i = visibleFrom; i < visibleTo && i < data.bars.length; i++) {
          var bar = data.bars[i];
          if (bar.x == null || bar.x !== bar.x) continue;
          var values = bar && bar.originalData && bar.originalData.values;
          if (!values || values.length === 0) continue;

          var cum = cumulativeSum(values);
          var left = bar.x - barWidth / 2;
          var prevY = zeroY;

          for (var j = 0; j < cum.length; j++) {
            if (values[j] <= 0) continue;
            var segTop = priceToCoordinate(cum[j]);
            var y = Math.min(prevY, segTop);
            var h = Math.abs(segTop - prevY);
            if (h < 0.5) continue;
            ctx.fillStyle = colors[j % colors.length] || "#888";
            ctx.fillRect(left, y, barWidth, h);
            prevY = segTop;
          }
        }
      } finally {
        ctx.restore();
      }
    });
  };

  function StackedBarsSeries() {
    this._renderer = new StackedBarsRenderer();
  }

  StackedBarsSeries.prototype.priceValueBuilder = function (plotRow) {
    var values = plotRow.values;
    if (!values || !values.length) return [0, 0];
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    return [0, sum];
  };

  StackedBarsSeries.prototype.isWhitespace = function (data) {
    return !(data && data.values && data.values.length);
  };

  StackedBarsSeries.prototype.renderer = function () {
    return this._renderer;
  };

  StackedBarsSeries.prototype.update = function (data, options) {
    this._renderer.update(data, options);
  };

  StackedBarsSeries.prototype.defaultOptions = function () {
    return {
      colors: ["#2962FF", "#E1575A", "#F28E2C", "rgb(164, 89, 209)", "rgb(27, 156, 133)"],
    };
  };

  window.StackedBarsSeries = StackedBarsSeries;
})();
