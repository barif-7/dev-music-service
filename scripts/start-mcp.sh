#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${DEV_MUSIC_BASE_URL:-http://127.0.0.1:8000}"

echo "Using dev-music-service backend: $BASE_URL"

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    echo "Warning: Backend health check failed. Make sure dev-music-service is running."
  fi
fi

cd "$(dirname "$0")/../mcp-server"
npm run start
