/* =========================
   Shared constants and utilities
========================= */

const HEADER_LABEL_PARTS = {
    'Max Lev. on HL': ['Max.', 'Lev.'],
    'Recommendation': ['Reco'],
    'MC $m': ['MC', '$m'],
    'Spot Volume $m': ['Spot Vol.', '$m'],
    'Spot Liquidity bp ($10k)': ['Spot Slip.', 'bp'],
    'Oracle Score': ['Oracle', 'pts.'],
    'Fut Volume $m': ['Fut Vol.', '$m'],
    'Fut Liquidity bp ($100k)': ['Fut Slip.', 'bp'],
    'Volume on HL $m': ['HL Vol.', '$m'],
    'OI on HL $m': ['HL OI', '$m'],
    'HLP OI Share %': ['HLP OI', '%'],
    'HL Slip. $10k': ['HL Slip.', 'bp'],
};

const COLUMN_LABELS = {
    'Spot Volume $m': 'Spot Vol. $m',
    'Spot Liquidity bp ($10k)': 'Spot Slip. bp',
    'Oracle Score': 'Oracle pts.',
    'Fut Volume $m': 'Fut Vol. $m',
    'Fut Liquidity bp ($100k)': 'Fut Slip. bp',
    'Volume on HL $m': 'HL Vol. $m',
    'OI on HL $m': 'HL OI $m',
    'HLP OI Share %': 'HLP OI %',
    'HL Slip. $10k': 'HL Slip. bp',
};

const COLUMN_TOOLTIPS = {
    'Symbol': 'Asset symbol after upstream alias normalization.',
    'Max Lev. on HL': 'Current maximum leverage on Hyperliquid futures. N/A means the asset is not actively listed on HL futures.',
    'Recommendation': "Action suggested by the score relative to the asset's current HL leverage bucket.",
    'Score': 'Total score across the 10 scored categories. Higher means stronger listing or leverage profile.',
    'MC $m': 'Market capitalization in USD millions, using the median available market-source estimate.',
    'Spot Volume $m': 'Credible daily spot volume in USD millions across major spot venues.',
    'Spot Liquidity bp ($10k)': 'Estimated one-way basis-point cost from mid price for a $10K spot order. Lower is better.',
    'Oracle Score': 'Raw Hyperliquid oracle venue points from spot-market coverage. The factor grade is this point total mapped to 0-10 score points on a 1-to-11 scale.',
    'Fut Volume $m': 'Credible daily linear futures volume in USD millions across major futures venues.',
    'Fut Liquidity bp ($100k)': 'Estimated one-way basis-point cost from mid price for a $100K futures order. Lower is better.',
    'Volume on HL $m': 'Daily Hyperliquid futures notional volume in USD millions.',
    'OI on HL $m': 'Hyperliquid futures open interest in USD millions.',
    'HLP OI Share %': 'Share of Hyperliquid open interest represented by HLP, the Hyperliquid Liquidity Provider vault. Higher values mean more of the market risk is warehoused by HLP.',
    'HL Slip. $10k': 'Estimated one-way basis-point cost from mid price for a $10K Hyperliquid order. Lower is better.',
};

const HL_DATA_COLUMNS = [
    'Symbol', 'Max Lev. on HL', 'Recommendation', 'Score',
    'MC $m', 'Spot Volume $m', 'Spot Liquidity bp ($10k)',
    'Oracle Score', 'Fut Volume $m', 'Fut Liquidity bp ($100k)',
    'Volume on HL $m', 'OI on HL $m', 'HLP OI Share %',
    'HL Slip. $10k',
].map(f => ({
    field: f,
    name: f,
    label: COLUMN_LABELS[f] || f,
    labelParts: HEADER_LABEL_PARTS[f] || [f],
    tooltip: COLUMN_TOOLTIPS[f] || f,
    sortable: true
}));

const NUMERIC_FIELDS = ['Max Lev. on HL', 'Score',
    'MC $m', 'Spot Volume $m', 'Spot Liquidity bp ($10k)',
    'Oracle Score', 'Fut Volume $m', 'Fut Liquidity bp ($100k)',
    'Volume on HL $m', 'OI on HL $m', 'HLP OI Share %',
    'HL Slip. $10k',
];

const FILTER_OPTIONS = [
    { label: 'Downgrade', value: 'downgrade' },
    { label: 'Upgrade', value: 'upgrade' },
    { label: 'All', value: 'all' },
    { label: 'Listed', value: 'listed' },
    { label: 'Unlisted', value: 'unlisted' }
];

const REQUIRED_COLUMNS = ['Symbol', 'Recommendation'];

const LOWER_IS_BETTER_FIELDS = [
    'Spot Liquidity bp ($10k)',
    'Fut Liquidity bp ($100k)',
    'HLP OI Share %',
    'HL Slip. $10k',
];

const HL_ONLY_FIELDS = new Set([
    'Volume on HL $m',
    'OI on HL $m',
    'HLP OI Share %',
    'HL Slip. $10k',
]);

const MID_SLIPPAGE_FIELDS = new Set([
    'Spot Liquidity bp ($10k)',
    'Fut Liquidity bp ($100k)',
    'HL Slip. $10k',
]);

const FIELD_SCORE_SPECS = {
    'MC $m': { kind: 'exp', start: 1, end: 5000, steps: 10 },
    'Spot Volume $m': { kind: 'exp', start: 0.01, end: 1000, steps: 10 },
    'Spot Liquidity bp ($10k)': { kind: 'reverse_exp', start: 0.5, end: 500, steps: 10 },
    'Oracle Score': { kind: 'linear', start: 1, end: 11, steps: 10 },
    'Fut Volume $m': { kind: 'exp', start: 0.01, end: 1000, steps: 10 },
    'Fut Liquidity bp ($100k)': { kind: 'reverse_exp', start: 0.5, end: 500, steps: 10 },
    'Volume on HL $m': { kind: 'exp', start: 0.001, end: 1000, steps: 10 },
    'OI on HL $m': { kind: 'exp', start: 0.001, end: 1000, steps: 10 },
    'HLP OI Share %': { kind: 'reverse_linear', start: 0.001, end: 0.2, steps: 10 },
    'HL Slip. $10k': { kind: 'reverse_exp', start: 0.5, end: 500, steps: 10 },
};

const SCORE_GRADES = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];

