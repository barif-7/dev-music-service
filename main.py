import os
import json
import logging
import re
import subprocess  # nosec B404
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator, Optional

import certifi
import httpx
import structlog
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.concurrency import run_in_threadpool

from config import get_settings
from models import (
    AppleMusicImportAlbum,
    ImportedPlaylistTrack,
    LocalizeWindowRequest,
    LyricVisualAnalysisRequest,
    SpotifySaveTrackRequest,
    TranslatedVocalRequest,
)
from security import (
    open_validated_stream,
    redact_sensitive_data,
    validate_control_auth,
    validate_stream_url,
)
from services.apple_music_import_service import AppleMusicImportError, AppleMusicImportService
from services.beta_auth_service import (
    SESSION_COOKIE,
    authenticate_invite,
    create_session,
    is_owner,
    login_redirect,
    request_user,
    require_owner,
    safe_next_path,
    verify_session,
)
from services.focus_service import FocusProfile, FocusService
from services.import_preview_service import ImportPreviewError, ImportPreviewService
from services.local_playback_service import LocalPlaybackService
from services.metadata_service import MetadataService, MetadataServiceError
from services.live_transcription_service import LiveTranscriptionService
from services.lyrics_service import LyricsNotFoundError, LyricsRequestError, LyricsService
from services.lyric_visual_service import LyricVisualService
from services.music_service import MusicService, MusicServiceError
from services.spotify_import_service import SpotifyImportError, SpotifyImportService
from services.translated_vocals_service import (
    TranslatedVocalsPolicyError,
    TranslatedVocalsService,
    TranslatedVocalsServiceError,
)
from services.video_service import VideoService, VideoServiceError

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso"),
        redact_sensitive_data,
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
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"


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
    # Warm up persistent HTTP clients (establishes TLS connections)
    try:
        MetadataService._get_mb_client()
        SpotifyImportService._get_http_client()
        if SpotifyImportService._client_credentials_configured():
            await SpotifyImportService.get_client_credentials_token()
    except Exception:
        pass
    yield
    # Shutdown
    logger.info("app_shutdown")
    mb = MetadataService._mb_client
    sp = SpotifyImportService._http_client
    if mb and not mb.is_closed:
        await mb.aclose()
    if sp and not sp.is_closed:
        await sp.aclose()
    if _phase_field_client and not _phase_field_client.is_closed:
        await _phase_field_client.aclose()


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
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

_PUBLIC_BETA_PATHS = {"/health", "/login", "/api/auth/login", "/api/auth/status"}


@app.middleware("http")
async def beta_auth_gate(request: Request, call_next):
    """Keep the hosted beta private while leaving local development opt-in."""
    settings = get_settings()
    request.state.beta_user = None
    if settings.beta_auth_enabled:
        user = verify_session(request.cookies.get(SESSION_COOKIE), settings)
        request.state.beta_user = user
        path = request.url.path
        is_public = path in _PUBLIC_BETA_PATHS or path.startswith("/static/")
        if not user and not is_public and request.method != "OPTIONS":
            if path.startswith("/api/") or path in {"/search", "/lyrics", "/metadata", "/stream"}:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Beta sign-in required"},
                    headers={"Cache-Control": "no-store"},
                )
            return RedirectResponse(login_redirect(path), status_code=303)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    return response


def fail_with_http_error(exc: Exception) -> None:
    if isinstance(exc, HTTPException):
        raise exc
    if isinstance(exc, LyricsRequestError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(exc, LyricsNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(
        exc,
        (
            ImportPreviewError,
            MusicServiceError,
            MetadataServiceError,
            SpotifyImportError,
            VideoServiceError,
            httpx.HTTPError,
        ),
    ):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/")
def root():
    return FileResponse(STATIC_DIR / "index.html")


class BetaLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    invite_code: str = Field(min_length=1, max_length=256)
    next: Optional[str] = None


@app.get("/login")
def beta_login_page(next: Optional[str] = Query(default="/")):
    target = safe_next_path(next)
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phase private beta</title><style>
body{{font:16px system-ui;background:#0d0d12;color:#f7f7fb;display:grid;place-items:center;min-height:100vh;margin:0}}
form{{width:min(360px,calc(100% - 48px));padding:30px;border:1px solid #343442;border-radius:18px;background:#17171f}}
h1{{margin:0 0 8px}}p{{color:#aaaabd}}label{{display:block;margin-top:18px}}input,button{{box-sizing:border-box;width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #454557;background:#0d0d12;color:inherit}}
button{{background:#735cff;border:0;font-weight:700;cursor:pointer}}#error{{color:#ff8c9d;min-height:1.3em}}
</style></head><body><form id="login"><h1>Phase</h1><p>Private friends &amp; family beta</p>
<label>Email<input name="email" type="email" autocomplete="email" required></label>
<label>Invite code<input name="invite_code" type="password" autocomplete="one-time-code" required></label>
<p id="error"></p><button>Enter beta</button></form><script>
document.getElementById('login').addEventListener('submit',async(e)=>{{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/auth/login',{{method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({{email:f.get('email'),invite_code:f.get('invite_code'),next:{json.dumps(target)}}})}});const d=await r.json();if(r.ok)location.assign(d.next);else document.getElementById('error').textContent=d.detail||'Sign-in failed';}});
</script></body></html>"""
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'",
        },
    )


@app.post("/api/auth/login")
@limiter.limit("10 per minute")
def beta_login(request: Request, body: BetaLoginRequest):
    email = authenticate_invite(body.email, body.invite_code)
    settings = get_settings()
    response = JSONResponse({"authenticated": True, "next": safe_next_path(body.next)})
    response.set_cookie(
        SESSION_COOKIE,
        create_session(email, settings),
        max_age=max(1, min(settings.beta_session_hours, 24 * 30)) * 3600,
        httponly=True,
        secure=settings.beta_cookie_secure,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/auth/logout")
def beta_logout():
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/auth/status")
def beta_auth_status(request: Request):
    settings = get_settings()
    user = request_user(request)
    return JSONResponse(
        {
            "enabled": settings.beta_auth_enabled,
            "configured": settings.beta_auth_configured if settings.beta_auth_enabled else True,
            "authenticated": bool(user) if settings.beta_auth_enabled else True,
            "email": user,
            "owner": is_owner(request),
        },
        headers={"Cache-Control": "no-store"},
    )


@app.get("/share")
def share_entry():
    """Serve the share-link entry point; the frontend resolves its query params."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/debug-playback.html")
def debug_playback():
    """Serve the debug playback test page."""
    try:
        with open("debug-playback.html", "r") as f:
            return HTMLResponse(f.read())
    except FileNotFoundError:
        return HTMLResponse("Debug page not found", status_code=404)


@app.get("/health")
def health(request: Request):
    settings = get_settings()
    if settings.beta_auth_enabled and not request_user(request):
        return {"status": "ok", "auth": "required"}
    return {
        "status": "ok",
        "mode": "browser-first",
        "stream_delivery": settings.stream_delivery_mode,
        "backend_origin": settings.backend_origin,
        "frontend_origin": settings.dev_music_frontend_origin,
        "mcp_origin": settings.dev_music_mcp_origin,
        "caption_localizer_url": settings.caption_localizer_url,
        "local_integration": (
            "disabled-on-vercel" if settings.vercel else "openclaw-cli-optional"
        ),
        "spotify_import": "configured" if SpotifyImportService.is_configured() else "missing-client-id",
        "apple_music": "configured" if settings.apple_music_configured else "missing-developer-token",
        "apple_music_import": "xml-or-json",
        "chromecast": "default-media-receiver",
    }


@app.get("/api/apple-music/config")
def apple_music_config(request: Request):
    """Return the public MusicKit client configuration for this origin."""
    settings = get_settings()
    payload = {
        "configured": settings.apple_music_configured,
        "importAvailable": settings.apple_music_import_available and is_owner(request),
        "storefront": settings.apple_music_storefront,
        "app": {
            "name": settings.apple_music_app_name,
            "build": settings.apple_music_app_build,
        },
    }
    if settings.apple_music_configured:
        # MusicKit on the Web requires the developer token in the browser. The
        # token should carry Apple's recommended origin claim so it is not useful
        # from any origin other than this app.
        payload["developerToken"] = settings.apple_music_developer_token
    return JSONResponse(content=payload, headers={"Cache-Control": "no-store"})


@app.get("/api/import/apple-music/library")
def apple_music_persistent_library(request: Request):
    """Return the configured read-only Apple Music export in normalized form."""
    settings = get_settings()
    require_owner(request)
    if not settings.apple_music_import_available or not settings.apple_music_import_path:
        raise HTTPException(status_code=404, detail="No persistent Apple Music export is configured")
    try:
        payload = AppleMusicImportService.load_export(settings.apple_music_import_path)
        return JSONResponse(content=payload, headers={"Cache-Control": "no-store"})
    except AppleMusicImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/import/apple-music/xml")
@limiter.limit("5 per minute")
async def apple_music_xml_import(request: Request):
    """Normalize a Music/iTunes XML library export into the fallback import shape."""
    require_owner(request)
    try:
        payload = await request.body()
        return AppleMusicImportService.parse_xml(payload)
    except AppleMusicImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/import/apple-music/preview")
@limiter.limit("20 per minute")
async def apple_music_album_preview(request: Request, body: AppleMusicImportAlbum):
    require_owner(request)
    try:
        return (
            await ImportPreviewService.build_preview(
                provider="apple_music",
                playlist={
                    "provider": "apple_music",
                    "id": body.id,
                    "name": body.name,
                    "track_count": body.track_count or len(body.tracks),
                    "owner": body.artist,
                    "thumbnail": body.artwork_url,
                    "provider_url": body.provider_url,
                },
                imported_tracks=body.tracks,
            )
        ).model_dump()
    except Exception as exc:
        logger.error("apple_music_album_preview_failed", album_id=body.id, error=str(exc))
        fail_with_http_error(exc)


@app.post("/api/import/apple-music/playback")
@limiter.limit("30 per minute")
async def apple_music_track_playback(request: Request, body: ImportedPlaylistTrack):
    require_owner(request)
    try:
        return (await ImportPreviewService.resolve_track_playback(body)).model_dump()
    except Exception as exc:
        logger.error("apple_music_track_playback_failed", error=str(exc))
        fail_with_http_error(exc)


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


@app.get("/api/import/spotify/liked-tracks")
@limiter.limit("20 per minute")
async def spotify_liked_tracks(
    request: Request,
    limit: int = Query(50, ge=1, le=50, description="Number of liked tracks to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    try:
        logger.info("spotify_liked_tracks_listed", limit=limit, offset=offset)
        payload = await SpotifyImportService.liked_tracks_preview(request, limit=limit, offset=offset)
        return payload.model_dump()
    except Exception as exc:
        logger.error("spotify_liked_tracks_failed", error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/import/spotify/liked-tracks/contains")
@limiter.limit("60 per minute")
async def spotify_liked_track_contains(
    request: Request,
    spotify_id: str = Query(..., min_length=1, max_length=64, description="Spotify track id to check"),
):
    try:
        saved = await SpotifyImportService.is_track_saved(request, spotify_id)
        return {"saved": saved}
    except Exception as exc:
        logger.error("spotify_track_contains_failed", error=str(exc))
        fail_with_http_error(exc)


@app.post("/api/import/spotify/liked-tracks")
@limiter.limit("30 per minute")
async def spotify_save_liked_track(request: Request, body: SpotifySaveTrackRequest):
    try:
        track_id = await SpotifyImportService.save_track(
            request,
            title=body.title,
            artist=body.artist,
            album=body.album,
            spotify_id=body.spotify_id,
        )
        logger.info("spotify_track_saved", spotify_track_id=track_id)
        return {"saved": True, "spotify_id": track_id}
    except Exception as exc:
        logger.error("spotify_track_save_failed", error=str(exc))
        fail_with_http_error(exc)


@app.post("/api/import/spotify/playback")
@limiter.limit("30 per minute")
async def spotify_track_playback(request: Request, body: ImportedPlaylistTrack):
    try:
        logger.info("spotify_track_playback_requested", title=body.source.title)
        return (await SpotifyImportService.resolve_track_playback(body)).model_dump()
    except Exception as exc:
        logger.error("spotify_track_playback_failed", error=str(exc))
        fail_with_http_error(exc)


@app.post("/api/import/spotify/disconnect")
def spotify_disconnect():
    return SpotifyImportService.clear_connection()


@app.get("/api/search")
@app.get("/search")
@limiter.limit("60 per minute")
async def search_song(
    request: Request,
    query: str = Query(..., min_length=1, max_length=500, description="Resolved song query"),
    limit: int = Query(1, ge=1, le=5, description="Number of YouTube candidates to resolve"),
    target_duration: Optional[int] = Query(
        default=None, ge=1, le=7200, description="Expected duration in seconds; candidates outside ±5s are penalised"
    ),
    expected_artist: Optional[str] = Query(default=None, max_length=200),
    expected_title: Optional[str] = Query(default=None, max_length=300),
    expected_album: Optional[str] = Query(default=None, max_length=300),
    expected_year: Optional[int] = Query(default=None, ge=1900, le=2100),
):
    try:
        logger.info(
            "search_requested",
            query_length=len(query),
            limit=limit,
            target_duration=target_duration,
            has_expected=bool(expected_title or expected_artist),
        )
        search_results = await run_in_threadpool(
            MusicService.search,
            query,
            limit,
            target_duration,
            expected_artist=expected_artist,
            expected_title=expected_title,
            expected_album=expected_album,
            expected_year=expected_year,
        )
        results = [result.model_dump() for result in search_results]
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
        spotify_token = request.cookies.get(SpotifyImportService._TOKEN_COOKIE)
        if not spotify_token:
            spotify_token = await SpotifyImportService.get_client_credentials_token()
        logger.info(
            "autocomplete_requested",
            query_length=len(query),
            limit=limit,
            spotify=bool(spotify_token),
        )
        suggestions = await MetadataService.autocomplete(
            query, limit=limit, spotify_token=spotify_token
        )
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
    locale: Optional[str] = Query(
        default=None,
        max_length=35,
        description="Target locale (e.g. 'es-MX', 'fr-CA', 'ar') to localize lyric lines into",
    ),
):
    try:
        logger.info(
            "lyrics_requested", title=title, artist=artist, has_album=bool(album), locale=locale
        )
        payload = LyricsService.get_localized_lyrics(
            title=title,
            artist=artist,
            album=album,
            duration=duration,
            locale=locale,
        ).model_dump()
        return JSONResponse(content=payload, headers={"Cache-Control": "public, max-age=3600"})
    except Exception as exc:
        logger.error("lyrics_failed", title=title, artist=artist, error=str(exc))
        fail_with_http_error(exc)


@app.post("/api/lyrics/localize-window")
@app.post("/lyrics/localize-window")
@limiter.limit("120 per minute")
def localize_lyrics_window(request: Request, body: LocalizeWindowRequest):
    """Localize a just-in-time window of lyric lines around the playhead.

    Returns ``{"localized": {index: text}}`` for the requested indices, served
    from cache where possible. Used by the frontend to translate upcoming lines
    as a track plays rather than the whole song up front.
    """
    try:
        mapping = LyricsService.localize_window(
            title=body.title,
            artist=body.artist,
            album=body.album,
            duration=body.duration,
            locale=body.locale,
            items=[
                (line.index, line.text, line.start_time_ms, line.end_time_ms)
                for line in body.lines
            ],
            section=body.section,
            bpm=body.bpm,
            mood=body.mood,
            preserve_singability=body.preserve_singability,
            preserve_repetition=body.preserve_repetition,
        )
        payload = {"localized": {str(index): text for index, text in mapping.items()}}
        return JSONResponse(content=payload)
    except Exception as exc:
        logger.error("lyrics_localize_window_failed", title=body.title, error=str(exc))
        fail_with_http_error(exc)


@app.post("/api/visuals/llm-analyze")
@app.post("/visuals/llm-analyze")
@limiter.limit("120 per minute")
def analyze_lyric_visuals(request: Request, body: LyricVisualAnalysisRequest):
    """Return deterministic visual direction for one active lyric line."""
    return JSONResponse(content=LyricVisualService.analyze_lyric(body))


@app.post("/api/vocals/translated")
@app.post("/vocals/translated")
@limiter.limit("30 per minute")
def create_translated_vocals(request: Request, body: TranslatedVocalRequest):
    """Create a timed translated-vocal segment plan using permitted voices only."""
    try:
        payload = TranslatedVocalsService.create(body)
        return JSONResponse(content=payload)
    except TranslatedVocalsPolicyError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except TranslatedVocalsServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("translated_vocals_failed", title=body.title, error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/vocals/config")
@app.get("/vocals/config")
def translated_vocals_config():
    """Report non-secret translated-vocal synthesis readiness."""
    return JSONResponse(content=TranslatedVocalsService.config_status())


@app.get("/api/vocals/audio/{filename}")
@app.get("/vocals/audio/{filename}")
def translated_vocals_audio(filename: str):
    """Serve generated translated-vocal audio segments."""
    try:
        path = TranslatedVocalsService.audio_path(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Audio segment not found") from exc
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio segment not found")
    media_type = "audio/mpeg" if path.suffix == ".mp3" else "audio/wav"
    return FileResponse(path, media_type=media_type)


@app.get("/api/lyrics/transcribe")
@app.get("/lyrics/transcribe")
@limiter.limit("30 per minute")
def transcribe_lyrics(
    request: Request,
    title: str = Query(..., min_length=1, max_length=500, description="Track title"),
    artist: str = Query(..., min_length=1, max_length=500, description="Track artist"),
    url: str = Query(..., min_length=1, max_length=2000, description="Track webpage URL"),
):
    """Transcribe a track's audio when no LRC lyrics exist (best-effort fallback).

    First call starts a background transcription job and returns ``pending``;
    poll until ``status`` is ``ready`` (with timed ``lines``) or ``error``.
    """
    try:
        webpage_url = validate_stream_url(url)
        logger.info("lyrics_transcribe_requested", title=title, artist=artist)
        job = LiveTranscriptionService.get_or_start(title=title, artist=artist, webpage_url=webpage_url)
        payload = {
            "status": job["status"],
            "error": job["error"],
            "lines": [line.model_dump() for line in job["lines"]],
        }
        return JSONResponse(content=payload)
    except Exception as exc:
        logger.error("lyrics_transcribe_failed", title=title, error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/lyrics/transcribe/events")
@app.get("/lyrics/transcribe/events")
@limiter.limit("30 per minute")
async def transcribe_lyrics_events(
    request: Request,
    title: str = Query(..., min_length=1, max_length=500, description="Track title"),
    artist: str = Query(..., min_length=1, max_length=500, description="Track artist"),
    url: str = Query(..., min_length=1, max_length=2000, description="Track webpage URL"),
    locale: Optional[str] = Query(default=None, max_length=35),
    last_event_id: Optional[str] = Header(default=None, alias="Last-Event-ID"),
):
    """Proxy progressive transcription and translation events to the browser."""
    settings = get_settings()
    if not settings.lyrics_transcription_enabled:
        raise HTTPException(status_code=404, detail="Transcription is disabled")
    webpage_url = validate_stream_url(url)
    try:
        session = await LiveTranscriptionService.start_session(
            title=title,
            artist=artist,
            webpage_url=webpage_url,
            target_locale=locale,
        )
    except RuntimeError as exc:
        logger.error("lyrics_transcribe_session_failed", title=title, error=str(exc))
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    after = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0
    logger.info(
        "lyrics_transcribe_stream_started",
        title=title,
        session_id=session["session_id"],
        locale=locale,
        cached=session.get("cached", False),
    )
    return StreamingResponse(
        LiveTranscriptionService.stream_events(session["session_id"], after=after),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/metadata")
@app.get("/metadata")
@limiter.limit("60 per minute")
def get_metadata(
    request: Request,
    url: str = Query(..., min_length=1, max_length=2000, description="Track webpage URL"),
):
    try:
        logger.info("metadata_requested", url_length=len(url))
        webpage_url = validate_stream_url(url)
        payload = MusicService.get_metadata(webpage_url).model_dump()
        return JSONResponse(content=payload, headers={"Cache-Control": "public, max-age=300"})
    except Exception as exc:
        logger.error("metadata_failed", url_length=len(url), error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/video/search")
@limiter.limit("30 per minute")
async def search_video(
    request: Request,
    title: str = Query(..., min_length=1, max_length=500),
    artist: Optional[str] = Query(default=None, max_length=300),
    kind: str = Query(default="music_video", pattern="^(music_video|shorts|live)$"),
    limit: int = Query(default=1, ge=1, le=5),
):
    try:
        logger.info(
            "video_search_requested",
            title=title,
            artist=artist,
            kind=kind,
            limit=limit,
        )
        results = await run_in_threadpool(
            VideoService.search,
            title,
            artist,
            kind,
            limit,
        )
        return JSONResponse(
            content=[result.model_dump() for result in results],
            headers={"Cache-Control": "public, max-age=300"},
        )
    except Exception as exc:
        logger.error("video_search_failed", title=title, kind=kind, error=str(exc))
        fail_with_http_error(exc)


# ---- Phase · Field shader distribution API proxy ----
# Fronts the standalone phase-field-api worker so the browser talks to this
# service same-origin (no CORS / mixed-content) and never sees the upstream URL.
_phase_field_client: httpx.AsyncClient | None = None
_SHADER_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_SHADER_FORMATS = {"wgsl", "glsl", "msl", "spirv", "metal"}


def _get_phase_field_client() -> httpx.AsyncClient:
    global _phase_field_client
    if _phase_field_client is None or _phase_field_client.is_closed:
        _phase_field_client = httpx.AsyncClient(
            verify=certifi.where(),
            timeout=10.0,
            headers={"User-Agent": "dev-music-service/0.4 (phase-field proxy)"},
        )
    return _phase_field_client


@app.get("/api/shaders")
@limiter.limit("60 per minute")
async def list_shaders(
    request: Request,
    preset: Optional[str] = Query(default=None, max_length=32),
    bpm_min: Optional[int] = Query(default=None, ge=0, le=400),
    bpm_max: Optional[int] = Query(default=None, ge=0, le=400),
):
    """Proxy the Phase · Field shader catalogue (metadata + WGSL source)."""
    base = get_settings().phase_field_api_base_url.rstrip("/")
    params = {
        key: value
        for key, value in (("preset", preset), ("bpm_min", bpm_min), ("bpm_max", bpm_max))
        if value is not None
    }
    try:
        resp = await _get_phase_field_client().get(f"{base}/v1/shaders", params=params)
    except httpx.HTTPError as exc:
        logger.warning("phase_field_unreachable", endpoint="shaders", error=str(exc))
        raise HTTPException(status_code=503, detail="Phase · Field API unreachable") from exc
    return JSONResponse(
        content=resp.json(),
        status_code=resp.status_code,
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/api/shaders/{shader_id}/source")
@limiter.limit("120 per minute")
async def get_shader_source(
    request: Request,
    shader_id: str,
    format: str = Query(default="glsl"),
):
    """Proxy a single shader's compiled source in the requested format."""
    if not _SHADER_ID_RE.match(shader_id):
        raise HTTPException(status_code=400, detail="Invalid shader id")
    fmt = format.strip().lower()
    if fmt not in _SHADER_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported shader format")
    base = get_settings().phase_field_api_base_url.rstrip("/")
    try:
        resp = await _get_phase_field_client().get(
            f"{base}/v1/shaders/{shader_id}/source", params={"format": fmt}
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "phase_field_unreachable", endpoint="source", shader_id=shader_id, error=str(exc)
        )
        raise HTTPException(status_code=503, detail="Phase · Field API unreachable") from exc
    headers = {"Cache-Control": "public, max-age=300"}
    served_format = resp.headers.get("X-Shader-Format")
    if served_format:
        headers["X-Shader-Format"] = served_format
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "text/plain"),
        headers=headers,
    )


@app.get("/api/stream")
@app.get("/stream")
@limiter.limit("30 per minute")
async def stream_song(
    request: Request,
    url: str = Query(..., min_length=1, max_length=2000, description="Track webpage URL"),
    range_header: Optional[str] = Header(None, alias="Range"),
):
    try:
        logger.info("stream_requested", url_length=len(url))
        webpage_url = validate_stream_url(url)
        direct_url, req_headers = await run_in_threadpool(
            MusicService.get_stream_source,
            webpage_url,
        )
        direct_url = validate_stream_url(direct_url)
        settings = get_settings()

        if settings.stream_delivery_mode == "redirect":
            logger.info("stream_redirect_started")
            return RedirectResponse(
                direct_url,
                status_code=302,
                headers={
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": settings.dev_music_frontend_origin,
                    "Access-Control-Allow-Headers": "Range, Content-Type",
                },
            )

        headers_copy = dict(req_headers)
        if range_header:
            headers_copy["Range"] = range_header

        # Open the upstream stream up front so we can mirror its real status code
        # (200 or 206 Partial Content) and range/length headers — required for the
        # browser <audio> element to know the duration, seek, and keep playing
        # past the first buffered chunk. Read timeout is disabled so backpressure
        # pauses (full audio buffer) don't trip a timeout mid-track.
        client = httpx.AsyncClient(
            verify=certifi.where(),
            timeout=httpx.Timeout(30.0, read=None),
        )
        fallback_used = False
        try:
            upstream = await open_validated_stream(client, direct_url, headers_copy)
            # YouTube occasionally exposes an audio-only URL that yt-dlp can
            # resolve but its CDN rejects (usually 403/SABR client drift). The
            # progressive MP4 resolver uses a different client/format strategy
            # and remains playable by an <audio> element. Retry only explicit
            # source rejections, then remember the verified replacement so
            # subsequent browser range requests do not hit the bad URL again.
            if upstream.status_code in {401, 403, 410}:
                rejected_status = upstream.status_code
                await upstream.aclose()
                logger.warning(
                    "stream_source_rejected_retrying_progressive",
                    upstream_status=rejected_status,
                )
                fallback_url, fallback_headers = await run_in_threadpool(
                    VideoService.get_video_stream_source,
                    webpage_url,
                )
                fallback_url = validate_stream_url(fallback_url)
                headers_copy = dict(fallback_headers)
                if range_header:
                    headers_copy["Range"] = range_header
                upstream = await open_validated_stream(client, fallback_url, headers_copy)
                fallback_used = upstream.status_code < 400
                if fallback_used:
                    MusicService.remember_stream_source(
                        webpage_url,
                        fallback_url,
                        fallback_headers,
                    )
        except Exception:
            await client.aclose()
            raise

        async def stream_audio() -> AsyncGenerator[bytes, None]:
            try:
                async for chunk in upstream.aiter_bytes(chunk_size=65536):
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        # Mirror upstream status + the headers a media element needs; let
        # media_type drive Content-Type so it isn't duplicated.
        media_type = upstream.headers.get("content-type", "audio/mp4")
        if fallback_used and media_type.startswith("video/"):
            media_type = "audio/mp4"
        passthrough = {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": settings.dev_music_frontend_origin,
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Accept-Ranges": upstream.headers.get("accept-ranges", "bytes"),
        }
        for header_name in ("content-length", "content-range"):
            if header_name in upstream.headers:
                passthrough[header_name] = upstream.headers[header_name]

        logger.info(
            "stream_started",
            content_type=media_type,
            upstream_status=upstream.status_code,
            partial=upstream.status_code == 206,
            fallback_used=fallback_used,
        )
        return StreamingResponse(
            stream_audio(),
            status_code=upstream.status_code,
            media_type=media_type,
            headers=passthrough,
        )
    except Exception as exc:
        logger.error("stream_failed", url_length=len(url), error=str(exc))
        fail_with_http_error(exc)


@app.get("/api/video/stream")
@limiter.limit("30 per minute")
async def stream_video(
    request: Request,
    url: str = Query(..., min_length=1, max_length=2000, description="Video webpage URL"),
    range_header: Optional[str] = Header(None, alias="Range"),
):
    try:
        logger.info("video_stream_requested", url_length=len(url))
        webpage_url = validate_stream_url(url)
        direct_url, req_headers = await run_in_threadpool(
            VideoService.get_video_stream_source,
            webpage_url,
        )
        direct_url = validate_stream_url(direct_url)
        settings = get_settings()

        if settings.stream_delivery_mode == "redirect":
            logger.info("video_stream_redirect_started")
            return RedirectResponse(
                direct_url,
                status_code=302,
                headers={
                    "Cache-Control": "no-store",
                    "Access-Control-Allow-Origin": settings.dev_music_frontend_origin,
                    "Access-Control-Allow-Headers": "Range, Content-Type",
                },
            )

        headers_copy = dict(req_headers)
        if range_header:
            headers_copy["Range"] = range_header

        client = httpx.AsyncClient(
            verify=certifi.where(),
            timeout=httpx.Timeout(30.0, read=None),
        )
        try:
            upstream = await open_validated_stream(client, direct_url, headers_copy)
        except Exception:
            await client.aclose()
            raise

        async def stream_video_bytes() -> AsyncGenerator[bytes, None]:
            try:
                async for chunk in upstream.aiter_bytes(chunk_size=65536):
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        media_type = upstream.headers.get("content-type", "video/mp4")
        passthrough = {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": settings.dev_music_frontend_origin,
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Accept-Ranges": upstream.headers.get("accept-ranges", "bytes"),
        }
        for header_name in ("content-length", "content-range"):
            if header_name in upstream.headers:
                passthrough[header_name] = upstream.headers[header_name]

        logger.info(
            "video_stream_started",
            content_type=media_type,
            upstream_status=upstream.status_code,
            partial=upstream.status_code == 206,
        )
        return StreamingResponse(
            stream_video_bytes(),
            status_code=upstream.status_code,
            media_type=media_type,
            headers=passthrough,
        )
    except Exception as exc:
        logger.error("video_stream_failed", url_length=len(url), error=str(exc))
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
        webpage_url = validate_stream_url(body.url)
        return MusicService.build_browser_state(
            webpage_url,
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
    validate_control_auth(request)
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
    validate_control_auth(request)
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
    validate_control_auth(request)
    try:
        logger.info("local_resume_requested")
        return LocalPlaybackService.resume().model_dump()
    except Exception as exc:
        logger.error("local_resume_failed", error=str(exc))
        fail_with_http_error(exc)


# ── Focus / ADHD mode routes ──────────────────────────────────────────────────

@app.get("/api/focus/profile")
def get_focus_profile(request: Request):
    """Return the current focus profile (BPM range, instrumentalness threshold, etc.)"""
    return FocusProfile.load(request_user(request))


@app.post("/api/focus/profile")
@limiter.limit("30 per minute")
def update_focus_profile(request: Request, profile: dict):
    """Update and persist the focus profile."""
    try:
        return FocusProfile.save(profile, request_user(request))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/focus/profile/reset")
def reset_focus_profile(request: Request):
    """Reset to defaults."""
    return FocusProfile.reset(request_user(request))


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
        profile = FocusProfile.load(request_user(request))
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
        profile = FocusProfile.load(request_user(request))
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
        profile = FocusProfile.load(request_user(request))
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
def mcp_status(request: Request):
    validate_control_auth(request)
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
    validate_control_auth(request)
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
    validate_control_auth(request)
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
