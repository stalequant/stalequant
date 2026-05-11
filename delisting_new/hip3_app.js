/* =========================
   HIP-3 page initialization
========================= */

const HIP3_COLUMNS = [
    { field: 'dex', label: 'Dex', tooltip: 'Hyperliquid dex namespace. main is Hypercore; other values are HIP-3 dexes.', sortable: true },
    { field: 'symbol', label: 'Symbol', tooltip: 'Asset symbol displayed inside the selected dex.', sortable: true },
    { field: 'max_leverage', label: 'Max Lev.', tooltip: 'Maximum leverage configured for this asset on its Hyperliquid dex.', sortable: true, numeric: true },
    { field: 'margin_mode', label: 'Margin Mode', tooltip: 'Cross, isolated, or strict isolated margin mode inferred from Hyperliquid metadata.', sortable: true },
    { field: 'day_notional_volume', label: '24h Vol. $', tooltip: 'Hyperliquid reported rolling 24-hour notional trading volume from the latest asset context.', sortable: true, numeric: true, money: true },
    { field: 'open_interest_dollars', label: 'OI $', tooltip: 'Open interest multiplied by mark price, falling back to oracle or mid price when needed.', sortable: true, numeric: true, money: true },
    { field: 'streaming_oi_cap', label: 'OI Cap $', tooltip: 'Current streaming open-interest cap configured in Hyperliquid dex metadata assetToStreamingOiCap; this is the live configured cap used by the report.', sortable: true, numeric: true, money: true },
    { field: 'hl_l2_1k_bp', label: '$1K L2 slip bp', tooltip: 'Median one-way Hyperliquid taker slippage from mid in bp for $1K notional.', sortable: true, numeric: true, half: true },
    { field: 'hl_l2_10k_bp', label: '$10K L2 slip bp', tooltip: 'Median one-way Hyperliquid taker slippage from mid in bp for $10K notional.', sortable: true, numeric: true, half: true },
    { field: 'hl_l2_100k_bp', label: '$100K L2 slip bp', tooltip: 'Median one-way Hyperliquid taker slippage from mid in bp for $100K notional.', sortable: true, numeric: true, half: true },
    { field: 'hl_l2_1m_bp', label: '$1M L2 slip bp', tooltip: 'Median one-way Hyperliquid taker slippage from mid in bp for $1M notional.', sortable: true, numeric: true, half: true },
    { field: 'funding_multiplier', label: 'Funding Mult.', tooltip: 'Hyperliquid metadata field assetToFundingMultiplier. It scales the market funding calculation; blank means no asset-specific multiplier was provided.', sortable: true, numeric: true },
    { field: 'growth_mode', label: 'Growth', tooltip: 'Hyperliquid asset growthMode metadata. Currently observed values are enabled or blank; blank means no growth-mode flag was provided.', sortable: true },
];

const HIP3_SCORE_COLUMNS = [
    { field: 'dex', label: 'Dex', tooltip: 'Hyperliquid dex namespace. main is Hypercore; other values are HIP-3 dexes.', sortable: true },
    { field: 'symbol', label: 'Symbol', tooltip: 'Asset symbol displayed inside the selected dex.', sortable: true },
    { field: 'margin_mode', label: 'Margin Mode', tooltip: 'Cross, isolated, or strict isolated margin mode inferred from Hyperliquid metadata.', sortable: true },
    { field: 'im_pct', label: 'MM bp', tooltip: 'Maintenance margin estimate following the exchange-style calculation: 1 / max leverage / 2, displayed in basis points.', sortable: true, numeric: true, bp: true },
    { field: 'max_pct_mm', label: 'Max Risk', tooltip: 'Largest available risk metric as a percent of maintenance margin across oracle jumps and slippage. Higher means the most concerning metric is using more of the maintenance margin buffer.', sortable: true, numeric: true, percentPoints: true, pctOfImDisplay: true },
    { field: 'score_oi_cap_to_oi', label: 'OI Cap / (OI + $100K)', tooltip: 'Streaming OI cap divided by open interest dollars plus $100K. The $100K term downweights tiny-OI markets as less systemically concerning.', sortable: true, numeric: true, decimals: 1, gradeField: 'score_oi_cap_to_oi_grade', hideGrade: true },
    { field: 'weekly_15s_index_dev', label: 'Jump 15s bp', tooltip: 'Empirical absolute 15-second oracle log-price move at the once-per-week tail frequency, in bp.', sortable: true, numeric: true, decimals: 0, metricGrade: true },
    { field: 'weekly_15s_pct_im', label: '% MM', tooltip: '15-second oracle jump as a percent of maintenance margin.', sortable: true, numeric: true, percentPoints: true, pctOfImDisplay: true },
    { field: 'weekly_15m_index_dev', label: 'Jump 15m bp', tooltip: 'Empirical absolute 15-minute oracle log-price move using a quantile equivalent to about one exceedance per week of non-overlapping 15-minute windows, in bp.', sortable: true, numeric: true, decimals: 0, metricGrade: true },
    { field: 'weekly_15m_pct_im', label: '% MM', tooltip: '15-minute oracle jump as a percent of maintenance margin.', sortable: true, numeric: true, percentPoints: true, pctOfImDisplay: true },
    { field: 'score_impact_5pct_oi_bp', label: '5% OI Slippage', tooltip: 'Estimated one-way slippage from mid for an order sized at 5% of open interest.', sortable: true, numeric: true, decimals: 0, half: true, metricGrade: true, strictness: 2 },
    { field: 'impact_5pct_oi_pct_im', label: '% MM', tooltip: '5% OI slippage as a percent of maintenance margin.', sortable: true, numeric: true, percentPoints: true, pctOfImDisplay: true, strictness: 2 },
    { field: 'hl_l2_10k_bp', label: '$10K Slippage', tooltip: 'Estimated one-way slippage from mid for a $10K order.', sortable: true, numeric: true, decimals: 0, half: true, metricGrade: true, strictness: 2 },
    { field: 'hl_l2_10k_pct_im', label: '% MM', tooltip: '$10K slippage as a percent of maintenance margin.', sortable: true, numeric: true, percentPoints: true, pctOfImDisplay: true, strictness: 2 },
];

const HIP3_GRADES = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
const HIP3_PLOT_CONFIGS = [
    { id: 'hip3PlotJump15s', field: 'weekly_15s_index_dev', label: 'Jump 15s bp' },
    { id: 'hip3PlotJump15m', field: 'weekly_15m_index_dev', label: 'Jump 15m bp' },
    { id: 'hip3PlotSlipOi', field: 'score_impact_5pct_oi_bp', label: '5% OI Slippage', half: true },
    { id: 'hip3PlotSlip10k', field: 'hl_l2_10k_bp', label: '$10K Slippage', half: true },
];

const HIP3_WARNING_TOOLTIPS = {
    'Historical 15-second oracle moves high relative to MM': 'Measure: 15-second oracle jump as a percent of maintenance margin. Yellow starts at 50% MM for cross, 75% for isolated, and 100% for strict isolated.',
    'Historical 15-minute oracle moves high relative to MM': 'Measure: 15-minute oracle jump as a percent of maintenance margin. Yellow starts at 100% MM for cross, 150% for isolated, and 200% for strict isolated.',
    'Slippage on $10k high relative to MM': 'Measure: one-way $10K order book slippage as a percent of maintenance margin. Yellow starts at 50% MM for cross, 75% for isolated, and 100% for strict isolated.',
    'Slippage on 5% of OI high relative to MM': 'Measure: one-way slippage for 5% of open interest as a percent of maintenance margin. Yellow starts at 50% MM for cross, 75% for isolated, and 100% for strict isolated.',
    'High OI Cap headroom': 'Measure: streaming OI cap divided by open interest dollars plus $100K. Yellow starts above 20x for cross, 50x for isolated, and 100x for strict isolated.',
    'Data gathering in progress, incomplete analysis': 'The market has insufficient oracle history for one or more jump-risk estimates.',
    'Missing $10k L2 snapshot': 'No usable $10K order book depth snapshot is available for the market.',
};

function hip3ImPct(row) {
    const maxLeverage = Number(row.max_leverage);
    return Number.isFinite(maxLeverage) && maxLeverage > 0 ? 1 / maxLeverage / 2 : null;
}

function hip3DisplayedMetricValue(row, col) {
    if (row[col.field] === null || row[col.field] === undefined || row[col.field] === '') return null;
    const value = Number(row[col.field]);
    if (!Number.isFinite(value)) return null;
    if (col.bp) return value * 10000;
    if (col.half) return value / 2;
    return value;
}

function hip3HasNumericRaw(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function hip3Max(values) {
    const numericValues = values.filter(value => Number.isFinite(value));
    return numericValues.length ? Math.max(...numericValues) : null;
}

function hip3PctOfIm(row, col) {
    if (!col.metricGrade && !col.pctOfImDisplay) return null;
    const imBp = hip3DisplayedMetricValue(row, { field: 'im_pct', bp: true });
    const metric = hip3DisplayedMetricValue(row, col);
    if (!Number.isFinite(imBp) || imBp <= 0 || !Number.isFinite(metric) || metric <= 0) return null;
    return (metric / imBp) * 100;
}

function hip3GradePoints(row, col) {
    const pctOfIm = col.pctOfImDisplay ? Number(row[col.field]) : hip3PctOfIm(row, col);
    if (!Number.isFinite(pctOfIm)) return null;
    const strictness = Number.isFinite(Number(col.strictness)) ? Number(col.strictness) : 1;
    const ratio = (pctOfIm / 100) * strictness;
    if (ratio <= 0.1) return HIP3_GRADES.length - 1;
    if (ratio >= 1) return 0;
    const position = Math.log(ratio / 0.1) / Math.log(1 / 0.1);
    return Math.max(0, Math.min(HIP3_GRADES.length - 1, Math.floor((1 - position) * (HIP3_GRADES.length - 1))));
}

function hip3FormatPct(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(0)}%` : 'N/A';
}

function hip3FormatPctMm(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(0)}% MM` : 'N/A';
}

function formatWarningCount(count, total) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return `${count} of ${total} pairs flagged (${pct.toFixed(1)}%)`;
}

function hip3GradePointsFromLabel(label) {
    const index = HIP3_GRADES.indexOf(String(label || ''));
    return index >= 0 ? index : null;
}

function hip3Quantile(values, q) {
    const numericValues = values
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
        .sort((a, b) => a - b);
    if (!numericValues.length) return null;
    if (numericValues.length === 1) return numericValues[0];
    const position = (numericValues.length - 1) * q;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return numericValues[lower];
    return numericValues[lower] + (numericValues[upper] - numericValues[lower]) * (position - lower);
}

function hip3QuantileBand(rows, metric) {
    const groups = new Map();
    rows.forEach(row => {
        const x = Math.round(hip3DisplayedMetricValue(row, { field: 'im_pct', bp: true }));
        const y = hip3DisplayedMetricValue(row, metric);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (!groups.has(x)) groups.set(x, []);
        groups.get(x).push(y);
    });
    return Array.from(groups, ([x, values]) => ({
        x,
        low: hip3Quantile(values, 0.1),
        high: hip3Quantile(values, 0.9),
    }))
        .filter(row => Number.isFinite(row.low) && Number.isFinite(row.high))
        .sort((a, b) => a.x - b.x);
}

function hip3BandTrace(rows, metric, name, color) {
    const band = hip3QuantileBand(rows, metric);
    if (!band.length) return null;
    const x = band.map(row => row.x);
    const low = band.map(row => row.low);
    const high = band.map(row => row.high);
    return {
        x: [...x, ...x.slice().reverse()],
        y: [...low, ...high.slice().reverse()],
        fill: 'toself',
        fillcolor: color,
        line: { color: 'rgba(0,0,0,0)' },
        hoverinfo: 'skip',
        name,
        type: 'scatter',
    };
}

function hip3PointTrace(rows, metric, name, color) {
    const points = rows
        .map(row => ({
            x: Math.round(hip3DisplayedMetricValue(row, { field: 'im_pct', bp: true })),
            y: hip3DisplayedMetricValue(row, metric),
            symbol: row.symbol,
            dex: row.dex,
            mode: row.margin_mode,
        }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    return {
        x: points.map(point => point.x),
        y: points.map(point => point.y),
        text: points.map(point => `  ${point.symbol}`),
        mode: 'markers+text',
        textposition: 'middle right',
        textfont: { color: '#ffffff', size: 10 },
        marker: { color, size: 3 },
        hoverinfo: 'skip',
        name,
        type: 'scatter',
    };
}

function hip3MarginModeBucket(row) {
    const mode = String(row.margin_mode || '').toLowerCase();
    if (mode.includes('strict')) return 'strict isolated';
    if (mode.includes('isolated')) return 'isolated';
    return 'cross';
}

function hip3WarningAssetLabel(row) {
    const leverage = Number(row.max_leverage);
    const leverageLabel = Number.isFinite(leverage) && leverage > 0 ? `${leverage}x` : 'NAx';
    const mode = hip3MarginModeBucket(row);
    const modePrefix = mode === 'strict isolated' ? 'Strict' : mode === 'isolated' ? 'Iso' : '';
    return `${modePrefix}${leverageLabel}${hip3DexLabel(row.dex)}:${row.symbol}`;
}

function hip3DexLabel(value) {
    return value === 'main' ? 'Hypercore' : value;
}

function hip3ThresholdByMode(row, thresholds) {
    return thresholds[hip3MarginModeBucket(row)] ?? thresholds.cross;
}

function hip3WarningSeverityFromThreshold(value, threshold) {
    if (!Number.isFinite(value) || !Number.isFinite(threshold) || threshold <= 0) return 'yellow';
    if (value >= threshold * 1.5) return 'danger';
    if (value >= threshold * 1.25) return 'orange';
    return 'yellow';
}

function hip3PushThresholdWarning(warnings, row, spec) {
    const value = Number(row[spec.field]);
    const threshold = hip3ThresholdByMode(row, spec.thresholds);
    if (!Number.isFinite(value) || !Number.isFinite(threshold) || value < threshold) return;
    warnings.push({
        label: spec.label,
        value: spec.format(value),
        severity: hip3WarningSeverityFromThreshold(value, threshold),
    });
}

function hip3BuildWarnings(row) {
    const warnings = [];

    [
        {
            label: 'Historical 15-second oracle moves high relative to MM',
            field: 'weekly_15s_pct_im',
            thresholds: { cross: 50, isolated: 75, 'strict isolated': 100 },
            format: hip3FormatPctMm,
        },
        {
            label: 'Historical 15-minute oracle moves high relative to MM',
            field: 'weekly_15m_pct_im',
            thresholds: { cross: 100, isolated: 150, 'strict isolated': 200 },
            format: hip3FormatPctMm,
        },
        {
            label: 'Slippage on $10k high relative to MM',
            field: 'hl_l2_10k_pct_im',
            thresholds: { cross: 50, isolated: 75, 'strict isolated': 100 },
            format: hip3FormatPctMm,
        },
        {
            label: 'Slippage on 5% of OI high relative to MM',
            field: 'impact_5pct_oi_pct_im',
            thresholds: { cross: 50, isolated: 75, 'strict isolated': 100 },
            format: hip3FormatPctMm,
        },
        {
            label: 'High OI Cap headroom',
            field: 'score_oi_cap_to_oi',
            thresholds: { cross: 20, isolated: 50, 'strict isolated': 100 },
            format: value => `${value.toFixed(1)}x`,
        },
    ].forEach(spec => {
        hip3PushThresholdWarning(warnings, row, spec);
    });

    if (!hip3HasNumericRaw(row.weekly_15s_index_dev) || !hip3HasNumericRaw(row.weekly_15m_index_dev)) {
        warnings.push({
            label: 'Data gathering in progress, incomplete analysis',
            value: 'N/A',
            severity: 'grey',
        });
    }

    if (!Number.isFinite(Number(row.hl_l2_10k_bp))) {
        warnings.push({
            label: 'Missing $10k L2 snapshot',
            value: 'N/A',
            severity: 'yellow',
        });
    }

    return warnings;
}

function formatNumber(value, options = {}) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return '-';
    const displayValue = options.half ? numberValue / 2 : numberValue;
    if (options.percent) return `${(displayValue * 100).toFixed(4)}%`;
    if (options.percentPoints) return `${displayValue.toFixed(0)}%`;
    if (options.bp) return (displayValue * 10000).toFixed(0);
    if (options.small) return displayValue.toFixed(6);
    if (options.money) {
        if (Math.abs(displayValue) >= 1e9) return `$${(displayValue / 1e9).toFixed(2)}B`;
        if (Math.abs(displayValue) >= 1e6) return `$${(displayValue / 1e6).toFixed(2)}M`;
        if (Math.abs(displayValue) >= 1e3) return `$${(displayValue / 1e3).toFixed(2)}K`;
        return `$${displayValue.toFixed(2)}`;
    }
    if (Number.isInteger(options.decimals)) return displayValue.toFixed(options.decimals);
    let maximumFractionDigits = 4;
    if (Math.abs(displayValue) >= 100) maximumFractionDigits = 0;
    else if (Math.abs(displayValue) >= 10) maximumFractionDigits = 2;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(displayValue);
}

function formatTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString(undefined, {
        timeZone: 'UTC',
        timeZoneName: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatHeaderTime(value) {
    if (!value) return 'unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'unavailable';
    const datePart = date.toLocaleDateString('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const timePart = date.toLocaleTimeString('en-US', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
    return `${datePart} ${timePart} UTC`;
}

fetchHip3Data()
    .then(hip3Payload => {
        const { createApp } = Vue;
        const dexRows = Array.isArray(hip3Payload.dexes) ? hip3Payload.dexes : [];
        const defaultDex = dexRows.some(row => row.dex === 'main') ? 'main' : (dexRows[0]?.dex || '');
        const app = createApp({
            data: () => ({
                meta: hip3Payload.meta || {},
                rows: Array.isArray(hip3Payload.data) ? hip3Payload.data : [],
                dexes: dexRows,
                columns: HIP3_COLUMNS,
                scoreColumns: HIP3_SCORE_COLUMNS,
                plotConfigs: HIP3_PLOT_CONFIGS,
                selectedDex: defaultDex,
                searchQuery: '',
                sortColumn: 'day_notional_volume',
                sortDirection: 'desc',
                scoreSortColumn: 'max_pct_mm',
                scoreSortDirection: 'desc',
                currentPage: 1,
                scoreCurrentPage: 1,
                rowsPerPage: 50,
            }),

            computed: {
                dexOptions() {
                    return this.dexes.map(row => row.dex);
                },

                enrichedRows() {
                    return this.rows
                        .map(row => {
                            const enriched = { ...row, im_pct: hip3ImPct(row) };
                            enriched.weekly_15s_pct_im = hip3PctOfIm(enriched, { field: 'weekly_15s_index_dev', metricGrade: true });
                            enriched.weekly_15m_pct_im = hip3PctOfIm(enriched, { field: 'weekly_15m_index_dev', metricGrade: true });
                            enriched.impact_5pct_oi_pct_im = hip3PctOfIm(enriched, { field: 'score_impact_5pct_oi_bp', half: true, metricGrade: true });
                            enriched.hl_l2_10k_pct_im = hip3PctOfIm(enriched, { field: 'hl_l2_10k_bp', half: true, metricGrade: true });
                            enriched.max_pct_mm = hip3Max([
                                enriched.weekly_15s_pct_im,
                                enriched.weekly_15m_pct_im,
                                enriched.impact_5pct_oi_pct_im,
                                enriched.hl_l2_10k_pct_im,
                            ]);
                            enriched.warnings = hip3BuildWarnings(enriched);
                            return enriched;
                        });
                },

                filteredRows() {
                    const query = this.searchQuery.toLowerCase();
                    return this.enrichedRows
                        .filter(row => !this.selectedDex || row.dex === this.selectedDex)
                        .filter(row => {
                            if (!query) return true;
                            return [row.symbol, row.wire_symbol]
                                .filter(Boolean)
                                .some(value => String(value).toLowerCase().includes(query));
                        });
                },

                sortedRows() {
                    const rows = [...this.filteredRows];
                    const col = this.columns.find(column => column.field === this.sortColumn);
                    const direction = this.sortDirection === 'asc' ? 1 : -1;
                    return rows.sort((a, b) => {
                        const aValue = a[this.sortColumn];
                        const bValue = b[this.sortColumn];
                        if (col?.numeric) {
                            return this.compareNumeric(aValue, bValue) * direction;
                        }
                        return String(aValue ?? '').localeCompare(String(bValue ?? '')) * direction;
                    });
                },

                warningRows() {
                    return this.filteredRows.filter(row => Array.isArray(row.warnings) && row.warnings.length);
                },

                warningCountLabel() {
                    return formatWarningCount(this.warningRows.length, this.filteredRows.length);
                },

                hasMaintenanceMarginWarnings() {
                    return this.warningGroups.some(group => !group.isOiCap);
                },

                warningGroups() {
                    const groups = new Map();
                    this.warningRows.forEach(row => {
                        row.warnings.forEach(warning => {
                            if (!groups.has(warning.label)) {
                                groups.set(warning.label, []);
                            }
                            groups.get(warning.label).push({
                                symbol: row.symbol,
                                dex: row.dex,
                                assetLabel: hip3WarningAssetLabel(row),
                                value: warning.value,
                                severity: warning.severity,
                            });
                        });
                    });
                    const total = this.filteredRows.length;
                    return Array.from(groups, ([label, rows]) => ({
                        label,
                        rows: rows.slice(0, 80),
                        overflowCount: Math.max(0, rows.length - 80),
                        countLabel: formatWarningCount(rows.length, total),
                        tooltip: HIP3_WARNING_TOOLTIPS[label] || label,
                        isOiCap: label === 'High OI Cap headroom',
                    })).sort((a, b) => {
                        if (a.isOiCap !== b.isOiCap) return a.isOiCap ? 1 : -1;
                        return a.label.localeCompare(b.label);
                    });
                },

                paginatedRows() {
                    const start = (this.currentPage - 1) * this.rowsPerPage;
                    return this.sortedRows.slice(start, start + this.rowsPerPage);
                },

                sortedScoreRows() {
                    const rows = [...this.filteredRows];
                    const col = this.scoreColumns.find(column => column.field === this.scoreSortColumn);
                    const direction = this.scoreSortDirection === 'asc' ? 1 : -1;
                    return rows.sort((a, b) => {
                        const aValue = a[this.scoreSortColumn];
                        const bValue = b[this.scoreSortColumn];
                        if (col?.numeric) {
                            return this.compareNumeric(aValue, bValue) * direction;
                        }
                        return String(aValue ?? '').localeCompare(String(bValue ?? '')) * direction;
                    });
                },

                paginatedScoreRows() {
                    const start = (this.scoreCurrentPage - 1) * this.rowsPerPage;
                    return this.sortedScoreRows.slice(start, start + this.rowsPerPage);
                },

                totalPages() {
                    return Math.max(1, Math.ceil(this.sortedRows.length / this.rowsPerPage));
                },

                scoreTotalPages() {
                    return Math.max(1, Math.ceil(this.sortedScoreRows.length / this.rowsPerPage));
                },

                paginationLabel() {
                    if (!this.sortedRows.length) return 'Showing 0 rows';
                    const start = (this.currentPage - 1) * this.rowsPerPage + 1;
                    const end = Math.min(this.currentPage * this.rowsPerPage, this.sortedRows.length);
                    return `Showing ${start}-${end} of ${this.sortedRows.length} rows`;
                },

                scorePaginationLabel() {
                    if (!this.sortedScoreRows.length) return 'Showing 0 rows';
                    const start = (this.scoreCurrentPage - 1) * this.rowsPerPage + 1;
                    const end = Math.min(this.scoreCurrentPage * this.rowsPerPage, this.sortedScoreRows.length);
                    return `Showing ${start}-${end} of ${this.sortedScoreRows.length} rows`;
                },

                generatedAtLabel() {
                    return this.meta.generated_at_utc ? `generated ${formatTime(this.meta.generated_at_utc)}` : '';
                },

                generatedHeaderLabel() {
                    return formatHeaderTime(this.meta.generated_at_utc);
                },

            },

            mounted() {
                this.$nextTick(() => this.renderHip3Plots());
            },

            watch: {
                selectedDex() {
                    this.currentPage = 1;
                    this.scoreCurrentPage = 1;
                    this.$nextTick(() => this.renderHip3Plots());
                },
                searchQuery() {
                    this.currentPage = 1;
                    this.scoreCurrentPage = 1;
                },
                totalPages() {
                    this.currentPage = Math.min(this.currentPage, this.totalPages);
                },
                scoreTotalPages() {
                    this.scoreCurrentPage = Math.min(this.scoreCurrentPage, this.scoreTotalPages);
                },
                enrichedRows() {
                    this.$nextTick(() => this.renderHip3Plots());
                },
            },

            methods: {
                sortBy(col) {
                    if (!col.sortable) return;
                    if (this.sortColumn === col.field) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortColumn = col.field;
                        this.sortDirection = col.numeric ? 'desc' : 'asc';
                    }
                    this.currentPage = 1;
                },

                sortScoreBy(col) {
                    if (!col.sortable) return;
                    if (this.scoreSortColumn === col.field) {
                        this.scoreSortDirection = this.scoreSortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.scoreSortColumn = col.field;
                        this.scoreSortDirection = col.numeric ? 'desc' : 'asc';
                    }
                    this.scoreCurrentPage = 1;
                },

                sortIndicator(col) {
                    return this.sortColumn === col.field ? this.sortDirection : '';
                },

                scoreSortIndicator(col) {
                    return this.scoreSortColumn === col.field ? this.scoreSortDirection : '';
                },

                compareNumeric(aValue, bValue) {
                    const aNumber = Number(aValue);
                    const bNumber = Number(bValue);
                    const aMissing = !Number.isFinite(aNumber);
                    const bMissing = !Number.isFinite(bNumber);
                    if (aMissing && bMissing) return 0;
                    if (aMissing) return 1;
                    if (bMissing) return -1;
                    return aNumber - bNumber;
                },

                hasNumericValue(value) {
                    return value !== null
                        && value !== undefined
                        && value !== ''
                        && Number.isFinite(Number(value));
                },

                rawMetricCellGrade(row, col) {
                    if (col.hideGrade) return '';
                    return col.gradeField ? (row[col.gradeField] || '') : '';
                },

                rawMetricCellStyle(row, col) {
                    if (!col.metricGrade && !col.pctOfImDisplay && !col.gradeField) return {};
                    const points = col.gradeField
                        ? hip3GradePointsFromLabel(row[col.gradeField])
                        : hip3GradePoints(row, col);
                    if (!Number.isInteger(points)) return {};
                    return this.heatColor(points / (HIP3_GRADES.length - 1));
                },

                heatColor(normalized) {
                    const hue = 4 + normalized * 142;
                    const alpha = 0.22 + Math.abs(normalized - 0.5) * 0.22;
                    return {
                        backgroundColor: `hsla(${hue}, 70%, 36%, ${alpha})`,
                    };
                },

                formatCell(value, col) {
                    if (value === null || value === undefined || value === '') return '-';
                    if (col?.field === 'dex') return hip3DexLabel(value);
                    if (col.numeric) return formatNumber(value, col);
                    return value;
                },

                formatMoney(value) {
                    return formatNumber(value, { money: true });
                },

                dexLabel(value) {
                    return hip3DexLabel(value);
                },

                formatMetaNumber(value) {
                    const numberValue = Number(value);
                    if (!Number.isFinite(numberValue)) return '-';
                    return new Intl.NumberFormat('en-US').format(numberValue);
                },

                formatMetaTime(value) {
                    return formatTime(value);
                },

                formatTime,

                renderHip3Plots() {
                    if (!window.Plotly) return;
                    const rows = this.enrichedRows;
                    const mainRows = rows.filter(row => row.dex === 'main' && hip3MarginModeBucket(row) === 'cross');
                    const hip3CrossRows = rows.filter(row => row.dex !== 'main' && hip3MarginModeBucket(row) === 'cross');
                    const selectedRows = rows.filter(row => row.dex === this.selectedDex);
                    const selectedCrossRows = selectedRows.filter(row => hip3MarginModeBucket(row) === 'cross');

                    this.plotConfigs.forEach(metric => {
                        const target = document.getElementById(metric.id);
                        if (!target) return;
                        const traces = [
                            hip3BandTrace(mainRows, metric, 'Hypercore', 'rgba(74, 144, 226, 0.25)'),
                            hip3BandTrace(hip3CrossRows, metric, 'HIP-3', 'rgba(68, 170, 118, 0.25)'),
                            hip3PointTrace(selectedCrossRows, metric, 'Cross margin', '#ffffff'),
                        ].filter(Boolean);

                        const layout = {
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            font: { color: '#d8dde8', size: 11 },
                            margin: { l: 48, r: 18, t: 24, b: 42 },
                            xaxis: {
                                title: 'Maintenance Margin bp',
                                range: [0, 2000],
                                gridcolor: 'rgba(255,255,255,0.08)',
                                zerolinecolor: 'rgba(255,255,255,0.12)',
                            },
                            yaxis: {
                                title: metric.label,
                                gridcolor: 'rgba(255,255,255,0.08)',
                                zerolinecolor: 'rgba(255,255,255,0.12)',
                            },
                            legend: {
                                orientation: 'h',
                                x: 0,
                                y: 1.16,
                                entrywidth: 0.33,
                                entrywidthmode: 'fraction',
                                bgcolor: 'rgba(0,0,0,0)',
                                font: { size: 10 },
                            },
                            hovermode: false,
                        };
                        Plotly.react(target, traces, layout, { displayModeBar: false, responsive: true });
                    });
                },

                downloadCSV() {
                    const header = this.columns.map(col => `"${col.label}"`).join(',');
                    const rows = this.sortedRows.map(row =>
                        this.columns.map(col => {
                            const value = this.csvCellValue(row, col);
                            if (value === null || value === undefined) return '';
                            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
                        }).join(',')
                    );
                    const blob = new Blob([[header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.setAttribute('download', 'hip3_assets.csv');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                },

                downloadScoresCSV() {
                    const header = this.scoreColumns.map(col => `"${col.label}"`).join(',');
                    const rows = this.sortedScoreRows.map(row =>
                        this.scoreColumns.map(col => {
                            const value = this.csvCellValue(row, col);
                            if (value === null || value === undefined) return '';
                            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
                        }).join(',')
                    );
                    const blob = new Blob([[header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.setAttribute('download', 'hip3_scores.csv');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                },

                csvCellValue(row, col) {
                    if (!col.numeric) return row[col.field];
                    return hip3DisplayedMetricValue(row, col);
                },
            },
        });
        app.mount('#app');
    })
    .catch(error => {
        console.error('Error loading HIP-3 data:', error);
        document.getElementById('app').innerHTML = '<div class="container py-4 px-4"><div class="card"><div class="card-body"><strong>Error</strong><p>Failed to load HIP-3 data.</p></div></div></div>';
    });
