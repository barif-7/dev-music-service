# dev-music-service / Phase

**A browser-first music platform and FastAPI backend for search, streaming, synchronized lyrics, translation, audio-reactive visuals, playlist import, focus filtering, and agent/tool integrations.**

Phase is more than a thin `yt-dlp` wrapper. The repository now acts as the orchestration layer between media discovery, safe browser playback, MusicBrainz/LRCLIB metadata, Spotify and Apple Music imports, CaptionLocalizer, ReccoBeats audio features, Phase · Field shaders, embedded creative surfaces, and an MCP server.

> Want the fastest way to understand the codebase? Open [`learning-module.html`](learning-module.html) locally, then use [`docs/system-map.md`](docs/system-map.md) and [`docs/developer-api.md`](docs/developer-api.md) for deeper reference.

## What it does

- **Search + playback** — resolves music with `yt-dlp`, validates upstream media hosts, and serves browser-seekable streams with range support.
- **Synced lyrics** — fetches timed lyrics from LRCLIB and falls back to progressive CaptionLocalizer transcription when timed lyrics are unavailable.
- **Localization** — translates lyric windows just in time and supports bilingual Visual, Timeline, and Learn experiences.
- **Audio-reactive visuals** — combines live Web Audio measurements with track-level priors and proxies the Phase · Field shader catalogue same-origin.
- **Translated vocals** — builds timed translated-vocal segments through permitted voices while explicitly refusing artist voice cloning.
- **Library import** — supports Spotify OAuth/playlist import and owner-only Apple Music/iTunes library export ingestion.
- **Focus mode** — scores tracks against persisted focus profiles using a swappable audio-feature provider; ReccoBeats is the current provider.
- **Embedded creative surfaces** — hosts the Lyrics Shader Lab, Canvas editor, optional Semi/Pika voice-profile surface, Component Vault previews, and a shared plugin-dock/message runtime.
- **Developer + agent integrations** — exposes local playback/control routes and a TypeScript MCP wrapper around the FastAPI backend.
- **Private beta controls** — optional invite-code sessions, framing policies, rate limits, structured logging, and control-route authentication.

## Architecture

```mermaid
flowchart TB
    U[Browser / Phase shell] --> API[FastAPI · main.py]
    N[Native clients\niOS · iPadOS · macOS] --> API
    A[Agents / MCP clients] --> MCP[mcp-server]
    MCP --> API

    API --> SEARCH[MusicService\nyt-dlp search + media resolution]
    API --> META[MetadataService\nMusicBrainz + cover art]
    API --> LYRICS[LyricsService\nLRCLIB]
    API --> LIVE[LiveTranscriptionService\nCaptionLocalizer SSE]
    API --> VOCALS[TranslatedVocalsService]
    API --> IMPORT[Spotify / Apple Music import]
    API --> FOCUS[FocusService\nReccoBeats priors]
    API --> SHADERS[Phase · Field proxy]
    API --> VAULT[Component Vault MCP bridge]
    API --> LOCAL[LocalPlaybackService\nffplay control]

    U --> GALLERY[static/gallery runtime]
    GALLERY --> LAB[Lyrics Shader Lab\nVite + React]
    GALLERY --> CANVAS[Canvas surface]
    GALLERY --> SEMI[Optional Semi surface]

    SEARCH --> STREAM[/api/stream]
    STREAM --> U
    LYRICS --> GALLERY
    LIVE --> GALLERY
    FOCUS --> GALLERY
    SHADERS --> GALLERY
```

### The important architectural idea

`main.py` is the HTTP orchestration boundary; domain-specific work is pushed into `services/`. The browser shell remains authoritative for playback state, lyric timing, live FFT/audio measurements, preferences, and embedded-surface coordination. Embedded apps receive projected state and return named intents instead of independently owning playback or external-service access.

That split keeps the system understandable despite the repo spanning Python, plain browser JavaScript, React/Vite, external media services, local-process integrations, and MCP.

## Main code areas

| Path | Responsibility |
| --- | --- |
| `main.py` | FastAPI app, routes, auth middleware, rate limiting, streaming, integration orchestration, MCP process control |
| `config.py` | Environment-backed settings via `pydantic-settings` |
| `security.py` | Stream URL validation/allowlisting, sensitive-data redaction, control-route auth |
| `services/music_service.py` | `yt-dlp` search, candidate ranking, stream-source resolution and caching |
| `services/metadata_service.py` | MusicBrainz + Cover Art Archive metadata |
| `services/lyrics_service.py` | LRCLIB lookup and LRC parsing |
| `services/live_transcription_service.py` | CaptionLocalizer-backed transcription + server-sent events fallback |
| `services/translated_vocals_service.py` | Policy-aware translated-vocal synthesis |
| `services/focus_service.py` | Focus profiles and audio-feature scoring |
| `services/reccobeats_service.py` | Current audio-feature provider with caching/backoff |
| `services/spotify_import_service.py` | Spotify PKCE OAuth, playlists, liked tracks, playback resolution |
| `services/apple_music_import_service.py` | Local Music/iTunes XML/JSON export parsing |
| `services/import_preview_service.py` | Shared imported-track matching and playback resolution |
| `services/local_playback_service.py` | Local `ffplay` process control |
| `services/component_vault_service.py` | Server-side bridge to the local HistoryKit Component Vault MCP service |
| `static/index.html` | Main Phase browser shell |
| `static/gallery/` | Plugin dock, scene projection, lyric state, reader preferences, wallpaper integration |
| `lyrics-shader-lab/` | Base44-independent Vite/React lyric reader + shader lab |
| `mcp-server/` | TypeScript MCP wrapper around backend capabilities |
| `docs/` | System map, API guide, deployment notes, learning-module workflow and design notes |

Native iOS/iPadOS/macOS clients live separately in [`barif-7/dev-music-clients`](https://github.com/barif-7/dev-music-clients) and communicate with this service over HTTP.

## Request flows

### Search → playable audio

```text
User query
  → /api/search
  → MusicService
  → yt-dlp candidate discovery + ranking
  → webpage URL
  → /api/stream
  → validated direct media URL
  → proxy or redirect delivery
  → browser <audio> / Web Audio
```

The proxy path mirrors upstream `200`/`206` responses and range headers so browser seeking works. Resolved upstream URLs are allowlisted and checked before media is opened.

### Lyrics → bilingual reader

```text
Track metadata
  → LRCLIB timed lyrics
      ├─ found → parsed timed lines
      └─ missing → CaptionLocalizer live transcription session
                    → SSE finalized lines
  → just-in-time localization window
  → Phase shell lyric scene
  → Visual / Timeline / Learn embedded reader
```

The parent shell owns timing and sends stable line indices, current time, translation state, and live audio values to the reader. The reader sends intents such as seek, retry translation, or playback-rate changes back to the host.

### Audio-reactive visuals

```text
Playing stream
  → browser Web Audio analyser
  → bass / mid / treble / RMS / flux / onset
                 +
  ReccoBeats track-level priors when available
                 +
  lyric visual analysis
                 ↓
  Phase · Field shader parameters
```

Live browser measurements stay authoritative. Provider metadata biases the track personality but never blocks playback; missing audio features return an explicit neutral state instead of fabricated values.

## Key API groups

FastAPI's interactive reference is available at `/docs` while the service is running.

| Area | Representative routes |
| --- | --- |
| Search | `GET /api/autocomplete`, `GET /api/search` |
| Playback | `GET /api/stream`, `GET /api/video/search`, `GET /api/video/stream` |
| Lyrics | `GET /api/lyrics`, `POST /api/lyrics/localize-window` |
| Live transcription | `GET /api/lyrics/transcribe`, `GET /api/lyrics/transcribe/events` |
| Metadata | `GET /api/metadata` |
| Visuals | `GET /api/audio-features`, `POST /api/visuals/llm-analyze` |
| Shaders | `GET /api/shaders`, `GET /api/shaders/{id}/source` |
| Translated vocals | `POST /api/vocals/translated`, `GET /api/vocals/config` |
| Spotify import | `/api/import/spotify/*` |
| Apple Music import | `/api/apple-music/*`, `/api/import/apple-music/*` |
| Focus | `/api/focus/*` |
| Components | `GET /api/components/search` |
| Auth | `/api/auth/login`, `/api/auth/logout`, `/api/auth/status` |
| Local control | `/api/integrations/openclaw/*` |
| MCP process | `/api/mcp/status`, `/api/mcp/start`, `/api/mcp/stop` |

See [`docs/developer-api.md`](docs/developer-api.md) for configuration and endpoint details.

## Quick start

### Requirements

- Python **3.12+**
- [`uv`](https://docs.astral.sh/uv/) recommended for Python dependency management
- Node.js/npm when rebuilding embedded frontend surfaces or the MCP server
- `ffmpeg` / `ffplay` for media and local-playback workflows that use them

### Backend

```bash
git clone https://github.com/barif-7/dev-music-service.git
cd dev-music-service

cp .env.example .env
uv sync --extra dev
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

Then open:

- App: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`
- Learning module: open `learning-module.html` directly in a browser

> `pyproject.toml` is the intended dependency source of truth. The repository still contains `run.sh`/`requirements.txt` compatibility paths used by existing scripts and CI; prefer the `uv` flow for new local development.

### Lyrics Shader Lab

The built app is served by FastAPI at `/lyrics-shader-lab`. To work on its source:

```bash
npm run install:lyrics-shader-lab
npm run dev:lyrics-shader-lab
```

To rebuild the vendored production surface:

```bash
npm run build:lyrics-shader-lab
```

### Other embedded surfaces

```bash
npm run build:canvas
npm run build:semi
```

`build:semi` is only relevant when the pre-release Pika/Semi voice-profile feature is enabled.

## Configuration

Copy `.env.example` to `.env`. Important settings include:

| Variable | Purpose |
| --- | --- |
| `DEV_MUSIC_BASE_URL` | Backend base URL used by integrations |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify import + autocomplete credentials |
| `SPOTIFY_REDIRECT_URI` | OAuth callback URL |
| `CAPTION_LOCALIZER_URL` | CaptionLocalizer service for translation/transcription |
| `PHASE_FIELD_API_BASE_URL` | Upstream Phase · Field shader service |
| `APPLE_MUSIC_DEVELOPER_TOKEN` | MusicKit on the Web token |
| `STREAM_ALLOWED_HOSTS` | Upstream media-host allowlist |
| `STREAM_DELIVERY_MODE` | `proxy` or `redirect` |
| `DMS_CONTROL_AUTH_TOKEN` | Protects process-affecting local control routes |
| `FOCUS_PROFILE_STORAGE_BACKEND` | Focus-profile storage backend |
| `COMPONENT_VAULT_MCP_URL` | Local Component Vault MCP endpoint |

See [`.env.example`](.env.example) and [`docs/developer-api.md`](docs/developer-api.md) for the full set.

## Testing and quality

```bash
# Python tests
uv run --extra dev pytest

# Existing project test wrapper
./test.sh

# Browser-level design assertions
npm run audit:design

# MCP server
cd mcp-server
npm ci
npm run lint
npm test
npx tsc --noEmit
```

CI currently exercises Python **3.12 and 3.13**, flake8, frontend linting, pytest, Bandit security checks, MCP type-check/lint/tests, and an import smoke test.

The browser design audit is intentionally separate from CI: it drives Chromium and checks actual computed layout/geometry rather than brittle stylesheet string matching.

## Security model

This project handles remote media URLs and can optionally trigger local processes, so the security boundaries are intentional:

- Stream targets are validated against configured host allowlists and private-address protections.
- Process-affecting routes can be protected with `DMS_CONTROL_AUTH_TOKEN`.
- Private-beta auth can gate hosted UI/API access.
- Embedded surfaces receive explicit `X-Frame-Options` treatment; unapproved routes default to `DENY`.
- Structured logs pass through sensitive-data redaction.
- Rate limiting is applied to public-facing API routes.

If you expose the service through Tailscale Funnel, treat the URL as public and configure the control auth token first. See [`docs/deployment.md`](docs/deployment.md).

## External systems

```text
Spotify                  → account library + autocomplete
MusicBrainz              → canonical metadata / import matching
Cover Art Archive        → artwork
LRCLIB                   → synchronized lyrics
CaptionLocalizer         → lyric translation + live transcription
ReccoBeats               → track-level audio features
Phase · Field API        → shader catalogue + source formats
HistoryKit Component Vault → local component search / previews
Tailscale Funnel         → optional HTTPS exposure
```

## Learning the codebase

Use these in order:

1. **[`learning-module.html`](learning-module.html)** — visual 10–15 minute architecture walkthrough.
2. **[`docs/system-map.md`](docs/system-map.md)** — file-by-file system map.
3. **[`docs/developer-api.md`](docs/developer-api.md)** — API, configuration and hosting reference.
4. **[`HANDOFF.md`](HANDOFF.md)** — newest implementation decisions and known context, newest first.
5. **[`TESTING.md`](TESTING.md)** — testing strategy and commands.

## Design decisions worth discussing

This repo is a useful systems-design exercise because several decisions are deliberate rather than incidental:

- **Browser-first streaming vs. local playback** — the primary path is a normal browser media pipeline; `ffplay` is an optional integration rather than the product architecture.
- **Host-owned state for embedded apps** — the Phase shell owns playback, timing, and external-service access; embedded surfaces consume projections and emit intents.
- **Progressive degradation** — missing LRCLIB lyrics can become live transcription; missing audio-feature metadata becomes neutral priors; unavailable local developer services become explicit `503` states.
- **Provider abstraction** — focus scoring is insulated from the audio-feature provider, which allowed Spotify's deprecated audio-feature API to be replaced by ReccoBeats without changing the public focus contract.
- **Same-origin proxy boundaries** — shaders, CaptionLocalizer flows, media delivery, and Component Vault access are kept behind the backend so the browser does not need direct access to every upstream service.
- **Real rendering tests for design** — browser geometry checks validate the things users actually see rather than treating CSS source text as behavior.

## Status

Active personal/developer project. Some integrations depend on companion services or local developer infrastructure and intentionally degrade when those services are unavailable.

For recent implementation context, read [`HANDOFF.md`](HANDOFF.md) before making architectural changes.
