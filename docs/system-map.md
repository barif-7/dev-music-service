# System Map

- `main.py`: FastAPI routes, rate limiting, logging, stream proxy, Spotify import
  endpoints, local playback endpoints, and MCP process management.
- `frontend.py`: current browser UI payload, pending extraction to static assets.
- `services/music_service.py`: `yt-dlp` search and stream URL resolution.
- `services/metadata_service.py`: MusicBrainz and Cover Art Archive metadata.
- `services/musicbrainz_matcher.py`: ISRC and title matching for Spotify import.
- `services/lyrics_service.py`: LRCLIB lookup and LRC parsing.
- `services/focus_service.py`: focus profile persistence and audio-feature
  scoring.
- `services/local_playback_service.py`: local `ffplay` process control.
- `services/spotify_import_service.py`: Spotify OAuth PKCE and playlist import.
- `mcp-server/`: TypeScript MCP wrapper around the FastAPI backend.
