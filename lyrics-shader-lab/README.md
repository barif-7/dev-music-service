# Embedded Lyrics Shader Lab

This is the portable Vite/React source for the Lyrics Shader Lab embedded in
`dev-music-service`. It was derived from the Base44 prototype, but contains no
Base44 runtime, authentication, API client, token, or build plugin.

## Runtime contracts

- `GET /api/search` selects a playable track.
- `GET /api/stream` supplies same-origin audio for playback and Web Audio.
- `GET /api/lyrics` supplies timestamped LRCLIB/transcribed lyrics.
- `GET /api/audio-features` supplies optional track-level priors.
- `POST /api/visuals/llm-analyze` supplies deterministic lyric visual direction.
- `GET /api/shaders` supplies the Phase shader catalogue metadata.

Live Web Audio measurements drive frame motion. Track priors and lyric analysis
only bias the visual personality, so missing Spotify or shader services never
block playback.

## Development

From the repository root:

```bash
npm run install:lyrics-shader-lab
npm run dev:lyrics-shader-lab
```

The Vite server runs on port 5174 and proxies API/stream calls to the FastAPI
server on port 8000.

## Production build

```bash
npm run build:lyrics-shader-lab
```

The build is written to `static/lyrics-shader-lab/` and served at
`/lyrics-shader-lab` by FastAPI.
