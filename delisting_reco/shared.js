/* =========================
   Shared constants and utilities
========================= */

const HL_DATA_COLUMNS = [
    'Symbol', 'Max Lev. on HL', 'Strict', 'Recommendation', 'Score',
    'Market Cap Score', 'MC $m', 'Spot Volume Score', 'Spot Volume $m',
    'Spot Volume Geomean-3 $m', 'Futures Volume Score', 'Fut Volume $m',
    'Fut Volume Geomean-3 $m', 'Price Behavior Score',
    'Spot Volatility (std)', 'Spot Intraday range (std)',
    'HL Activity Score', 'Volume on HL $m', 'OI on HL $m',
    'HL Liquidity Score', 'HLP Vol Share %', 'HLP OI Share %',
    'HL Slip. $3k', 'HL Slip. $30k',
].map(f => ({ field: f, name: f, label: f, sortable: true }));

const NUMERIC_FIELDS = ['Max Lev. on HL', 'Score',
    'Market Cap Score', 'MC $m', 'Spot Volume Score', 'Spot Volume $m',
    'Spot Volume Geomean-3 $m', 'Futures Volume Score', 'Fut Volume $m',
    'Fut Volume Geomean-3 $m', 'Price Behavior Score',
    'Spot Volatility (std)', 'Spot Intraday range (std)',
    'HL Activity Score', 'Volume on HL $m', 'OI on HL $m',
    'HL Liquidity Score', 'HLP Vol Share %', 'HLP OI Share %',
    'HL Slip. $3k', 'HL Slip. $30k',
];

const FILTER_OPTIONS = [
    { label: 'Recommend Downgrade', value: 'downgrade' },
    { label: 'Recommend Upgrade', value: 'upgrade' },
    { label: 'All', value: 'all' },
    { label: 'Listed', value: 'listed' },
    { label: 'Not listed', value: 'unlisted' }
];

