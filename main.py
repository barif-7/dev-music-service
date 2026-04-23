import os
from typing import AsyncGenerator, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel

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
        "stream_delivery": "proxy",
        "local_integration": "disabled-on-vercel" if os.getenv("VERCEL") else "openclaw-cli-optional",
        "spotify_import": "configured" if SpotifyImportService.is_configured() else "missing-client-id",
    }


@app.get("/api/import/spotify/start")
def spotify_start(request: Request):
    try:
        return SpotifyImportService.start_auth(request)
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/import/spotify/callback")
async def spotify_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    try:
        return await SpotifyImportService.callback(request, code, state, error)
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/import/spotify/status")
def spotify_status(request: Request):
    return {
        "configured": SpotifyImportService.is_configured(),
        "connected": SpotifyImportService.is_connected(request),
    }


@app.get("/api/import/spotify/playlists")
async def spotify_playlists(
    request: Request,
    limit: int = Query(20, ge=1, le=50, description="Number of playlists to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    try:
        playlists = await SpotifyImportService.list_playlists(request, limit=limit, offset=offset)
        return [playlist.model_dump() for playlist in playlists]
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/import/spotify/playlists/{playlist_id}/preview")
async def spotify_playlist_preview(
    playlist_id: str,
    request: Request,
    limit: int = Query(25, ge=1, le=50, description="Number of tracks to import and match"),
    offset: int = Query(0, ge=0, description="Pagination offset into the playlist"),
):
    try:
        return (await SpotifyImportService.preview_playlist(request, playlist_id, limit=limit, offset=offset)).model_dump()
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
        results = [result.model_dump() for result in MusicService.search(query, limit=limit)]
        return JSONResponse(content=results, headers={"Cache-Control": "public, max-age=300"})
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/autocomplete")
async def autocomplete_song(
    query: str = Query(..., description="Song title, artist, or combined metadata query"),
    limit: int = Query(6, ge=1, le=10, description="Number of metadata suggestions to return"),
    fields: Optional[str] = Query(None, description="Comma-separated fields to include (omit for all)"),
):
    try:
        suggestions = await MetadataService.autocomplete(query, limit=limit)
        if fields:
            field_set = set(fields.split(","))
            data = [{k: v for k, v in s.model_dump().items() if k in field_set} for s in suggestions]
        else:
            data = [s.model_dump() for s in suggestions]
        return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=300"})
    except Exception as exc:
        fail_with_http_error(exc)


@app.get("/api/stream")
@app.get("/stream")
async def stream_song(
    url: str = Query(..., description="Track webpage URL"),
    range_header: Optional[str] = Header(None, alias="Range"),
):
    try:
        import asyncio
        
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
def browser_playback(body: PlaybackRequest):
    try:
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
