/* =========================
   Vue app initialization
========================= */

// Ensure Vue is loaded
if (typeof Vue === 'undefined') {
    console.error('Vue.js failed to load');
    document.getElementById('app').innerHTML = '<div class="container py-2 px-4"><div class="card"><div class="bd"><strong>Error</strong><p>Vue.js failed to load. Please check your internet connection.</p></div></div></div>';
}

const OI_MC_WARNING_TEXT = 'High HL OI relative to market cap';
const HLP_OI_MC_WARNING_TEXT = 'High HLP OI relative to market cap';
const HLP_LEVERAGE_WARNING_TEXT = 'High HLP share of open interest';
const LOW_ORACLE_WARNING_TEXT = 'Few oracle sources';
const HIGH_SPOT_SLIPPAGE_WARNING_TEXT = 'High spot slippage';
const LOW_MARKET_CAP_WARNING_TEXT = 'Low market cap';
const RECOMMEND_LEVERAGE_REDUCTION_WARNING_TEXT = 'Recommend leverage reduction';
const RECOMMEND_DELISTING_WARNING_TEXT = 'Recommend delisting';
const WARNING_TOOLTIPS = {
    [OI_MC_WARNING_TEXT]: 'Measure: Hyperliquid open interest divided by market cap. Yellow >15%, orange >20%, red >25%.',
    [HLP_OI_MC_WARNING_TEXT]: 'Measure: HLP share of Hyperliquid open interest multiplied by Hyperliquid open interest, divided by market cap. Yellow >2.5%, orange >5%, red >10%.',
    [LOW_ORACLE_WARNING_TEXT]: 'Measure: raw Hyperliquid oracle points versus the minimum for the asset leverage tier. Minimum is 3 points at 3x, 5 points at 5x, and 6 points at 10x or higher. Yellow below minimum, orange 2+ points below, red 3+ points below.',
    [HLP_LEVERAGE_WARNING_TEXT]: 'Measure: HLP share of Hyperliquid open interest. HLP is the Hyperliquid Liquidity Provider vault. Orange thresholds are >50% at 3x, >40% at 5x, and >30% above 10x; yellow is 10% lower and red is 20% higher.',
    [HIGH_SPOT_SLIPPAGE_WARNING_TEXT]: 'Measure: max leverage squared times one-way $10K spot slippage in bp. Yellow >2,500, orange >5,000, red >10,000.',
    [LOW_MARKET_CAP_WARNING_TEXT]: 'Measure: market cap in USD millions. Yellow < $15M, orange < $10M, red < $5M.',
    [RECOMMEND_LEVERAGE_REDUCTION_WARNING_TEXT]: 'Recommendation audit flag: this asset is in the score/leverage downgrade region and is a candidate for lower maximum leverage.',
    [RECOMMEND_DELISTING_WARNING_TEXT]: 'Recommendation audit flag: this asset is in the score/leverage delist region and is a candidate for removal from Hypercore perps.',
};

function formatWarningCount(count, total) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return `${count} of ${total} pairs flagged (${pct.toFixed(1)}%)`;
}

function warningGroupRank(label) {
    if (label === RECOMMEND_DELISTING_WARNING_TEXT) return 0;
    if (label === RECOMMEND_LEVERAGE_REDUCTION_WARNING_TEXT) return 1;
    return 10;
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

function recommendationDisplayLabel(value) {
    const labels = {
        'Delist': 'Delist',
        'Dec. Lev.': 'Reduce',
        'Inc. Lev.': 'Increase',
        'List': 'List',
    };
    return labels[value] || '';
}

function scoreRows(rows) {
    const scoredRows = rows
        .filter(row => !String(row.Symbol || '').includes('-'))
        .map(row => {
        const scored = { ...row };
        MID_SLIPPAGE_FIELDS.forEach(field => {
            if (scored[field] === null || scored[field] === undefined || scored[field] === '') {
                return;
            }
            const value = Number(scored[field]);
            if (Number.isFinite(value)) {
                scored[field] = value / 2;
            }
        });
        const partialScores = {};

        Object.entries(FIELD_SCORE_SPECS).forEach(([field, spec]) => {
            partialScores[field] = metricPoints(field, scored[field], scored, spec);
        });

        scored.__points = partialScores;
        scored.Score = Object.values(partialScores).reduce((sum, points) => sum + points, 0);
        return scored;
    });

    const thresholds = recommendationThresholds(scoredRows);
    scoredRows.forEach(row => {
        row.Recommendation = generateRecommendation(row, thresholds);
        row.Warnings = generateWarnings(row);
        row.Warning = row.Warnings.map(warning => warning.label).join('; ');
    });

    return scoredRows.sort((a, b) => Number(b.Score) - Number(a.Score));
}

function metricPoints(field, value, row, spec = FIELD_SCORE_SPECS[field]) {
    if (HL_ONLY_FIELDS.has(field) && Number(row?.['Max Lev. on HL']) < 1) {
        return 2;
    }
    if (!spec || value === null || value === undefined || value === '' || Number.isNaN(value)) {
        return spec ? 0 : null;
    }

    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
        return 0;
    }

    const thresholds = scoreThresholds(spec);
    let points = 0;
    if (spec.kind === 'exp' || spec.kind === 'linear') {
        thresholds.forEach((threshold, idx) => {
            if (numberValue >= threshold) points = idx;
        });
    } else {
        thresholds.slice().reverse().forEach((threshold, idx) => {
            if (numberValue <= threshold) points = idx;
        });
    }
    return Math.max(0, Math.min(10, points));
}

function scoreThresholds(spec) {
    return Array.from({ length: spec.steps + 1 }, (_, idx) => {
        if (spec.kind === 'exp' || spec.kind === 'reverse_exp') {
            return spec.start * (spec.end / spec.start) ** (idx / spec.steps);
        }
        return spec.start + (spec.end - spec.start) * (idx / spec.steps);
    }).sort((a, b) => a - b);
}

function leverageScoreBucket(maxLev) {
    const lev = Number(maxLev);
    if (lev <= 0) return 0;
    if (lev <= 3) return 3;
    if (lev <= 5) return 5;
    if (lev <= 10) return 10;
    return 20;
}

function recommendationThresholds(rows) {
    const visibleNotListedFloor = 25;
    const delistScoreThreshold = 30;
    const buckets = [0, 3, 5, 10, 20];
    const stats = buckets.reduce((acc, bucket) => {
        const scores = rows
            .filter(row => leverageScoreBucket(row['Max Lev. on HL']) === bucket)
            .map(row => Number(row.Score))
            .filter(score => Number.isFinite(score))
            .sort((a, b) => a - b);

        acc[bucket] = {
            median: recommendationPercentile(scores, 0.5),
            p75: recommendationPercentile(scores, 0.75),
            visibleP75: bucket === 0
                ? recommendationPercentile(scores.filter(score => score > visibleNotListedFloor), 0.75)
                : null,
        };
        return acc;
    }, {});

    return buckets.reduce((acc, bucket, idx) => {
        const nextBucket = buckets[idx + 1];
        const previousBucket = buckets[idx - 1];
        const previousStats = stats[previousBucket];
        acc.upgrade[bucket] = stats[nextBucket]?.median ?? null;
        acc.downgrade[bucket] = bucket === 3 ? delistScoreThreshold : previousStats?.p75 ?? null;
        return acc;
    }, { upgrade: {}, downgrade: {} });
}

function recommendationPercentile(sortedValues, q) {
    if (!sortedValues.length) return null;
    const pos = (sortedValues.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sortedValues[base + 1];
    return next === undefined
        ? sortedValues[base]
        : sortedValues[base] + rest * (next - sortedValues[base]);
}

function generateRecommendation(row, thresholds) {
    const bucket = leverageScoreBucket(row['Max Lev. on HL']);
    const score = Number(row.Score);
    const maxLev = Number(row['Max Lev. on HL']);
    const downgradeThreshold = thresholds?.downgrade?.[bucket];
    const upgradeThreshold = thresholds?.upgrade?.[bucket];
    const highLev = Number.isFinite(downgradeThreshold) && score <= downgradeThreshold;
    const lowLev = Number.isFinite(upgradeThreshold) && score >= upgradeThreshold;

    if (maxLev > 3 && highLev) return 'Dec. Lev.';
    if (maxLev > 0 && bucket === 3 && highLev) return 'Delist';
    if (maxLev === 0 && lowLev) return 'List';
    if (maxLev > 0 && lowLev) return 'Inc. Lev.';
    return '';
}

function generateWarnings(row) {
    const warnings = [];
    if (row.Recommendation === 'Dec. Lev.') {
        warnings.push({
            label: RECOMMEND_LEVERAGE_REDUCTION_WARNING_TEXT,
            value: recommendationDisplayLabel(row.Recommendation),
            severity: 'orange',
        });
    }
    if (row.Recommendation === 'Delist') {
        warnings.push({
            label: RECOMMEND_DELISTING_WARNING_TEXT,
            value: recommendationDisplayLabel(row.Recommendation),
            severity: 'danger',
        });
    }

    const mc = Number(row['MC $m']);
    const hlOi = Number(row['OI on HL $m']);
    const maxLev = Number(row['Max Lev. on HL']);
    if (Number.isFinite(maxLev) && maxLev > 0 && Number.isFinite(mc) && mc < 15) {
        warnings.push({
            label: LOW_MARKET_CAP_WARNING_TEXT,
            value: formatWarningDollarsMillions(mc),
            severity: lowMarketCapWarningSeverity(mc),
        });
    }

    const oiMcRatio = Number.isFinite(mc) && mc > 0 && Number.isFinite(hlOi) ? hlOi / mc : null;
    if (Number.isFinite(oiMcRatio) && oiMcRatio >= 0.15) {
        warnings.push({
            label: OI_MC_WARNING_TEXT,
            value: formatWarningPercent(oiMcRatio),
            severity: oiMcWarningSeverity(oiMcRatio),
        });
    }

    const hlpOiMcRatio = hlpOiMarketCapRatio(row);
    if (Number.isFinite(hlpOiMcRatio) && hlpOiMcRatio > 0.025) {
        warnings.push({
            label: HLP_OI_MC_WARNING_TEXT,
            value: formatWarningPercent(hlpOiMcRatio),
            severity: hlpOiMcWarningSeverity(hlpOiMcRatio),
        });
    }

    const hlpSeverity = hlpLeverageWarningSeverity(row);
    if (hlpSeverity) {
        warnings.push({
            label: HLP_LEVERAGE_WARNING_TEXT,
            value: formatWarningPercent(Number(row['HLP OI Share %'])),
            severity: hlpSeverity,
        });
    }

    const oracleRisk = lowOracleWarningScore(row);
    if (oracleRisk > 0) {
        warnings.push({
            label: LOW_ORACLE_WARNING_TEXT,
            value: formatOracleWarningValue(row['Oracle Score']),
            severity: warningScoreSeverity(oracleRisk),
        });
    }

    const spotSlippageRisk = spotSlippageWarningScore(row);
    if (spotSlippageRisk > 2500) {
        warnings.push({
            label: HIGH_SPOT_SLIPPAGE_WARNING_TEXT,
            value: formatSpotSlippageWarningValue(row['Spot Liquidity bp ($10k)']),
            severity: spotSlippageWarningSeverity(spotSlippageRisk),
        });
    }

    return warnings;
}

function formatWarningPercent(value) {
    if (!Number.isFinite(value)) return '';
    return `${(value * 100).toFixed(1)}%`;
}

function formatWarningDollarsMillions(value) {
    if (!Number.isFinite(value)) return '';
    return `$${value.toFixed(value >= 10 ? 1 : 2)}M`;
}

function formatWarningLeverage(value) {
    const lev = Number(value);
    if (!Number.isFinite(lev) || lev <= 0) return 'N/A';
    return `${lev}x`;
}

function oiMcWarningSeverity(value) {
    if (value >= 0.25) return 'danger';
    if (value >= 0.2) return 'orange';
    return 'yellow';
}

function hlpOiMcWarningSeverity(value) {
    if (value > 0.1) return 'danger';
    if (value > 0.05) return 'orange';
    return 'yellow';
}

function lowMarketCapWarningSeverity(value) {
    if (value < 5) return 'danger';
    if (value < 10) return 'orange';
    return 'yellow';
}

function warningScoreSeverity(score) {
    if (score >= 3) return 'danger';
    if (score >= 2) return 'orange';
    return 'yellow';
}

function spotSlippageWarningSeverity(score) {
    if (score > 10000) return 'danger';
    if (score > 5000) return 'orange';
    return 'yellow';
}

function formatOracleWarningValue(value) {
    const oracle = Number(value);
    if (!Number.isFinite(oracle)) return 'N/A';
    return `${oracle}`;
}

function lowOracleWarningScore(row) {
    const maxLev = Number(row['Max Lev. on HL']);
    const oracle = Number(row['Oracle Score']);
    if (!Number.isFinite(maxLev) || !Number.isFinite(oracle)) return 0;
    if (maxLev >= 10) return 6 - oracle;
    if (maxLev === 5) return 5 - oracle;
    if (maxLev === 3) return 3 - oracle;
    return 0;
}

function spotSlippageWarningScore(row) {
    const maxLev = Number(row['Max Lev. on HL']);
    const spotSlippage = Number(row['Spot Liquidity bp ($10k)']);
    if (!Number.isFinite(maxLev) || maxLev <= 0 || !Number.isFinite(spotSlippage)) return 0;
    return maxLev ** 2 * spotSlippage;
}

function hlpOiMarketCapRatio(row) {
    const mc = Number(row['MC $m']);
    const hlOi = Number(row['OI on HL $m']);
    const hlpShare = Number(row['HLP OI Share %']);
    if (!Number.isFinite(mc) || mc <= 0 || !Number.isFinite(hlOi) || !Number.isFinite(hlpShare)) {
        return null;
    }
    return hlpShare * hlOi / mc;
}

function formatSpotSlippageWarningValue(value) {
    const slippage = Number(value);
    if (!Number.isFinite(slippage)) return 'N/A';
    return `${slippage}bp`;
}

function hlpLeverageWarningSeverity(row) {
    const maxLev = Number(row['Max Lev. on HL']);
    const hlpShare = Number(row['HLP OI Share %']);
    if (!Number.isFinite(maxLev) || !Number.isFinite(hlpShare)) return '';

    let orangeThreshold = null;
    if (maxLev === 3) orangeThreshold = 0.5;
    else if (maxLev === 5) orangeThreshold = 0.4;
    else if (maxLev > 10) orangeThreshold = 0.3;
    if (!orangeThreshold) return '';

    if (hlpShare > orangeThreshold * 1.2) return 'danger';
    if (hlpShare > orangeThreshold) return 'orange';
    if (hlpShare > orangeThreshold * 0.9) return 'yellow';
    return '';
}

fetchDelistingData()
    .then(delisting_data => {
        const hl_data_rows = scoreRows(delisting_data.data);
        const meta = delisting_data.meta;

        const { createApp } = Vue;

        const app = createApp({
            data: () => ({
                meta,
                hl_data_rows,
                hl_data_columns: HL_DATA_COLUMNS,
                selectedFilter: 'downgrade',
                currentPage: 1,
                rowsPerPage: 25,
                filterOptions: FILTER_OPTIONS,
                requiredColumns: REQUIRED_COLUMNS,
                searchQuery: '',
                sortColumn: 'Score',
                sortDirection: 'desc'
            }),

            computed: {
                visibleColumns() {
                    return this.hl_data_columns
                },

                fieldStats() {
                    return NUMERIC_FIELDS.reduce((stats, field) => {
                        const rawValues = this.hl_data_rows
                            .map(row => Number(row[field]))
                            .filter(value => Number.isFinite(value))

                        const values = this.shouldUseLogScale(field)
                            ? rawValues.filter(value => value > 0).map(value => Math.log10(value))
                            : rawValues

                        const sorted = [...values].sort((a, b) => a - b)
                        stats[field] = {
                            min: this.quantile(sorted, 0.05),
                            max: this.quantile(sorted, 0.95)
                        }
                        return stats
                    }, {})
                },

                warningRows() {
                    return this.filterRows('warnings')
                },

                hypercoreRows() {
                    return this.hl_data_rows.filter(row => Number(row['Max Lev. on HL']) > 0)
                },

                warningCountLabel() {
                    return formatWarningCount(this.warningRows.length, this.hypercoreRows.length)
                },

                warningGroups() {
                    const groups = new Map()
                    this.warningRows.forEach(row => {
                        const warnings = Array.isArray(row.Warnings) ? row.Warnings : []
                        warnings.forEach(warning => {
                            if (!groups.has(warning.label)) {
                                groups.set(warning.label, [])
                            }
                            groups.get(warning.label).push({
                                symbol: row.Symbol,
                                leverage: formatWarningLeverage(row['Max Lev. on HL']),
                                value: warning.value,
                                severity: warning.severity || 'yellow'
                            })
                        })
                    })
                    const total = this.hypercoreRows.length
                    return Array.from(groups, ([label, rows]) => ({
                        label,
                        rows: rows.slice(0, 80),
                        overflowCount: Math.max(0, rows.length - 80),
                        countLabel: formatWarningCount(rows.length, total),
                        tooltip: WARNING_TOOLTIPS[label] || label,
                    })).sort((a, b) => {
                        const rankDiff = warningGroupRank(a.label) - warningGroupRank(b.label)
                        if (rankDiff !== 0) return rankDiff
                        return a.label.localeCompare(b.label)
                    })
                },

                filteredRows() {
                    const query = this.searchQuery.toLowerCase()
                    return this.filterRows(this.selectedFilter)
                        .filter(row => {
                            if (!query) return true
                            return [row.Symbol, row.Recommendation, row.Warning]
                                .filter(Boolean)
                                .some(value => String(value).toLowerCase().includes(query))
                        })
                },

                sortedRows() {
                    const rows = [...this.filteredRows]
                    if (!this.sortColumn) return rows

                    return rows.sort((a, b) => {
                        const aValue = a[this.sortColumn]
                        const bValue = b[this.sortColumn]
                        const direction = this.sortDirection === 'asc' ? 1 : -1

                        if (NUMERIC_FIELDS.includes(this.sortColumn)) {
                            return this.compareNumeric(aValue, bValue) * direction
                        }

                        return String(aValue ?? '').localeCompare(String(bValue ?? '')) * direction
                    })
                },

                totalPages() {
                    return Math.max(1, Math.ceil(this.sortedRows.length / this.rowsPerPage))
                },

                paginationLabel() {
                    if (this.sortedRows.length === 0) {
                        return 'Showing 0 rows'
                    }
                    const start = (this.currentPage - 1) * this.rowsPerPage + 1
                    const end = Math.min(this.currentPage * this.rowsPerPage, this.sortedRows.length)
                    return `Showing ${start}-${end} of ${this.sortedRows.length} rows`
                },

                paginatedRows() {
                    const start = (this.currentPage - 1) * this.rowsPerPage
                    return this.sortedRows.slice(start, start + this.rowsPerPage)
                },

                freshnessRows() {
                    return Array.isArray(this.meta?.freshness) ? this.meta.freshness : []
                },

                timeSeriesRows() {
                    return Array.isArray(this.meta?.time_series) ? this.meta.time_series : []
                },

                generatedAtLabel() {
                    return this.meta?.generated_at_utc
                        ? `generated ${this.formatMetaTime(this.meta.generated_at_utc)}`
                        : 'generated time unavailable'
                },

                generatedHeaderLabel() {
                    return formatHeaderTime(this.meta?.generated_at_utc)
                },

                executiveSummary() {
                    const generated = this.meta?.generated_at_utc
                        ? this.formatMetaTime(this.meta.generated_at_utc)
                        : 'an unavailable time'
                    const hypercoreAssetCount = this.hypercoreRows.length
                    return `This report scores ${hypercoreAssetCount} Hypercore assets for main Hypercore listing and leverage recommendations, using market size, spot/futures liquidity, oracle robustness, Hyperliquid usage, open interest, HLP exposure, and slippage. HIP-3 assets are monitored separately on the HIP-3 page. Warning flags are shown separately and do not directly change recommendations. All data and warnings are indicative only and should not be interpreted as firm guidance. Data was generated ${generated}.`
                }
            },

            watch: {
                selectedFilter() {
                    this.currentPage = 1
                },
                searchQuery() {
                    this.currentPage = 1
                },
                totalPages() {
                    this.currentPage = Math.min(this.currentPage, this.totalPages)
                }
            },

            methods: {
                filterRows(filter) {
                    switch (filter) {
                        case 'upgrade':
                            return this.hl_data_rows.filter(row => row.Recommendation === "List" || row.Recommendation === "Inc. Lev.")
                        case 'downgrade':
                            return this.hl_data_rows.filter(row => row.Recommendation === "Delist" || row.Recommendation === "Dec. Lev.")
                        case 'warnings':
                            return this.hl_data_rows.filter(row => row.Warning)
                        case 'unlisted':
                            return this.hl_data_rows.filter(row => Number(row['Max Lev. on HL']) === 0)
                        case 'listed':
                            return this.hl_data_rows.filter(row => Number(row['Max Lev. on HL']) > 0)
                        default:
                            return this.hl_data_rows
                    }
                },

                filterCount(filter) {
                    return this.filterRows(filter).length
                },

                sortBy(col) {
                    if (!col.sortable) return
                    if (this.sortColumn === col.name) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
                    } else {
                        this.sortColumn = col.name
                        this.sortDirection = NUMERIC_FIELDS.includes(col.name) ? 'asc' : 'asc'
                    }
                    this.currentPage = 1
                },

                sortIndicator(col) {
                    if (this.sortColumn !== col.name) return ''
                    return this.sortDirection
                },

                downloadCSV() {
                    const rows = this.sortedRows
                    const columns = this.hl_data_columns

                    const header = columns.map(col => `"${this.csvHeaderLabel(col)}"`).join(',')
                    const csvRows = rows.map(row =>
                        columns.map(col => {
                            const val = row[col.field]
                            if (val === null || val === undefined || val === '' || Number.isNaN(val)) return ''
                            return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
                        }).join(',')
                    )

                    const csvContent = [header, ...csvRows].join('\r\n')
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                    const link = document.createElement('a')
                    link.href = URL.createObjectURL(blob)
                    link.setAttribute('download', 'hyperliquid_recos_all.csv')
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                },

                csvHeaderLabel(col) {
                    if (MID_SLIPPAGE_FIELDS.has(col.field)) {
                        return `${col.label} (one-way half-spread)`
                    }
                    return col.label
                },

                getCellStyle({ col, value, row }) {
                    if (!NUMERIC_FIELDS.includes(col.name)) return {}
                    return this.getStyle(col.name, value, row)
                },

                formatCell(value, col, row) {
                    if (this.isUnavailableHlField(col?.name, row)) {
                        return 'NA'
                    }
                    if (value === null || value === undefined || value === '' || Number.isNaN(value)) {
                        return '-'
                    }
                    if (col?.name === 'Max Lev. on HL' && Number(value) === 0) {
                        return 'N/A'
                    }
                    if (col?.name === 'HLP OI Share %') {
                        const pct = Number(value) * 100
                        return Number.isFinite(pct) ? `${this.formatNumber(pct)}%` : '-'
                    }
                    if (NUMERIC_FIELDS.includes(col?.name)) {
                        const numberValue = Number(value)
                        return Number.isFinite(numberValue) ? this.formatNumber(numberValue) : '-'
                    }
                    return value
                },

                formatCellValue(value, col) {
                    if (value === null || value === undefined || value === '' || Number.isNaN(value)) {
                        return '-'
                    }
                    if (col?.name === 'Max Lev. on HL' && Number(value) === 0) {
                        return 'N/A'
                    }
                    if (col?.name === 'HLP OI Share %') {
                        const pct = Number(value) * 100
                        return Number.isFinite(pct) ? `${this.formatNumber(pct)}%` : '-'
                    }
                    if (NUMERIC_FIELDS.includes(col?.name)) {
                        const numberValue = Number(value)
                        return Number.isFinite(numberValue) ? this.formatNumber(numberValue) : '-'
                    }
                    return value
                },

                formatRecommendation(value) {
                    return recommendationDisplayLabel(value) || '-'
                },

                formatNumber(value) {
                    let maximumFractionDigits = 3
                    if (Math.abs(value) >= 100) maximumFractionDigits = 0
                    else if (Math.abs(value) >= 10) maximumFractionDigits = 1
                    else if (Math.abs(value) >= 1) maximumFractionDigits = 2

                    return new Intl.NumberFormat('en-US', {
                        maximumFractionDigits,
                    }).format(value)
                },

                formatMetaNumber(value) {
                    const numberValue = Number(value)
                    if (!Number.isFinite(numberValue)) return '-'
                    return new Intl.NumberFormat('en-US').format(numberValue)
                },

                formatMetaTime(value) {
                    if (!value) return '-'
                    const date = new Date(value)
                    if (Number.isNaN(date.getTime())) return '-'
                    return date.toLocaleString(undefined, {
                        timeZone: 'UTC',
                        timeZoneName: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                },

                formatAgeHours(value) {
                    const hours = Number(value)
                    if (!Number.isFinite(hours)) return '-'
                    if (hours < 1) return `${Math.round(hours * 60)}m`
                    if (hours < 48) return `${hours.toFixed(1)}h`
                    return `${(hours / 24).toFixed(1)}d`
                },

                cellGrade(value, col, row) {
                    if (this.isUnavailableHlField(col?.name, row)) {
                        return 'NA'
                    }
                    if (col?.name === 'Score') {
                        return this.scoreGrade(value)
                    }
                    const points = row?.__points?.[col?.name]
                    return Number.isInteger(points) ? SCORE_GRADES[points] : ''
                },

                scoreGrade(value) {
                    const score = Number(value)
                    if (!Number.isFinite(score)) return ''
                    if (score < 20) return 'F'
                    if (score >= 85) return 'A+'

                    const grades = SCORE_GRADES.slice(1, -1)
                    const idx = Math.min(
                        grades.length - 1,
                        Math.floor(((score - 20) / 65) * grades.length)
                    )
                    return grades[idx]
                },

                compareNumeric(aValue, bValue) {
                    const aNumber = Number(aValue)
                    const bNumber = Number(bValue)
                    const aMissing = !Number.isFinite(aNumber)
                    const bMissing = !Number.isFinite(bNumber)

                    if (aMissing && bMissing) return 0
                    if (aMissing) return 1
                    if (bMissing) return -1
                    return aNumber - bNumber
                },

                getStyle(field, value, row) {
                    if (this.isUnavailableHlField(field, row)) {
                        return { backgroundColor: 'rgba(255, 255, 255, 0.06)' }
                    }
                    const points = row?.__points?.[field]
                    if (Number.isInteger(points)) {
                        return this.heatColor(points / 10)
                    }
                    if (field === 'Score') {
                        const score = Number(value)
                        if (Number.isFinite(score)) {
                            return this.heatColor(Math.max(0, Math.min(1, score / 100)))
                        }
                    }

                    const rawValue = Number(value)
                    const numberValue = this.shouldUseLogScale(field) && rawValue > 0
                        ? Math.log10(rawValue)
                        : rawValue
                    const stats = this.fieldStats[field]
                    if (!Number.isFinite(numberValue) || !stats || stats.max === stats.min) {
                        return {}
                    }

                    let normalized = (numberValue - stats.min) / (stats.max - stats.min)
                    normalized = Math.max(0, Math.min(1, normalized))
                    if (LOWER_IS_BETTER_FIELDS.includes(field)) {
                        normalized = 1 - normalized
                    }

                    return this.heatColor(normalized)
                },

                isUnavailableHlField(field, row) {
                    return HL_ONLY_FIELDS.has(field) && Number(row?.['Max Lev. on HL']) < 1
                },

                heatColor(normalized) {
                    const hue = 4 + normalized * 142
                    const alpha = 0.22 + Math.abs(normalized - 0.5) * 0.22
                    return {
                        backgroundColor: `hsla(${hue}, 70%, 36%, ${alpha})`
                    }
                },

                quantile(sortedValues, q) {
                    if (!sortedValues.length) return 0
                    const pos = (sortedValues.length - 1) * q
                    const base = Math.floor(pos)
                    const rest = pos - base
                    const next = sortedValues[base + 1]
                    return next === undefined
                        ? sortedValues[base]
                        : sortedValues[base] + rest * (next - sortedValues[base])
                },

                shouldUseLogScale(field) {
                    return !['Score', 'Max Lev. on HL', 'Oracle Score'].includes(field)
                },

                getCellClass(col) {
                    return {
                        numeric: NUMERIC_FIELDS.includes(col.name),
                        stickySymbol: col.name === 'Symbol',
                        stickyRecommendation: col.name === 'Recommendation'
                    }
                },

                getHeaderClass(col) {
                    return {
                        numeric: NUMERIC_FIELDS.includes(col.name),
                        stickySymbol: col.name === 'Symbol',
                        stickyRecommendation: col.name === 'Recommendation',
                        sortable: col.sortable
                    }
                },

                recommendationClass(value) {
                    const classes = {
                        'Delist': 'danger',
                        'Dec. Lev.': 'warn',
                        'Inc. Lev.': 'good',
                        'List': 'good'
                    }
                    return classes[value] || 'neutral'
                },
            },

            mounted() {
                // Plotly chart with theme colors
                this.$nextTick(() => {
                    if (document.getElementById('plotDiv')) {
                        plotChartFromRows(this.hl_data_rows);
                    }
                });
            }
        })
        app.mount('#app')
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });

