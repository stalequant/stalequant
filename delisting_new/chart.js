/* =========================
   Chart plotting
========================= */

const CHART_SCORE_FLOOR = 25;
const DELIST_SCORE_THRESHOLD = 30;

function plotChart(fig) {
    const themeLayout = {
        ...fig.layout,
        margin: { l: 54, r: 24, t: 10, b: 30 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: {
            family: 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial',
            size: 12,
            color: 'rgba(231,236,255,.9)'
        },
        hoverlabel: {
            align: 'left',
            bgcolor: 'rgba(12,16,28,.96)',
            bordercolor: 'rgba(255,255,255,.22)',
            font: {
                family: 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial',
                size: 12,
                color: 'rgba(245,248,255,.96)'
            }
        },
        title: { text: '' },
        xaxis: {
            ...fig.layout.xaxis,
            title: { text: '' },
            gridcolor: 'rgba(255,255,255,.08)',
            zerolinecolor: 'rgba(255,255,255,.10)'
        },
        yaxis: {
            ...fig.layout.yaxis,
            gridcolor: 'rgba(255,255,255,.08)',
            zerolinecolor: 'rgba(255,255,255,.10)'
        }
    };
    Plotly.newPlot('plotDiv', fig.data, themeLayout, { displayModeBar: false, responsive: true, scrollZoom: true });
}

function plotChartFromRows(rows) {
    const bucketLabels = ['Not listed', '3x', '5x', '10x', '20x+'];
    const bucketIndex = { 0: 0, 3: 1, 5: 2, 10: 3, 20: 4 };
    const groupedOffsets = new Map();

    const visibleRows = rows
        .filter(row => {
            const score = Number(row.Score);
            const maxLev = Number(row['Max Lev. on HL']);
            return Number.isFinite(score) && (score >= CHART_SCORE_FLOOR || maxLev > 0);
        })
        .map(row => {
            const bucket = chartLeverageBucket(row['Max Lev. on HL']);
            const xIndex = bucketIndex[bucket];
            const score = Number(row.Score);
            const maxLev = Number(row['Max Lev. on HL']);
            const plotScore = maxLev > 0 ? Math.max(CHART_SCORE_FLOOR, score) : score;
            const key = `${xIndex}:${plotScore}`;
            const offset = groupedOffsets.get(key) || 0;
            groupedOffsets.set(key, offset + 1);
            return { row, bucket, xIndex, offset, plotScore };
        });

    const maxOffsets = visibleRows.reduce((acc, item) => {
        const key = `${item.xIndex}:${item.plotScore}`;
        acc[key] = Math.max(acc[key] || 0, groupedOffsets.get(key) || 0);
        return acc;
    }, {});

    const x = [];
    const y = [];
    const text = [];

    visibleRows.forEach(item => {
        const maxOffset = Math.min(maxOffsets[`${item.xIndex}:${item.plotScore}`] || 1, 5);
        x.push(item.xIndex + (0.5 + item.offset % 5 - maxOffset / 2) / 6);
        y.push(item.plotScore + Math.floor(item.offset / 5) / 2);
        text.push(item.row.Recommendation || Number(item.row.Score) > 55 ? item.row.Symbol : '');
    });

    const data = [
        ...chartBands(rows),
        {
            type: 'scatter',
            mode: 'markers+text',
            x,
            y,
            text,
            textposition: 'middle center',
            textfont: { size: 8 },
            hoverinfo: 'skip',
            marker: { size: 8, opacity: 0.75, color: 'rgba(95,115,245,0.9)' },
        }
    ];

    plotChart({
        data,
        layout: {
            xaxis: {
                tickvals: [0, 1, 2, 3, 4],
                ticktext: bucketLabels,
                range: [-0.6, 4.6],
            },
            yaxis: {
                title: { text: 'Score' },
                range: [CHART_SCORE_FLOOR, 101],
                tick0: CHART_SCORE_FLOOR,
                dtick: 5,
            },
            barmode: 'overlay',
            showlegend: false,
            hovermode: false,
        }
    });
}

function chartLeverageBucket(maxLev) {
    const lev = Number(maxLev);
    if (lev <= 0) return 0;
    if (lev <= 3) return 3;
    if (lev <= 5) return 5;
    if (lev <= 10) return 10;
    return 20;
}

function chartBands(rows) {
    const buckets = [0, 3, 5, 10, 20];
    const idx = { 0: 0, 3: 1, 5: 2, 10: 3, 20: 4 };
    const percentileByBucket = buckets.reduce((acc, bucket) => {
        const scores = rows
            .filter(row => chartLeverageBucket(row['Max Lev. on HL']) === bucket)
            .map(row => Number(row.Score))
            .filter(score => Number.isFinite(score))
            .sort((a, b) => a - b);
        acc[bucket] = {
            median: percentile(scores, 0.5),
            p75: percentile(scores, 0.75),
            visibleP75: bucket === 0
                ? percentile(scores.filter(score => score > CHART_SCORE_FLOOR), 0.75)
                : null,
        };
        return acc;
    }, {});
    const bars = [];

    buckets.slice(0, -1).forEach((bucket, bucketIdx) => {
        const nextBucket = buckets[bucketIdx + 1];
        const threshold = percentileByBucket[nextBucket]?.median;
        if (!Number.isFinite(threshold) || idx[bucket] === undefined) return;

        bars.push({
            type: 'bar',
            x: [idx[bucket]],
            y: [Math.max(0, 100 - threshold)],
            base: [threshold],
            width: 0.8,
            marker: { color: 'rgba(0,200,0,0.25)' },
            hoverinfo: 'skip',
        });
    });

    buckets.slice(1).forEach((bucket, bucketIdx) => {
        const previousBucket = buckets[bucketIdx];
        const previousStats = percentileByBucket[previousBucket];
        const threshold = bucket === 3 ? DELIST_SCORE_THRESHOLD : previousStats?.p75;
        if (!Number.isFinite(threshold) || idx[bucket] === undefined) return;

        bars.push({
            type: 'bar',
            x: [idx[bucket]],
            y: [threshold],
            base: [0],
            width: 0.8,
            marker: { color: 'rgba(200,0,0,0.25)' },
            hoverinfo: 'skip',
        });
    });

    return bars;
}

function percentile(sortedValues, q) {
    if (!sortedValues.length) return null;
    const pos = (sortedValues.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sortedValues[base + 1];
    return next === undefined
        ? sortedValues[base]
        : sortedValues[base] + rest * (next - sortedValues[base]);
}
