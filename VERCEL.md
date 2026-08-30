# Vercel Deployment Guide

Vercel hosts **the frontend only**. The FastAPI backend runs on its own
long-running host: it shells out to `yt-dlp`, proxies range requests for audio,
and holds SSE connections open for live transcription — none of which suit a
serverless function.

Earlier revisions of this file described deploying FastAPI itself to Vercel via
`app.py` / `api/index.py`. That is no longer how this project deploys. Those two
files are still in the tree but are unused by this project; `.vercelignore`
excludes `api/` so Vercel does not auto-detect and build the legacy Python
function.

## How it fits together

```
Browser  ──►  Vercel (CDN + middleware)
              ├─ /                      dist/index.html
              ├─ /static/**             dist/static/**            CDN
              ├─ /api/**   ── rewrite ──►  backend
              └─ /login    ── rewrite ──►  backend
Browser  ──────────────── direct ───────►  backend  /api/stream
```

Because `/api` is rewritten rather than called cross-origin, the browser sees a
single origin: no CORS preflights, and `Set-Cookie` from sign-in scopes to the
Vercel domain. Audio is the exception — it is fetched straight from the backend
so those bytes never cross Vercel.

## Configuration

### vercel.ts

Routing lives in `vercel.ts`, not `vercel.json` (only one may exist). It is
TypeScript because the backend origin comes from an environment variable, which
`vercel.json` cannot interpolate.

The build fails loudly if `PHASE_BACKEND_ORIGIN` is unset rather than deploying
a broken rewrite.

### Environment variables

Set in Vercel Dashboard → Settings → Environment Variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `PHASE_BACKEND_ORIGIN` | yes | Backend's public origin, e.g. `https://host.tailnet.ts.net`. Drives both the rewrites and the direct audio URL. No trailing slash needed — one is stripped. |
| `PHASE_BETA_AUTH_ENABLED` | no | Set `true` to mirror `BETA_AUTH_ENABLED` on the backend so `middleware.ts` gates the shell. Left unset, the shell is public and only the API is protected. |

### Build

`scripts/build-vercel-frontend.mjs` stages `dist/` and nothing else — every
plugin bundle under `static/` is committed build output, so Vercel compiles
nothing. The shell addresses assets as absolute `/static/...` paths, so the
staged tree keeps `index.html` at the root with `static/` beneath it; serving
`static/` directly would resolve `/static/gallery/app.js` to
`static/static/gallery/app.js`.

Rebuild the plugin bundles locally and commit them before deploying:

```bash
npm run build:lyrics-shader-lab
npm run build:canvas          # needs a base44-canvas checkout; see the script
npm run build:vercel          # stage dist/ locally to inspect it
```

## Backend settings for a split deployment

On the backend host:

```dotenv
DEV_MUSIC_FRONTEND_ORIGIN=https://<your-vercel-domain>
BETA_COOKIE_SECURE=true
```

`DEV_MUSIC_FRONTEND_ORIGIN` pins the `Access-Control-Allow-Origin` header on the
stream routes. That header is load-bearing: the audio elements are
`crossorigin="anonymous"` so the Web Audio analyser can read them, and without
it the analyser is CORS-tainted and the audio-reactive visuals go still.

Because no cookie rides along on those cross-origin media requests, the stream
routes are exempt from the beta gate (`_PUBLIC_STREAM_PATHS` in `main.py`).
`validate_stream_url()` still restricts them to the upstream host allowlist and
rejects private addresses.

## Local testing

```bash
PHASE_BACKEND_ORIGIN=https://host.tailnet.ts.net npm run build:vercel
npx @vercel/config compile     # print the routing config the platform will use
npx @vercel/config validate
```

`vercel.ts` is recent, so local `vercel build` / `vercel dev` want an up-to-date
CLI (`npm i -g vercel@latest`). Git-triggered deploys build on Vercel's side and
are unaffected.

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| Build fails on `PHASE_BACKEND_ORIGIN must be set` | The env var is missing for that environment. |
| Assets 404 under `/static/...` | `dist/` was not staged; check `outputDirectory` is `dist`. |
| API calls 404 | Rewrite not applied — run `npx @vercel/config compile` and confirm the destinations. |
| Signed in but immediately bounced to `/login` | Sign-in reached the backend origin directly, so the cookie scoped to the wrong domain. `/login` must stay rewritten. |
| Audio plays but visuals do not react | Analyser is CORS-tainted; check `DEV_MUSIC_FRONTEND_ORIGIN` on the backend matches the Vercel domain. |
| Audio 401s | Stream routes are no longer exempt from the beta gate on the backend. |

## Focus profile persistence

The focus profile is stored as JSON on local disk at
`$DMS_DATA_DIR/focus_profile.json`. That is fine for a single long-running
backend but is not safe for concurrent multi-user writes; a real store is needed
before the beta grows.
