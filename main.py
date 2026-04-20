import os

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from frontend import INDEX_HTML
from services.local_playback_service import LocalPlaybackService
from services.metadata_service import MetadataService, MetadataServiceError
from services.music_service import MusicService, MusicServiceError
from services.spotify_import_service import SpotifyImportError, SpotifyImportService

app = FastAPI()


def fail_with_http_error(exc: Exception) -> None:
    if isinstance(exc, (MusicServiceError, MetadataServiceError, SpotifyImportError)):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/")
def root():
    return HTMLResponse(INDEX_HTML)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode": "browser-first",
        "stream_delivery": "redirect",
        "local_integration": "disabled-on-vercel" if os.getenv("VERCEL") else "openclaw-cli-optional",
        "spotify_import": "configured" if os.getenv("SPOTIFY_CLIENT_ID") else "missing-client-id",
    }


@app.get("/api/import/spotify/start")
def spotify_start(request: Request):
    try:
        return SpotifyImportService.start_auth(request)
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/import/spotify/callback")
def spotify_callback(
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
):
    try:
        return SpotifyImportService.callback(request, code, state, error)
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/import/spotify/status")
def spotify_status(request: Request):
    return {
        "configured": bool(os.getenv("SPOTIFY_CLIENT_ID")),
        "connected": SpotifyImportService.is_connected(request),
    }


@app.get("/api/import/spotify/playlists")
def spotify_playlists(
    request: Request,
    limit: int = Query(20, ge=1, le=50, description="Number of playlists to return"),
):
    try:
        return [playlist.model_dump() for playlist in SpotifyImportService.list_playlists(request, limit=limit)]
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/import/spotify/playlists/{playlist_id}/preview")
def spotify_playlist_preview(
    playlist_id: str,
    request: Request,
    limit: int = Query(25, ge=1, le=50, description="Number of tracks to import and match"),
):
    try:
        return SpotifyImportService.preview_playlist(request, playlist_id, limit=limit).model_dump()
    except Exception as exc:
        fail_with_http_error(exc)


@app.post("/api/import/spotify/disconnect")
def spotify_disconnect():
    return SpotifyImportService.clear_connection()


@app.get("/api/search")
@app.get("/search")
def search_song(
    query: str = Query(..., description="Resolved song query"),
    limit: int = Query(1, ge=1, le=5, description="Number of YouTube candidates to resolve"),
):
    try:
        return [result.model_dump() for result in MusicService.search(query, limit=limit)]
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/autocomplete")
def autocomplete_song(
    query: str = Query(..., description="Song title, artist, or combined metadata query"),
    limit: int = Query(6, ge=1, le=10, description="Number of metadata suggestions to return"),
):
    try:
        return [suggestion.model_dump() for suggestion in MetadataService.autocomplete(query, limit=limit)]
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/stream")
@app.get("/stream")
def stream_song(url: str = Query(..., description="Track webpage URL")):
    try:
        return RedirectResponse(MusicService.resolve_stream_url(url), status_code=307)
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/browser/playback")
def browser_playback(
    url: str = Query(..., description="Track webpage URL"),
    title: str = Query("Unknown Title", description="Track title"),
    duration: int = Query(0, description="Track duration in seconds"),
    album: str | None = Query(None, description="Album name, if available"),
    artist: str | None = Query(None, description="Artist name, if available"),
    thumbnail: str | None = Query(None, description="Artwork thumbnail URL, if available"),
    artwork_source: str | None = Query(None, description="Artwork provider, if available"),
    artwork_confidence: str | None = Query(None, description="Artwork confidence level, if available"),
    release_year: int | None = Query(None, description="Release or upload year, if available"),
):
    try:
        return MusicService.build_browser_state(
            url,
            title,
            duration,
            album=album,
            artist=artist,
            thumbnail=thumbnail,
            artwork_source=artwork_source,
            artwork_confidence=artwork_confidence,
            release_year=release_year,
        ).model_dump()
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/integrations/openclaw/play")
@app.get("/play")
def play_song(query: str = Query(..., description="Song name or YouTube query")):
    try:
        return LocalPlaybackService.play_query(query).model_dump()
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/integrations/openclaw/stop")
@app.get("/stop")
def stop_song():
    try:
        return LocalPlaybackService.stop().model_dump()
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/integrations/openclaw/resume")
@app.get("/resume")
def resume_song():
    try:
        return LocalPlaybackService.resume().model_dump()
    except Exception as exc:
        fail_with_http_error(exc)
