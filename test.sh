#!/usr/bin/env bash
# Run tests for dev-music-service

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Installing dependencies..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e ".[dev]"

echo ""
echo "Running tests..."
python -m pytest tests/ -v --tb=short --cov=. --cov-report=term-missing "${@}"
