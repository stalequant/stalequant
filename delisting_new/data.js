/* =========================
   Data fetching
========================= */

const DATA_URL = 'hl_delisting_data.json';

async function fetchDelistingData() {
    const url = new URL(DATA_URL, window.location.href);
    url.searchParams.set('_', Date.now().toString());
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error('Failed to fetch data: ' + response.status);
    }
    const text = await response.text();
    return JSON.parse(text.replace(/\bNaN\b/g, 'null'));
}

