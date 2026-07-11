# Delisting Recommendation Code

Records Hyperliquid and reference-exchange market data, then builds the JSON bundles used by the `delisting_new` pages.

## Layout

- `src/` - recorder, clients, scoring, and recommendation report code.
- `scripts/` - launchers for continuous pulling plus hourly recommendation generation.
- `../delisting_new_data/data/` - saved snapshots, candles, listings, and other recorder inputs.
- `../delisting_new_data/results/` - generated recommendation JSON (`hl_delisting_data.json` and `hip3_data.json`).
- `../delisting_new/` - static-site copies of the generated JSON files.

## Setup

Python 3.10 or newer is required.

From this directory:

```powershell
pip install -r src\requirements.txt
```

API keys are read from environment variables: `CMC_API_KEY`, `COINCAP_API_KEY`,
and `COINGECKO_API_KEY`. The GitHub uploader reads its PAT from
`STALEQUANT_GITHUB_PAT`.

## Run

Start the continuous recorder:

```powershell
python -m src
```

Build the recommendation JSON from the current files in `../delisting_new_data/data/`:

```powershell
python -m src.scoring.report
```

The report command writes `../delisting_new_data/results/hl_delisting_data.json`
and mirrors it to `../delisting_new/hl_delisting_data.json`.

Build the HIP-3 JSON from the current files in `data/`:

```powershell
python -m src.scoring.hip3_report
```

The HIP-3 report command writes `../delisting_new_data/results/hip3_data.json`
and mirrors it to `../delisting_new/hip3_data.json`.

Upload both generated JSON files to `stalequant/stalequant:main/delisting_new`:

```powershell
python github_push_hl_delisting_data.py
```

Run continuous pulling, regenerate both reports every hour, and upload both generated JSON files:

```powershell
scripts\start_pulling.bat
```

```sh
sh scripts/start_pulling.sh
```
