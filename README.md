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
- `GET /api/stream` and `GET /stream` proxy the resolved audio stream to the browser.
- `GET /api/lyrics` and `GET /lyrics` fetch normalized lyrics from LRCLIB, including synced LRC lines when available.
- `GET /api/browser/playback` returns the browser playback payload used by the web app.
- `GET /api/import/spotify/start` starts read-only Spotify playlist import auth.
- `GET /api/import/spotify/playlists` lists authenticated Spotify playlists.
- `GET /api/import/spotify/playlists/{playlist_id}/preview` maps playlist tracks to MusicBrainz.
- `GET /api/integrations/openclaw/play` launches local playback with `ffplay`.
- `GET /api/integrations/openclaw/stop` stops current local playback.
- `GET /api/integrations/openclaw/resume` restarts the most recent local playback.
- Legacy `GET /play`, `GET /stop`, and `GET /resume` remain as compatibility shims.

## Product direction

1. Browser playback is the primary interaction model.
2. Streaming stays server-backed so the frontend can play reliably through a plain audio element.
3. OpenClaw and other local automation paths use explicit integration endpoints instead of blending into the browser UX.

## Local requirements

- Python dependencies: `fastapi`, pinned `yt-dlp`, `uvicorn`
- Optional local integration tool: `ffplay`

## Local development

Run the service locally with:

```sh
./run.sh
```

The script creates `.venv` when needed, installs `requirements.txt`, and starts `uvicorn` on `127.0.0.1:8000`.

### yt-dlp maintenance

`yt-dlp` is pinned in `requirements.txt` and `pyproject.toml` because extractor
behavior can change. Run the lightweight extractor self-test after dependency
updates:

```sh
.venv/bin/python scripts/ytdlp_self_test.py
```

Review and bump `yt-dlp` at least monthly, or sooner when YouTube extraction
starts failing.

## Deployment notes

- Vercel uses the FastAPI app exposed from `app.py`.
- Browser playback is Vercel-safe because `/stream` stays HTTP-only and avoids local `ffmpeg` processing in the request path.
- Cover art prefers MusicBrainz/Cover Art Archive metadata, falls back to YouTube thumbnails during playback resolution, then to a generated placeholder.
- Local playback endpoints remain local-machine-only and return an error when invoked in the Vercel runtime.
## Spotify import setup

- Create a Spotify app and set the redirect URI to your deployed callback URL, for example `https://your-app.vercel.app/api/import/spotify/callback`.
- The app includes the configured Spotify client ID. Set `SPOTIFY_CLIENT_ID` in the deployment environment only if you need to override it.
- Optionally set `SPOTIFY_REDIRECT_URI` if automatic callback URL detection does not match the registered Spotify redirect URI exactly.
- Requested scopes are read-only: `playlist-read-private` and `playlist-read-collaborative`.

## Lyrics API

Primary endpoint:

`GET /lyrics?title=Passionfruit&artist=Drake`

Compatibility alias:

`GET /api/lyrics?title=Passionfruit&artist=Drake`

Optional query params:

- `album`: improves LRCLIB matching when known
- `duration`: track duration in seconds, also improves matching

Response shape:

```json
{
  "provider": "lrclib",
  "title": "Passionfruit",
  "artist": "Drake",
  "album": "More Life",
  "duration": 298,
  "instrumental": false,
  "synced": true,
  "plain_lyrics": "....",
  "synced_lyrics": "[00:12.00]...",
  "lines": [
    {
      "text": "Hold on, hold on, fuck that",
      "start_time_ms": 12000,
      "end_time_ms": 15420
    }
  ]
}
```

Notes:

- `lines` is normalized for the frontend. When synced lyrics exist, each line includes `start_time_ms` and inferred `end_time_ms`.
- If LRCLIB only has unsynced lyrics, `synced` is `false` and `lines` will contain text-only entries.
- The service sends a `User-Agent` to LRCLIB. Override it with `LRCLIB_USER_AGENT` if you want an app-specific value.
