import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from frontend import INDEX_HTML
from services.local_playback_service import LocalPlaybackService
from services.music_service import MusicService, MusicServiceError

app = FastAPI()


def fail_with_http_error(exc: Exception) -> None:
    if isinstance(exc, MusicServiceError):
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
    }


@app.get("/api/search")
@app.get("/search")
def search_song(query: str = Query(..., description="Song name or YouTube query")):
    try:
        return [result.model_dump() for result in MusicService.search(query)]
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
):
    try:
        return MusicService.build_browser_state(url, title, duration).model_dump()
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
