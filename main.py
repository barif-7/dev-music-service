import os
import logging
import subprocess  # nosec B404
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import httpx
import structlog
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from config import get_settings
from frontend import INDEX_HTML
from services.focus_service import FocusProfile, FocusService
from services.local_playback_service import LocalPlaybackService
from services.metadata_service import MetadataService, MetadataServiceError
from services.lyrics_service import LyricsNotFoundError, LyricsRequestError, LyricsService
from services.music_service import MusicService, MusicServiceError
from services.spotify_import_service import SpotifyImportError, SpotifyImportService

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address, default_limits=["100 per minute", "1000 per hour"])


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    logger.info(
        "app_startup",
        version="0.4.0",
        mode="browser-first",
        spotify_configured=SpotifyImportService.is_configured(),
    )
    yield
    # Shutdown
    logger.info("app_shutdown")


app = FastAPI(
    title="Dev Music Service",
    version="0.4.0",
    description="Music search and streaming with browser-first playback",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def fail_with_http_error(exc: Exception) -> None:
    if isinstance(exc, LyricsRequestError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(exc, LyricsNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, (MusicServiceError, MetadataServiceError, SpotifyImportError)):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/")
def root():
    return HTMLResponse(INDEX_HTML)


@app.get("/debug-playback.html")
def debug_playback():
    """Serve the debug playback test page."""
    try:
        with open("debug-playback.html", "r") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        return HTMLResponse("Debug page not found", status_code=404)


@app.get("/health")
def health():
    settings = get_settings()
    return {
        "status": "ok",
        "mode": "browser-first",
        "stream_delivery": "proxy",
        "local_integration": (
            "disabled-on-vercel" if settings.vercel else "openclaw-cli-optional"
        ),
        "spotify_import": "configured" if SpotifyImportService.is_configured() else "missing-client-id",
    }


@app.get("/api/import/spotify/start")
@limiter.limit("10 per minute")
def spotify_start(request: Request):
    try:
        logger.info("spotify_auth_started")
        return SpotifyImportService.start_auth(request)
    except Exception as exc:
        logger.error("spotify_auth_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/import/spotify/callback")
@limiter.limit("10 per minute")
async def spotify_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    try:
        logger.info("spotify_auth_callback")
        return await SpotifyImportService.callback(request, code, state, error)
    except Exception as exc:
        logger.error("spotify_auth_callback_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/import/spotify/status")
def spotify_status(request: Request):
    return {
        "configured": SpotifyImportService.is_configured(),
        "connected": SpotifyImportService.is_connected(request),
    }


@app.get("/api/import/spotify/playlists")
@limiter.limit("30 per minute")
async def spotify_playlists(
    request: Request,
    limit: int = Query(20, ge=1, le=50, description="Number of playlists to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    try:
        logger.info("spotify_playlists_listed", limit=limit, offset=offset)
        playlists = await SpotifyImportService.list_playlists(request, limit=limit, offset=offset)
        return [playlist.model_dump() for playlist in playlists]
    except Exception as exc:
        logger.error("spotify_playlists_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/import/spotify/playlists/{playlist_id}/preview")
@limiter.limit("20 per minute")
async def spotify_playlist_preview(
    playlist_id: str,
    request: Request,
    limit: int = Query(25, ge=1, le=50, description="Number of tracks to import and match"),
    offset: int = Query(0, ge=0, description="Pagination offset into the playlist"),
):
    try:
        logger.info("spotify_playlist_preview", playlist_id=playlist_id, limit=limit)
        return (await SpotifyImportService.preview_playlist(request, playlist_id, limit=limit, offset=offset)).model_dump()
    except Exception as exc:
        logger.error("spotify_playlist_preview_failed", playlist_id=playlist_id, error=str(exc))
        fail_with_http_error(exc)


@app.post("/api/import/spotify/disconnect")
def spotify_disconnect():
    return SpotifyImportService.clear_connection()


@app.get("/api/search")
@app.get("/search")
@limiter.limit("60 per minute")
def search_song(
    request: Request,
    query: str = Query(..., min_length=1, max_length=500, description="Resolved song query"),
    limit: int = Query(1, ge=1, le=5, description="Number of YouTube candidates to resolve"),
):
    try:
        logger.info("search_requested", query_length=len(query), limit=limit)
        results = [result.model_dump() for result in MusicService.search(query, limit=limit)]
        return JSONResponse(content=results, headers={"Cache-Control": "public, max-age=300"})
    except Exception as exc:
        logger.error("search_failed", query_length=len(query), error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/autocomplete")
@limiter.limit("60 per minute")
async def autocomplete_song(
    request: Request,
    query: str = Query(..., min_length=1, max_length=500, description="Song title, artist, or combined metadata query"),
    limit: int = Query(6, ge=1, le=10, description="Number of metadata suggestions to return"),
    fields: Optional[str] = Query(None, description="Comma-separated fields to include (omit for all)"),
):
    try:
        logger.info("autocomplete_requested", query_length=len(query), limit=limit)
        suggestions = await MetadataService.autocomplete(query, limit=limit)
        if fields:
            field_set = set(fields.split(","))
            data = [{k: v for k, v in s.model_dump().items() if k in field_set} for s in suggestions]
        else:
            data = [s.model_dump() for s in suggestions]
        logger.info("autocomplete_completed", results_count=len(data))
        return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=300"})
    except Exception as exc:
        logger.error("autocomplete_failed", query_length=len(query), error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/lyrics")
@app.get("/lyrics")
@limiter.limit("60 per minute")
def get_lyrics(
    request: Request,
    title: str = Query(..., min_length=1, max_length=500, description="Track title"),
    artist: str = Query(..., min_length=1, max_length=500, description="Track artist"),
    album: Optional[str] = Query(default=None, description="Album name for improved matching"),
    duration: Optional[int] = Query(
        default=None, ge=0, description="Track duration in seconds for improved matching"
    ),
):
    try:
        logger.info("lyrics_requested", title=title, artist=artist, has_album=bool(album))
        payload = LyricsService.get_lyrics(
            title=title,
            artist=artist,
            album=album,
            duration=duration,
        ).model_dump()
        return JSONResponse(content=payload, headers={"Cache-Control": "public, max-age=3600"})
    except Exception as exc:
        logger.error("lyrics_failed", title=title, artist=artist, error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/metadata")
@app.get("/metadata")
@limiter.limit("60 per minute")
def get_metadata(
    request: Request,
    url: str = Query(..., min_length=1, max_length=2000, description="Track webpage URL"),
):
    try:
        logger.info("metadata_requested", url_length=len(url))
        payload = MusicService.get_metadata(url).model_dump()
        return JSONResponse(content=payload, headers={"Cache-Control": "public, max-age=300"})
    except Exception as exc:
        logger.error("metadata_failed", url_length=len(url), error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/stream")
@app.get("/stream")
@limiter.limit("30 per minute")
async def stream_song(
    request: Request,
    url: str = Query(..., description="Track webpage URL"),
    range_header: Optional[str] = Header(None, alias="Range"),
):
    try:
        import asyncio

        logger.info("stream_requested", url_length=len(url))
        direct_url, req_headers = MusicService.get_stream_source(url)

        # Create async generator to stream audio chunks with range support
        async def stream_audio() -> AsyncGenerator[bytes, None]:
            headers_copy = dict(req_headers)
            if range_header:
                headers_copy["Range"] = range_header

            async with httpx.AsyncClient() as client:
                async with client.stream("GET", direct_url, headers=headers_copy, timeout=30.0) as response:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        yield chunk
                        await asyncio.sleep(0)  # Allow other tasks to run

        # Get content type from the stream
        content_type = "audio/mp4"

        logger.info("stream_started", content_type=content_type)
        return StreamingResponse(
            stream_audio(),
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=300",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Range, Content-Type",
                "Accept-Ranges": "bytes",
            }
        )
    except Exception as exc:
        logger.error("stream_failed", url_length=len(url), error=str(exc))
        fail_with_http_error(exc)


class PlaybackRequest(BaseModel):
    url: str
    title: str = "Unknown Title"
    duration: int = 0
    album: Optional[str] = None
    artist: Optional[str] = None
    thumbnail: Optional[str] = None
    artwork_source: Optional[str] = None
    artwork_confidence: Optional[str] = None
    release_year: Optional[int] = None


@app.post("/api/browser/playback")
@limiter.limit("60 per minute")
def browser_playback(request: Request, body: PlaybackRequest):
    try:
        logger.info("browser_playback_requested", title=body.title)
        return MusicService.build_browser_state(
            body.url,
            body.title,
            body.duration,
            album=body.album,
            artist=body.artist,
            thumbnail=body.thumbnail,
            artwork_source=body.artwork_source,
            artwork_confidence=body.artwork_confidence,
            release_year=body.release_year,
        ).model_dump()
    except Exception as exc:
        logger.error("browser_playback_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/integrations/openclaw/play")
@app.get("/play")
@limiter.limit("30 per minute")
def play_song(request: Request, query: str = Query(..., min_length=1, max_length=500, description="Song name or YouTube query")):
    try:
        logger.info("local_play_requested", query_length=len(query))
        return LocalPlaybackService.play_query(query).model_dump()
    except Exception as exc:
        logger.error("local_play_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/integrations/openclaw/stop")
@app.get("/stop")
@limiter.limit("30 per minute")
def stop_song(request: Request):
    try:
        logger.info("local_stop_requested")
        return LocalPlaybackService.stop().model_dump()
    except Exception as exc:
        logger.error("local_stop_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/integrations/openclaw/resume")
@app.get("/resume")
@limiter.limit("30 per minute")
def resume_song(request: Request):
    try:
        logger.info("local_resume_requested")
        return LocalPlaybackService.resume().model_dump()
    except Exception as exc:
        logger.error("local_resume_failed", error=str(exc))
        fail_with_http_error(exc)


# ── Focus / ADHD mode routes ──────────────────────────────────────────────────

@app.get("/api/focus/profile")
def get_focus_profile():
    """Return the current focus profile (BPM range, instrumentalness threshold, etc.)"""
    return FocusProfile.load()


@app.post("/api/focus/profile")
@limiter.limit("30 per minute")
def update_focus_profile(request: Request, profile: dict):
    """Update and persist the focus profile."""
    try:
        return FocusProfile.save(profile)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/focus/profile/reset")
def reset_focus_profile():
    """Reset to defaults."""
    return FocusProfile.reset()


@app.get("/api/focus/playlist/{playlist_id}")
@limiter.limit("20 per minute")
async def focus_filter_playlist(
    playlist_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=50),
):
    """
    Filter a Spotify playlist to only tracks that match the focus profile,
    ranked by focus score. Returns audio features for every track.
    """
    try:
        token = SpotifyImportService._access_token(request)
        profile = FocusProfile.load()
        logger.info("focus_filter_playlist", playlist_id=playlist_id)
        return await FocusService.focus_filter_playlist(token, playlist_id, limit=limit, profile=profile)
    except Exception as exc:
        logger.error("focus_filter_playlist_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/focus/top-tracks")
@limiter.limit("10 per minute")
async def focus_top_tracks(
    request: Request,
    time_range: str = Query("medium_term", pattern="^(short_term|medium_term|long_term)$"),
):
    """
    Analyse the user's Spotify top tracks against their focus profile.
    Returns BPM insights and ranked focus-suitable tracks.
    Requires user-top-read scope (users must reconnect Spotify after this update).
    """
    try:
        token = SpotifyImportService._access_token(request)
        profile = FocusProfile.load()
        logger.info("focus_top_tracks", time_range=time_range)
        return await FocusService.analyse_top_tracks(token, time_range=time_range, profile=profile)
    except Exception as exc:
        logger.error("focus_top_tracks_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/focus/track/{track_id}")
@limiter.limit("60 per minute")
async def focus_track_features(track_id: str, request: Request):
    """
    Return audio features + focus score for a single Spotify track ID.
    """
    try:
        token = SpotifyImportService._access_token(request)
        profile = FocusProfile.load()
        af = await FocusService.get_track_features(token, track_id)
        if af is None:
            raise HTTPException(status_code=404, detail="Audio features not available for this track")
        return {**af.to_dict(), "focus_score": af.focus_score(profile), "matches_profile": af.matches_profile(profile)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("focus_track_features_failed", error=str(exc))
        fail_with_http_error(exc)


# MCP server process management
_mcp_process: Optional[subprocess.Popen] = None


def _mcp_server_path() -> str:
    return os.path.join(os.path.dirname(__file__), "mcp-server", "dist", "index.js")


def _mcp_is_running() -> bool:
    return _mcp_process is not None and _mcp_process.poll() is None


@app.get("/api/mcp/status")
def mcp_status():
    running = _mcp_is_running()
    return {
        "running": running,
        "pid": _mcp_process.pid if running else None,
        "message": "MCP server is running" if running else "MCP server is not running",
    }


@app.post("/api/mcp/start")
@limiter.limit("10 per minute")
def mcp_start(request: Request):
    global _mcp_process
    if _mcp_is_running():
        return {"running": True, "pid": _mcp_process.pid, "message": "MCP server already running"}

    server_path = _mcp_server_path()
    if not os.path.exists(server_path):
        raise HTTPException(status_code=500, detail="MCP server dist not found — run npm run build in mcp-server/")

    try:
        _mcp_process = subprocess.Popen(  # nosec B603 B607
            ["node", server_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        logger.info("mcp_server_started", pid=_mcp_process.pid)
        return {"running": True, "pid": _mcp_process.pid, "message": "MCP server started"}
    except Exception as exc:
        logger.error("mcp_server_start_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to start MCP server: {exc}") from exc


@app.post("/api/mcp/stop")
@limiter.limit("10 per minute")
def mcp_stop(request: Request):
    global _mcp_process
    if not _mcp_is_running():
        return {"running": False, "message": "MCP server was not running"}

    pid = _mcp_process.pid
    try:
        _mcp_process.send_signal(__import__("signal").SIGTERM)
        _mcp_process.wait(timeout=3)
    except Exception:
        try:
            _mcp_process.kill()
        except Exception as kill_exc:
            logger.warning("mcp_server_kill_failed", pid=pid, error=str(kill_exc))
    _mcp_process = None
    logger.info("mcp_server_stopped", pid=pid)
    return {"running": False, "pid": pid, "message": "MCP server stopped"}
