# Developer API & Hosting Guide

How to configure, run, expose, and integrate with the dev-music-service backend.

## Running locally

```bash
./run.sh                      # creates .venv, installs deps, runs uvicorn on 127.0.0.1:8000
# or
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Health check: `GET /health` returns the active mode, stream delivery, configured
origins, and `spotify_import: configured | missing-client-id`.

## Configuration

Settings load from environment variables or a `.env` file in the project root
(`config.py`, pydantic-settings). Copy `.env.example` to `.env` and edit — the
example is safe to copy verbatim. `.env` is gitignored; never commit secrets.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEV_MUSIC_BASE_URL` | `http://127.0.0.1:8000` | Base URL for MCP/cross-origin integrations |
| `SPOTIFY_CLIENT_ID` | – | Spotify app client ID (required for import + autocomplete) |
| `SPOTIFY_CLIENT_SECRET` | – | Spotify app secret (required for client-credentials autocomplete) |
| `SPOTIFY_REDIRECT_URI` | – | OAuth callback; must match the Spotify dashboard exactly |
| `CAPTION_LOCALIZER_URL` | `http://127.0.0.1:8001` | Separate CaptionLocalizer service used for lyric translation and transcription |
| `PHASE_FIELD_API_BASE_URL` | `http://localhost:8787` | Upstream for the `/api/shaders` proxy |
| `STREAM_ALLOWED_HOSTS` | media host allowlist | Comma-separated suffix allowlist for `/stream` targets (whitespace trimmed) |
| `STREAM_DELIVERY_MODE` | `proxy` | `proxy` streams bytes; `redirect` returns a 302 |
| `DMS_CONTROL_AUTH_TOKEN` | – | Bearer/`X-Dev-Music-Token` required for process-affecting routes |
| `FOCUS_PROFILE_STORAGE_BACKEND` | `local-json` | `local-json` (implemented) or `kv` (stub) |

## API reference (selected)

All routes are also available without the `/api` prefix where noted in `main.py`.

### Shaders — Phase · Field proxy

The frontend talks to these same-origin; they front the standalone
[phase-field-api](https://github.com/barif-7/phase-field-api) Cloudflare Worker
so the browser never sees the upstream URL (no CORS / mixed-content).

- `GET /api/shaders` — shader catalogue (metadata + WGSL). Optional query
  filters: `preset` (`Flow|Rest|Spark|Drive`), `bpm_min`, `bpm_max`.
- `GET /api/shaders/{id}/source?format=glsl` — single shader source.
  `format` ∈ `wgsl | glsl | msl | spirv | metal` (default `glsl`). The actually
  served format is echoed in the `X-Shader-Format` response header.

Behavior: validated shader id (`^[a-z0-9][a-z0-9-]{0,63}$`) and format; `400`
on bad input, upstream `404` passed through, `503` when the worker is
unreachable. Responses cache for 5 minutes. Start the worker with
`npm run dev` in the phase-field-api repo (serves `:8787`).

### Search / playback / lyrics

- `GET /api/autocomplete?q=` — fast Spotify-backed suggestions.
- `GET /api/search?q=` — MusicBrainz-first, then YouTube.
- `GET /api/stream?url=` — proxied (or redirected) media stream; target host
  must match `STREAM_ALLOWED_HOSTS`.
- `GET /api/lyrics?title=&artist=[&album=&duration=&locale=]` — LRCLIB synced lyrics,
  optionally localized through CaptionLocalizer.
- `POST /api/lyrics/localize-window` — localize a small lyric window just in time.
- `GET /api/metadata?url=` — track metadata for a webpage URL.

Lyric localization requires CaptionLocalizer to run separately from this app.
For local development, keep dev-music-service on `127.0.0.1:8000`, start
CaptionLocalizer on `127.0.0.1:8001`, and set
`CAPTION_LOCALIZER_URL=http://127.0.0.1:8001`. dev-music-service calls
CaptionLocalizer's lyrics-native `/tools/localize_lyrics/run` tool. If both
apps point at `:8000`, dev-music-service would call its own tool path and get
`404 Not Found`, so the bridge guards against that self-reference and falls
back to the default local CaptionLocalizer port.

### Spotify import (see below)

- `GET /api/import/spotify/start` → 307 to Spotify authorize (PKCE).
- `GET /api/import/spotify/callback` — OAuth redirect target.
- `GET /api/import/spotify/status`, `.../playlists`, `.../liked-tracks`,
  `POST .../playback`, `POST .../disconnect`.

### Focus & control

- `GET|POST /api/focus/profile`, `POST /api/focus/profile/reset`,
  `GET /api/focus/top-tracks`, `GET /api/focus/track/{id}`.
- `GET /api/mcp/status`, `POST /api/mcp/start|stop` — **process-affecting**,
  gated by `DMS_CONTROL_AUTH_TOKEN`.
- `GET /api/integrations/openclaw/play|stop|resume` — local ffplay, also gated.

## Spotify setup

The app uses two Spotify flows with the **same** app credentials:

- **Account import / login** — Authorization Code with **PKCE** (`S256`). The
  client secret is *not* required for this leg.
- **Always-on autocomplete** — **Client Credentials**, which *does* require the
  secret.

Set both `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for full functionality.

Steps:

1. Create an app at https://developer.spotify.com/dashboard; copy the Client ID
   and Client Secret.
2. Register the redirect URI **exactly** as `SPOTIFY_REDIRECT_URI`. Spotify
   requires HTTPS for non-loopback URIs and rejects `http://localhost` — use the
   loopback IP `http://127.0.0.1:8000/...` for local, or the funnel HTTPS URL
   (below) for remote.
3. Requested scopes: `playlist-read-private playlist-read-collaborative
   user-library-read user-top-read user-read-recently-played`.

Verify without a browser: a successful Client Credentials token fetch proves the
ID+secret are valid, and `GET /api/import/spotify/start` should 307 to
`accounts.spotify.com/authorize` with your `redirect_uri` and a `code_challenge`.

> **Cookie domain caveat:** the OAuth `state`/`verifier` cookies are set
> `Secure` on the origin that served `/start`. Because the callback must land on
> the *same* origin, complete the whole login on one URL — don't start at
> `127.0.0.1` and finish on the funnel domain (or vice versa).

## Hosting over Tailscale Funnel

The local service is exposed publicly over HTTPS with Tailscale Funnel on port
**8443**, leaving any existing funnel on 443 untouched.

```bash
# Expose 127.0.0.1:8000 on the funnel at :8443 (background)
tailscale funnel --bg --yes --https=8443 8000

tailscale funnel status      # inspect
tailscale funnel --https=8443 off   # stop
```

Public URL: `https://basils-macbook-pro.tail4752f5.ts.net:8443`
(Funnel ports are limited to 443, 8443, 10000.)

For Spotify login over the funnel, set and register:

```dotenv
SPOTIFY_REDIRECT_URI=https://basils-macbook-pro.tail4752f5.ts.net:8443/api/import/spotify/callback
```

`config.py` re-reads `.env` per request, so a redirect-URI change is picked up
without restarting uvicorn.

### Security ⚠️

Funnel publishes the service to the public internet. Before leaving it up:

- **Set `DMS_CONTROL_AUTH_TOKEN`.** With it unset on a non-Vercel host,
  `validate_control_auth` allows *all* control routes — so `POST /api/mcp/start`
  (spawns a node process) and the openclaw `play/stop/resume` routes (run
  `ffplay` locally) become callable by anyone. Setting the token requires a
  `Bearer <token>` or `X-Dev-Music-Token` header on those routes.
- Treat the funnel URL as public; rate limiting (slowapi) is per-IP only.
- Run `tailscale funnel --https=8443 off` when you're done sharing.
