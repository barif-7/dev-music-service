#!/usr/bin/env bash
# Start the local FastAPI development server.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PYTHON_BIN="${PYTHON:-$(command -v python3.11 || command -v python3 || echo python3)}"

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment with $PYTHON_BIN..."
  "$PYTHON_BIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

pip install --upgrade pip -q
pip install -r requirements.txt -q

exec uvicorn main:app --host 127.0.0.1 --port 8000
