from typing import List, Optional

from pydantic import BaseModel, Field


class AutocompleteSuggestion(BaseModel):
    title: str
    query: str
    artist: Optional[str] = None
    album: Optional[str] = None
    thumbnail: Optional[str] = None
    artwork_source: Optional[str] = None
    artwork_confidence: Optional[str] = None
    release_year: Optional[int] = None
    duration: int = Field(default=0, description="Track duration in seconds")
    confidence: int = Field(default=0, description="Metadata match confidence from 0 to 100")
    source: str = "musicbrainz"
    recording_mbid: Optional[str] = None
    release_mbid: Optional[str] = None


class SongSearchResult(BaseModel):
    title: str
    webpage_url: str
    stream_url: str
    duration: int = Field(default=0, description="Track duration in seconds")
    album: Optional[str] = None
    artist: Optional[str] = None
    thumbnail: Optional[str] = None
    artwork_source: Optional[str] = None
    artwork_confidence: Optional[str] = None
    release_year: Optional[int] = None


class TrackMetadata(BaseModel):
    title: str
    webpage_url: str
    stream_url: str
    duration: int = Field(default=0, description="Track duration in seconds")
    album: Optional[str] = None
    artist: Optional[str] = None
    thumbnail: Optional[str] = None
    artwork_source: Optional[str] = None
    artwork_confidence: Optional[str] = None
    release_year: Optional[int] = None
    source: str = "youtube"


class BrowserPlaybackState(BaseModel):
    mode: str = "browser"
    title: str
    duration: int = 0
    webpage_url: str
    stream_url: str
    album: Optional[str] = None
    artist: Optional[str] = None
    thumbnail: Optional[str] = None
    artwork_source: Optional[str] = None
    artwork_confidence: Optional[str] = None
    release_year: Optional[int] = None


class ProviderPlaylist(BaseModel):
    provider: str
    id: str
    name: str
    track_count: int = 0
    owner: Optional[str] = None
    thumbnail: Optional[str] = None
    provider_url: Optional[str] = None


class ImportedTrack(BaseModel):
    provider: str
    provider_track_id: Optional[str] = None
    provider_playlist_id: str
    title: str
    artist_names: List[str]
    album: Optional[str] = None
    duration_ms: int = 0
    isrc: Optional[str] = None
    release_date: Optional[str] = None
    artwork_url: Optional[str] = None
    provider_url: Optional[str] = None


class MusicBrainzTrackMatch(BaseModel):
    recording_mbid: Optional[str] = None
    release_mbid: Optional[str] = None
    release_group_mbid: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    release_year: Optional[int] = None
    confidence: int = 0
    match_reason: str = "unmatched"
    artwork_url: Optional[str] = None


class ImportedPlaylistTrack(BaseModel):
    source: ImportedTrack
    musicbrainz: MusicBrainzTrackMatch


class ImportedPlaylistPreview(BaseModel):
    provider: str
    playlist: ProviderPlaylist
    tracks: List[ImportedPlaylistTrack]
    matched_count: int
    low_confidence_count: int
    unmatched_count: int


class SpotifyLikedTracksPreview(BaseModel):
    provider: str = "spotify"
    title: str = "Liked songs"
    total: int = 0
    limit: int = 0
    offset: int = 0
    tracks: List[ImportedPlaylistTrack] = Field(default_factory=list)
    matched_count: int = 0
    low_confidence_count: int = 0
    unmatched_count: int = 0


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
    message: Optional[str] = None
    pid: Optional[int] = None


class LyricsLine(BaseModel):
    text: str
    start_time_ms: Optional[int] = Field(default=None, description="Line start time in milliseconds")
    end_time_ms: Optional[int] = Field(default=None, description="Line end time in milliseconds")


class LyricsResponse(BaseModel):
    provider: str = "lrclib"
    title: str
    artist: str
    album: Optional[str] = None
    duration: Optional[int] = Field(default=None, description="Track duration in seconds")
    instrumental: bool = False
    synced: bool = False
    plain_lyrics: Optional[str] = None
    synced_lyrics: Optional[str] = None
    lines: List[LyricsLine] = Field(default_factory=list)
