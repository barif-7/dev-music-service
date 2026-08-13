from typing import Dict, List, Optional

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
    spotify_id: Optional[str] = None
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


class VideoSearchResult(BaseModel):
    title: str
    webpage_url: str
    video_stream_url: str
    duration: int = Field(default=0, description="Video duration in seconds")
    thumbnail: Optional[str] = None
    channel: Optional[str] = None
    kind: str = "music_video"
    width: Optional[int] = None
    height: Optional[int] = None


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
    release_year: Optional[int] = None
    artwork_url: Optional[str] = None
    provider_url: Optional[str] = None
    track_number: Optional[int] = None
    disc_number: Optional[int] = None
    plays: int = 0
    skips: int = 0
    loved: bool = False
    explicit: bool = False
    streaming: bool = False
    genre: Optional[str] = None
    last_played_at: Optional[str] = None
    date_added_at: Optional[str] = None


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


class AppleMusicImportAlbum(BaseModel):
    provider: str = "apple_music"
    id: str
    name: str
    artist: str
    year: Optional[int] = None
    genre: Optional[str] = None
    track_count: int = 0
    duration_ms: int = 0
    plays: int = 0
    skips: int = 0
    loved: bool = False
    explicit: bool = False
    streaming: bool = False
    artwork_url: Optional[str] = None
    provider_url: Optional[str] = None
    tracks: List[ImportedTrack] = Field(default_factory=list)


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


class SpotifySaveTrackRequest(BaseModel):
    spotify_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9]+$",
    )
    title: str = Field(min_length=1, max_length=300)
    artist: Optional[str] = Field(default=None, max_length=300)
    album: Optional[str] = Field(default=None, max_length=300)


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
    localized_text: Optional[str] = Field(
        default=None, description="Line translated into the requested target locale"
    )
    localization_quality: Optional[Dict[str, object]] = Field(
        default=None,
        description="Optional quality metadata from the lyrics localization service",
    )


class LocalizeWindowLine(BaseModel):
    index: int = Field(ge=0, description="Stable line index within the track's lyric lines")
    text: str = Field(min_length=1, max_length=1000)
    start_time_ms: Optional[int] = Field(default=None, ge=0)
    end_time_ms: Optional[int] = Field(default=None, ge=0)


class LocalizeWindowRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    artist: str = Field(min_length=1, max_length=500)
    album: Optional[str] = Field(default=None, max_length=500)
    duration: Optional[int] = Field(default=None, ge=0)
    locale: str = Field(min_length=1, max_length=35)
    bpm: Optional[int] = Field(default=None, ge=1, le=400)
    mood: List[str] = Field(default_factory=list, max_length=12)
    section: Optional[str] = Field(default=None, max_length=100)
    preserve_singability: bool = True
    preserve_repetition: bool = True
    lines: List[LocalizeWindowLine] = Field(
        default_factory=list,
        max_length=200,
        description="Lines (index + source text) to localize just-in-time. Carrying "
        "text lets transcribed tracks be localized too, not just LRCLIB ones.",
    )


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
    target_locale: Optional[str] = Field(
        default=None, description="Target locale the lines were localized into, if any"
    )
