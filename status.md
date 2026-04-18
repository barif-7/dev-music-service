# Status

- Purpose: browser-first music search and playback service with optional local playback integration.
- Status: active runtime service.
- Priority: high.
- Main folder: `dev-music-service/`.
- Runtime contract: `GET /` browser app, `GET /health`, `GET /api/search`, `GET /api/stream`, `GET /api/browser/playback`, `GET /api/integrations/openclaw/play`, `GET /api/integrations/openclaw/stop`, `GET /api/integrations/openclaw/resume`.
- Compatibility contract: `GET /search`, `GET /stream`, `GET /play`, `GET /stop`, `GET /resume`.
- Playback behavior: browser playback is primary; local `ffplay` control is kept as an explicit integration layer.
- Next actions:
  - verify browser streaming against a real YouTube result,
  - verify local integration endpoints on a machine with `ffplay`,
  - keep compatibility endpoints until external scripts are audited.
