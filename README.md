# dev-music-service

**FastAPI music platform with browser-first playback, search, streaming, synced lyrics, and Spotify import.**

[![Python](https://img.shields.io/badge/Python-3.x-blue)](https://python.org) [![FastAPI](https://img.shields.io/badge/FastAPI-teal)](https://fastapi.tiangolo.com)

## Key Endpoints
- Browser UI + streaming.
- Lyrics from LRCLIB.
- Local playback integrations.

## Quick Start
`./run.sh` for local dev. See original for yt-dlp and deployment notes.

## Embedded Lyrics Shader Lab

The Base44 prototype now lives as a Base44-independent Vite sub-application in
`lyrics-shader-lab/`. It uses the same-origin FastAPI contracts for search,
streaming, synced lyrics, canonical track priors, shader metadata, and lyric
visual analysis. Frame-level motion is measured from the playing stream with
Web Audio rather than simulated values.

```bash
npm run install:lyrics-shader-lab
npm run build:lyrics-shader-lab
./run.sh
```

Open `http://127.0.0.1:8000/lyrics-shader-lab` for the full lab. Its focused
visual/timeline reader is embedded as the main Phase lyric window and follows
the existing player. The reader is transparent to the active Phase wallpaper,
updates when wallpapers switch, and keeps its translation control outside the
visual surface. The current Base44 bilingual-reader components add a Learn
view, focus/stacked/side-by-side translation layouts, per-word vocabulary
lookup, an optional timestamp-synced word glow for both original and translated
lines, an optional video-style mode that pins lyrics beneath the shader,
an independent text-only window appearance, dyslexia-friendly type,
an animated share-sheet appearance, screen-reader announcements, and uniform-driven
lyric motion. Translation and vocabulary requests stay server-side through
CaptionLocalizer; provider data that is not returned is not invented. The full
lab pairs the same Visual/Timeline/Learn controls with real service playback
and a lyric sequencer for per-line entrance, exit, placement, size, and ordering
overrides. For frontend-only development, run
`npm run dev:lyrics-shader-lab`; Vite proxies `/api` and `/stream` to port 8000.
