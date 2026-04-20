from pydantic import BaseModel, Field


class AutocompleteSuggestion(BaseModel):
    title: str
    query: str
    artist: str | None = None
    album: str | None = None
    thumbnail: str | None = None
    artwork_source: str | None = None
    artwork_confidence: str | None = None
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
    artwork_source: str | None = None
    artwork_confidence: str | None = None
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
    artwork_source: str | None = None
    artwork_confidence: str | None = None
    release_year: int | None = None


class ProviderPlaylist(BaseModel):
    provider: str
    id: str
    name: str
    track_count: int = 0
    owner: str | None = None
    thumbnail: str | None = None
    provider_url: str | None = None


class ImportedTrack(BaseModel):
    provider: str
    provider_track_id: str | None = None
    provider_playlist_id: str
    title: str
    artist_names: list[str]
    album: str | None = None
    duration_ms: int = 0
    isrc: str | None = None
    release_date: str | None = None
    artwork_url: str | None = None
    provider_url: str | None = None


class MusicBrainzTrackMatch(BaseModel):
    recording_mbid: str | None = None
    release_mbid: str | None = None
    release_group_mbid: str | None = None
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    release_year: int | None = None
    confidence: int = 0
    match_reason: str = "unmatched"
    artwork_url: str | None = None


class ImportedPlaylistTrack(BaseModel):
    source: ImportedTrack
    musicbrainz: MusicBrainzTrackMatch


class ImportedPlaylistPreview(BaseModel):
    provider: str
    playlist: ProviderPlaylist
    tracks: list[ImportedPlaylistTrack]
    matched_count: int
    low_confidence_count: int
    unmatched_count: int


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
