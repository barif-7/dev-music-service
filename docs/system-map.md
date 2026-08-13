# System Map

- `main.py`: FastAPI routes, rate limiting, logging, stream proxy, Spotify import
  endpoints, local playback endpoints, and MCP process management.
- `security.py`: stream URL allowlisting and control-route token checks.
- `static/index.html` + `static/gallery/`: the browser UI, served as static
  assets. No build step — modules are plain scripts loaded by the page.
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
