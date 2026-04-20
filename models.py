from pydantic import BaseModel, Field


class AutocompleteSuggestion(BaseModel):
    title: str
    query: str
    artist: str | None = None
    album: str | None = None
    thumbnail: str | None = None
    release_year: int | None = None
    duration: int = Field(default=0, description="Track duration in seconds")
    confidence: int = Field(default=0, description="Metadata match confidence from 0 to 100")
    source: str = "musicbrainz"
    recording_mbid: str | None = None
    release_mbid: str | None = None


class SongSearchResult(BaseModel):
    title: str
    webpage_url: str
    stream_url: str
    duration: int = Field(default=0, description="Track duration in seconds")
    album: str | None = None
    artist: str | None = None
    thumbnail: str | None = None
    release_year: int | None = None


class BrowserPlaybackState(BaseModel):
    mode: str = "browser"
    title: str
    duration: int = 0
    webpage_url: str
    stream_url: str
    album: str | None = None
    artist: str | None = None
    thumbnail: str | None = None
    release_year: int | None = None


class LocalPlaybackState(BaseModel):
    mode: str = "local"
    title: str
    duration: int = 0
    webpage_url: str
    pid: int
    integration: str = "openclaw-cli"


class PlaybackStatus(BaseModel):
    playing: bool
    mode: str
    message: str | None = None
    pid: int | None = None
