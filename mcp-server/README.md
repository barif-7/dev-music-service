# dev-music-service MCP Server

## What this does

This MCP server exposes the local `dev-music-service` backend as safe tools for MCP-compatible AI agents. The backend remains the source of truth for search, stream resolution, metadata extraction, and lyrics.

## Existing Backend API Detected

- Backend framework: FastAPI
- Entrypoint: `main.py`
- Search endpoint: `GET /api/search` and `GET /search`
- Stream endpoint: `GET /api/stream` and `GET /stream`
- Metadata endpoint: `GET /api/metadata` and `GET /metadata`
- Lyrics endpoint: `GET /api/lyrics` and `GET /lyrics`
- Notes:
  - `GET /health` returns service health plus runtime mode metadata.
  - Search currently caps backend results at `limit <= 5`, so the MCP wrapper forwards larger requested limits as a best effort and documents the cap in its response.
  - Lyrics are backed by LRCLIB and require title plus artist metadata.
  - Metadata now reuses the existing `yt-dlp` extraction flow with `download=False`.

## Tools

### `music_health_check`

Checks whether the local backend is reachable.

### `music_search`

Searches for music and normalizes backend results into a stable MCP-facing shape.

### `music_get_stream_url`

Builds a backend playback URL for a source track without downloading audio.

### `music_get_metadata`

Fetches URL-based track metadata through the backend.

### `music_get_lyrics`

Searches for the requested track, derives title and artist metadata, and then fetches lyrics through the backend's LRCLIB integration.

## Setup

```bash
cd mcp-server
npm ci
npm run build
```

The `.mcp.json` checked into the repo expects the compiled entrypoint at
`mcp-server/dist/index.js`. Override that path with `DEV_MUSIC_MCP_SERVER_PATH`
when your MCP client launches from a different working directory.

## Run

```bash
DEV_MUSIC_BASE_URL=http://127.0.0.1:8000 npm run start
```

For a convenience wrapper from the repo root:

```bash
./scripts/start-mcp.sh
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "dev-music-service": {
      "command": "sh",
      "args": [
        "-c",
        "node \"${DEV_MUSIC_MCP_SERVER_PATH:-mcp-server/dist/index.js}\""
      ],
      "env": {
        "DEV_MUSIC_BASE_URL": "http://127.0.0.1:8000"
      }
    }
  }
}
```

## OpenClaw / Local Agent Config

```json
{
  "name": "dev-music-service",
  "command": "sh",
  "args": [
    "-c",
    "node \"${DEV_MUSIC_MCP_SERVER_PATH:-mcp-server/dist/index.js}\""
  ],
  "env": {
    "DEV_MUSIC_BASE_URL": "http://127.0.0.1:8000"
  }
}
```

## Safety

This server is read and playback oriented. It exposes:

- backend health checks
- music search
- metadata lookup
- lyrics lookup
- stream URL generation

It does not download music to disk by default, modify local libraries, expose the filesystem, or attempt to bypass provider restrictions.

## Limitations

- The FastAPI backend must be running separately.
- Search results are constrained by the current backend limit of five resolved candidates.
- Lyrics depend on LRCLIB availability and on artist metadata being available for the resolved track.
- Metadata is currently implemented for URL-based track pages resolved by `yt-dlp`.
