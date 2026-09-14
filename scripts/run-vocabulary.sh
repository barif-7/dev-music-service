#!/bin/sh
set -eu
VOCABULARY_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$VOCABULARY_ROOT"
exec "$VOCABULARY_ROOT/.venv/bin/python" -m uvicorn plugins.vocabulary.app:app --host 127.0.0.1 --port 8796
