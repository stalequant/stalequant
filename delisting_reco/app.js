/* =========================
   Vue app initialization
========================= */

// Ensure Vue is loaded
if (typeof Vue === 'undefined') {
    console.error('Vue.js failed to load');
    document.getElementById('app').innerHTML = '<div class="container py-2 px-4"><div class="card"><div class="bd"><strong>Error</strong><p>Vue.js failed to load. Please check your internet connection.</p></div></div></div>';
}

fetchDelistingData()
    .then(delisting_data => {
        const hl_data_rows = delisting_data.data;
        const fig = delisting_data.fig;
        const meta = delisting_data.meta;

        const { createApp } = Vue;

        const app = createApp({
            data: () => ({
                meta,
                hl_data_rows,
                hl_data_columns: HL_DATA_COLUMNS,
                selectedFilter: 'downgrade',
                selectedColumns: ['Symbol', 'Max Lev. on HL', 'Recommendation', 'Score',
                    'MC $m', 'Spot Volume $m', 'Fut Volume $m',],
                showMoreMenu: false,
                currentPage: 1,
                rowsPerPage: 25,
                filterOptions: FILTER_OPTIONS
            }),

            computed: {
                visibleColumns() {
                    return this.hl_data_columns.filter(col => this.selectedColumns.includes(col.name))
                },
                hiddenColumns() {
                    return this.hl_data_columns.filter(col => !this.selectedColumns.includes(col.name))
                },

                filteredRows() {
                    const r = this.hl_data_rows
                    switch (this.selectedFilter) {
                        case 'upgrade': return r.filter(r => r.Recommendation === "List" || r.Recommendation === "Inc. Lev.")
                        case 'downgrade': return r.filter(r => r.Recommendation === "Delist" || r.Recommendation === "Dec. Lev.")
                        case 'unlisted': return r.filter(r => r['Max Lev. on HL'] === 0)
                        case 'listed': return r.filter(r => r['Max Lev. on HL'] > 0)
                        default: return r
                    }
                },

                paginatedRows() {
                    const start = (this.currentPage - 1) * this.rowsPerPage
                    return this.filteredRows.slice(start, start + this.rowsPerPage)
                }
            },

            watch: {
                selectedFilter() {
                    this.currentPage = 1
                }
            },

            methods: {
                toggleColumn(colName) {
                    const idx = this.selectedColumns.indexOf(colName)
                    if (idx === -1) {
                        this.selectedColumns.push(colName)
                    } else {
                        this.selectedColumns.splice(idx, 1)
                    }
                },

                toggleMoreMenu() {
                    this.showMoreMenu = !this.showMoreMenu
                },

                downloadCSV() {
                    const rows = this.hl_data_rows
                    const columns = this.hl_data_columns

                    const header = columns.map(col => `"${col.label}"`).join(',')
                    const csvRows = rows.map(row =>
                        columns.map(col => {
                            const val = row[col.field]
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

                getCellStyle({ col, value }) {
                    return NUMERIC_FIELDS.includes(col.name) ? this.getStyle(col.name, value) : {}
                },

                getStyle(field, value) {
                    return {
                        backgroundColor: `hsl(${(Math.log(value + .0001) * 50) % 255}, 100%, 10%)`
                    }
                },
            },

            mounted() {
                // Close more menu when clicking outside
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.more-btn')) {
                        this.showMoreMenu = false
                    }
                })

                // Plotly chart with theme colors
                plotChart(fig);
            }
        })
        app.mount('#app')
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });

