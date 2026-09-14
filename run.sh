#!/usr/bin/env bash
# Start the local FastAPI development server.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Keep the development server on the same interpreter and locked dependencies
# as the service, including yt-dlp's matching JavaScript solver package.
exec uv run --locked uvicorn main:app --host 127.0.0.1 --port 8000
