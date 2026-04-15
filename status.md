# Status

- Purpose: local music search and playback service.
- Status: active runtime service.
- Priority: high.
- Main folder: `dev-music-service/`.
- Runtime contract: `GET /` health, `GET /search`, `GET /stream`, `GET /play`, `GET /stop`, `GET /resume`.
- Playback behavior: `play` shells out to `ffplay`; `stream` pipes MP3 via `ffmpeg`; `stop` and `resume` manage the current local player session.
- Next actions:
  - keep the API contract stable,
  - note any playback or stop/resume changes,
  - avoid path moves until scripts are audited.
