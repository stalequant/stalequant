#!/usr/bin/env sh
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$PROJECT_DIR" || exit 1
DATA_DIR="$PROJECT_DIR/../delisting_new_data/data"

if [ -n "${PYTHON:-}" ]; then
    PYTHON_BIN=$PYTHON
elif [ -x "$PROJECT_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"
else
    PYTHON_BIN=python3.14
fi

# Fail before starting a background recorder if setup is incomplete.
"$PYTHON_BIN" -c 'import sys; assert sys.version_info >= (3, 14), "Python 3.14 or newer is required"; import aiosonic, ccxt.pro, numpy, pandas, pydantic, requests' || exit 1

echo "Starting continuous delisting data recorder..."
"$PYTHON_BIN" -m src &
RECORDER_PID=$!

cleanup() {
    status=$?
    trap - INT TERM EXIT
    kill "$RECORDER_PID" 2>/dev/null || true
    wait "$RECORDER_PID" 2>/dev/null || true
    exit "$status"
}
trap cleanup INT TERM
trap cleanup EXIT

recorder_is_running() {
    kill -0 "$RECORDER_PID" 2>/dev/null
}

require_recorder() {
    if ! recorder_is_running; then
        recorder_status=0
        wait "$RECORDER_PID" 2>/dev/null || recorder_status=$?
        if [ "$recorder_status" -eq 0 ]; then
            recorder_status=1
        fi
        echo "Delisting data recorder exited unexpectedly (status $recorder_status)." >&2
        exit "$recorder_status"
    fi
}

echo "Waiting for the initial Hyperliquid snapshot..."
while [ ! -f "$DATA_DIR/hl_raw_dex_meta_ctx.jsonl" ]; do
    require_recorder
    sleep 5
done

echo "Starting hourly recommendation report loop..."
while true; do
    require_recorder
    if ! "$PYTHON_BIN" -m src.scoring.report; then
        echo "Recommendation report generation failed; retrying in one hour." >&2
    fi
    if ! "$PYTHON_BIN" -m src.scoring.hip3_report; then
        echo "HIP-3 asset report generation failed; retrying in one hour." >&2
    fi
    if ! "$PYTHON_BIN" github_push_hl_delisting_data.py; then
        echo "GitHub JSON upload failed; retrying in one hour." >&2
    fi

    elapsed=0
    while [ "$elapsed" -lt 3600 ]; do
        require_recorder
        sleep 15
        elapsed=$((elapsed + 15))
    done
done
