from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse
from services.ytdlp_service import YTDLPService

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok", "message": "Music API is running."}


@app.get("/search")
def search_song(query: str = Query(..., description="Song name or YouTube query")):
    try:
        results = YTDLPService.search(query)
        return results
    except Exception as e:
        print("Search error:", e)  # Debug output
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/stream")
def stream_song(url: str = Query(..., description="Direct YouTube audio URL")):
    """
    Stream a YouTube song as MP3.
    """
    try:
        audio_pipe = YTDLPService.stream_audio(url)
        return StreamingResponse(audio_pipe, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming failed: {str(e)}")


@app.get("/play")
def play_song(query: str = Query(..., description="Song name or YouTube query")):
    try:
        return YTDLPService.play(query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Playback failed: {str(e)}")
