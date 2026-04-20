# dev-music-service

FastAPI music service with a browser-first playback model.

The main product surface is the web app served from `/`, backed by search and streaming endpoints. Local machine playback is still supported, but it now lives behind explicit integration endpoints so browser playback stays the default path.

- Main folder: `dev-music-service/`
- Keep this service separate from the web repos.

## Runtime contract

- `GET /` serves the browser UI.
- `GET /health` returns service health plus mode metadata.
- `GET /api/autocomplete` returns MusicBrainz-backed song suggestions indexed by artist.
- `GET /api/search` and `GET /search` resolve the first YouTube audio match for a normalized query.
- `GET /api/stream` and `GET /stream` resolve a playable audio URL and redirect the browser to it.
- `GET /api/browser/playback` returns the browser playback payload used by the web app.
- `GET /api/integrations/openclaw/play` launches local playback with `ffplay`.
- `GET /api/integrations/openclaw/stop` stops current local playback.
- `GET /api/integrations/openclaw/resume` restarts the most recent local playback.
- Legacy `GET /play`, `GET /stop`, and `GET /resume` remain as compatibility shims.

## Product direction

1. Browser playback is the primary interaction model.
2. Streaming stays server-backed so the frontend can play reliably through a plain audio element.
3. OpenClaw and other local automation paths use explicit integration endpoints instead of blending into the browser UX.

## Local requirements

- Python dependencies: `fastapi`, `yt_dlp`, `uvicorn`
- Optional local integration tool: `ffplay`

## Deployment notes

- Vercel uses the FastAPI app exposed from `app.py`.
- Browser playback is Vercel-safe because `/stream` redirects to the resolved provider URL instead of shelling out to `ffmpeg`.
- Local playback endpoints remain local-machine-only and return an error when invoked in the Vercel runtime.
