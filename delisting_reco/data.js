/* =========================
   Data fetching
========================= */

const DATA_URL = 'https://stalequant.com/delisting_reco/hl_delisting_data.json';

async function fetchDelistingData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
        throw new Error('Failed to fetch data: ' + response.status);
    }
    return response.json();
}

