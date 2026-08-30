# System Map

- `main.py`: FastAPI routes, rate limiting, logging, stream proxy, Spotify import
  endpoints, local playback endpoints, and MCP process management.
- `security.py`: stream URL allowlisting and control-route token checks.
- `static/index.html` + `static/gallery/`: the browser UI, served as static
  assets. No build step — modules are plain scripts loaded by the page.
- `static/gallery/base44-plugin.js`: shared real-time host runtime for embedded
  exports — scene snapshots and packed frames in, named events and intents in
  either direction, with optional request results.
  `docs/base44-plugin-pipeline.md` is the full contract, with diagrams.
- `static/gallery/plugin-dock.js`: shared placement for every floating panel,
  laid out as a horizontal stack that divides its width between them.
- `static/gallery/canvas-plugin.js`: mounts the Canvas editor as the notes
  panel; the shell owns the notes.
- `static/gallery/lyrics-shader-reader.js`: mounts the Shader Lab reader on
  that runtime; the shell stays authoritative for playback, lyrics and FFT.
- `static/gallery/lyric-scene.js`: resolves lines, sections, the active line,
  lyric mood and shader parameters so the reader derives nothing.
- `static/gallery/reader-preferences.js`: reader preferences and the DOM they
  drive, owned by the shell rather than the embedded surface.
- `static/gallery/wallpaper-palette.js`: the one implementation of the
  wallpaper palette softening and reader gradient.
- `lyrics-shader-lab/`: Vite/React reader app, built into
  `static/lyrics-shader-lab/` and served at `/lyrics-shader-lab`.
- `services/lyric_visual_service.py`: deterministic lyric visual analysis and
  canonical audio-feature shapes; no model secret reaches the browser.
- `frontend.py`: superseded by `static/`; no longer imported by the app.
- `services/music_service.py`: `yt-dlp` search and stream URL resolution.
- `services/metadata_service.py`: MusicBrainz and Cover Art Archive metadata.
- `services/musicbrainz_matcher.py`: ISRC and title matching for Spotify import.
- `services/lyrics_service.py`: LRCLIB lookup and LRC parsing.
- `services/live_transcription_service.py`: CaptionLocalizer transcription and
  its server-sent event stream, used when LRCLIB has no timed lyrics.
- `services/translated_vocals_service.py`: permitted-voice TTS for translated
  lyric lines; refuses artist voice cloning.
- `services/focus_service.py`: focus profile persistence and audio-feature
  scoring.
- `services/focus_storage.py`: focus profile storage backends, keyed per user.
- `services/local_playback_service.py`: local `ffplay` process control.
- `services/spotify_import_service.py`: Spotify OAuth PKCE and playlist import.
- `services/apple_music_import_service.py`: local Music/iTunes library export
  parsing; owner-only, and the library never leaves the host.
- `services/import_preview_service.py`: shared track matching and playback
  resolution behind both import paths.
- `services/beta_auth_service.py`: invite-code sessions for the private beta.
- `mcp-server/`: TypeScript MCP wrapper around the FastAPI backend.
