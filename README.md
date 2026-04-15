# dev-music-service

FastAPI music service used for TUI playback flows.

- Source of truth: `../docs/project-status.md`
- Main folder: `dev-music-service/`
- Keep this service separate from the web repos.

## Runtime contract

- `GET /` returns a basic health check.
- `GET /search?query=...` returns the top YouTube audio matches.
- `GET /stream?url=...` streams a track as MP3.
- `GET /play?query=...` launches local playback with `ffplay` and returns the PID.

## TUI flow

1. Search for a track.
2. Pick a result.
3. Stream it or play it locally.

## Local requirements

- Python service dependencies: `fastapi`, `yt_dlp`, `uvicorn`
- Playback tools: `ffmpeg`, `ffplay`
- Keep temporary media out of the repo when possible.
