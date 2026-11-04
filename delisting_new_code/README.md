# Delisting Recommendation Code

Records Hyperliquid and reference-exchange market data, then builds the JSON bundles used by the `delisting_new` pages.

## Layout

- `src/` - recorder, clients, scoring, and recommendation report code.
- `scripts/` - launchers for continuous pulling plus hourly recommendation generation.
- `../delisting_new_data/data/` - saved snapshots, candles, listings, and other recorder inputs.
- `../delisting_new_data/results/` - generated recommendation JSON (`hl_delisting_data.json` and `hip3_data.json`).
- `../delisting_new/` - static-site copies of the generated JSON files.

## Setup

The supported target is CPython 3.14 on Ubuntu 26.04 (standard GIL build).
The dependency bounds require NumPy and pandas versions with Python 3.14 support.
aiosonic 0.25.0 explicitly excludes Python 3.14; this copy uses 0.31.1.

From this directory:

```sh
sudo apt-get update
sudo apt-get install python3.14-venv ca-certificates
python3.14 -m venv .venv
.venv/bin/python -m pip install -r src/requirements.txt
.venv/bin/python -m pip check
```

Use a virtual environment; Ubuntu's system Python is externally managed.
To reproduce the exact dependency set verified for this copy:

```sh
.venv/bin/python -m pip install -r requirements-ubuntu26-py314.lock.txt
```

Run the offline compatibility checks:

```sh
.venv/bin/python -m unittest discover -s tests -v
```

API keys are read from environment variables: `CMC_API_KEY`, `COINCAP_API_KEY`,
and `COINGECKO_API_KEY`. The GitHub uploader reads its PAT from
`STALEQUANT_GITHUB_PAT`.

## Run

Start the continuous recorder:

```sh
.venv/bin/python -m src
```

Build the recommendation JSON from the current files in `../delisting_new_data/data/`:

```sh
.venv/bin/python -m src.scoring.report
```

The report command writes `../delisting_new_data/results/hl_delisting_data.json`
and mirrors it to `../delisting_new/hl_delisting_data.json`.

Build the HIP-3 JSON from the current files in `data/`:

```sh
.venv/bin/python -m src.scoring.hip3_report
```

The HIP-3 report command writes `../delisting_new_data/results/hip3_data.json`
and mirrors it to `../delisting_new/hip3_data.json`.

Upload both generated JSON files to `stalequant/stalequant:main/delisting_new`:

```sh
.venv/bin/python github_push_hl_delisting_data.py
```

Run continuous pulling, regenerate both reports every hour, and upload both generated JSON files:

```powershell
scripts\start_pulling.bat
```

```sh
sh scripts/start_pulling.sh
```

The Linux launcher selects `.venv/bin/python`, falling back to `python3.14`.
Set `PYTHON=/absolute/path/to/python` to override it. It checks the interpreter
and imports before starting the recorder. The launcher continuously collects data
and uploads generated reports when configured with a GitHub token.
The standalone download contains no historical market data; recording must populate
the sibling data directory before reports contain useful recommendations.
