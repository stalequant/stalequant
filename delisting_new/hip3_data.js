/* =========================
   HIP-3 data fetching
========================= */

const HIP3_DATA_URL = 'hip3_data.json';

async function fetchHip3Data() {
    const url = new URL(HIP3_DATA_URL, window.location.href);
    url.searchParams.set('_', Date.now().toString());
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error('Failed to fetch HIP-3 data: ' + response.status);
    }
    const text = await response.text();
    return JSON.parse(text.replace(/\bNaN\b/g, 'null'));
}
