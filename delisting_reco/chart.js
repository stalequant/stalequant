/* =========================
   Chart plotting
========================= */

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

