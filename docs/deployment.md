# Deployment Topologies

This repo now keeps the code-level deployment choices configurable without provisioning any host.

## In use: CDN Frontend + Long-Running Backend

This is the topology the repo is wired for. Vercel serves `static/` and rewrites
`/api/*` and `/login` to the backend, so the browser sees one origin; audio is
fetched straight from the backend so its bytes skip the CDN. See `VERCEL.md` for
the setup, and the sections below for the alternatives it was chosen over.

It is the long-running topology below, with the frontend moved onto a CDN:
`STREAM_DELIVERY_MODE=proxy`, local JSON focus profiles, and the backend still
resolving media with `yt-dlp`.

## Long-Running Backend + Static Frontend + Local MCP

Run the FastAPI service on a normal host, serve `static/` from the app or a CDN, and build the MCP server locally with:

```bash
cd mcp-server
npm ci
npm run build
```

Use this topology when browser playback should preserve the current `/stream` proxy behavior. The backend resolves media URLs with `yt-dlp`, validates the resolved host allowlist, and streams bytes back to the browser. Local playback and MCP process routes can remain enabled when `DMS_CONTROL_AUTH_TOKEN` is configured.

Recommended settings:

```dotenv
STREAM_DELIVERY_MODE=proxy
FOCUS_PROFILE_STORAGE_BACKEND=local-json
DEV_MUSIC_BASE_URL=https://api.example.com
DEV_MUSIC_FRONTEND_ORIGIN=https://music.example.com
DEV_MUSIC_BACKEND_ORIGIN=https://api.example.com
DEV_MUSIC_MCP_ORIGIN=http://127.0.0.1:8000
```

Trade-offs:

- Best compatibility with signed media URLs and range requests.
- Requires a long-running host that can run `yt-dlp` and proxy streaming traffic.
- Local JSON focus profile storage is simple but tied to the host filesystem.

## Serverless Backend + Redirect Streaming + Hosted KV

Deploy FastAPI-compatible routes to a serverless target, serve `static/` from a CDN, use `/stream` redirect mode, and replace the focus profile KV stub with a provider adapter.

Recommended settings:

```dotenv
STREAM_DELIVERY_MODE=redirect
FOCUS_PROFILE_STORAGE_BACKEND=kv
FOCUS_PROFILE_KV_NAMESPACE=focus-profiles
DEV_MUSIC_BASE_URL=https://api.example.com
DEV_MUSIC_FRONTEND_ORIGIN=https://music.example.com
DEV_MUSIC_BACKEND_ORIGIN=https://api.example.com
```

Trade-offs:

- Avoids long-lived streaming responses and large proxy bandwidth on serverless hosts.
- Exposes the validated, signed media URL to the browser with a 302.
- **Measured: incompatible with this frontend.** The media elements are
  `crossorigin="anonymous"` so the Web Audio analyser can read them, which makes
  every media fetch a CORS request. `/stream` sets `Access-Control-Allow-Origin`
  on the 302 itself, but CORS requires the *final* response to carry it, and it
  does not:

  ```
  $ curl -sI -r 0-1023 -H 'Origin: https://phase.example.com' '<resolved googlevideo url>'
  HTTP/1.1 206 Partial Content
  Content-Type: audio/mp4
  Content-Range: bytes 0-1023/3449447
  X-Content-Type-Options: nosniff
  # no access-control-allow-origin
  ```

  Googlevideo returns no ACAO with or without an `Origin` header, so the browser
  rejects the response and the track does not load at all — this is not a
  degraded-visuals case. Redirect mode would require dropping
  `crossorigin="anonymous"`, which also gives up the analyser and therefore the
  audio-reactive wallpapers.

  Consequence: proxy mode is load-bearing, so every audio byte flows through the
  backend and its uplink is the ceiling on concurrent listeners.
- Requires a real KV implementation before focus profile writes can work.
- Process-affecting local routes should remain disabled unless a token and compatible runtime are available.

## Recommendation

Use the long-running backend topology until hosting constraints require serverless. It preserves current playback behavior, keeps range streaming under backend control, and uses the implemented local JSON focus profile storage. Move to the serverless topology only after choosing a KV provider and accepting redirect streaming trade-offs.
