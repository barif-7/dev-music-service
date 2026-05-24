"""Unit and integration tests for service layer."""
import pytest

from models import AutocompleteSuggestion, ImportedTrack, SongSearchResult
from services.focus_service import AudioFeatures, DEFAULT_PROFILE, FocusProfile
from services.focus_storage import KvFocusProfileStorageStub, LocalJsonFocusProfileStorage
from services.lyrics_service import LyricsService
from services.musicbrainz_matcher import MusicBrainzMatcher
from services.music_service import MusicService, MusicServiceError, SearchServiceError, StreamResolutionError
from services.metadata_service import MetadataService, MetadataServiceError


class TestMusicServiceSearch:
    """Tests for MusicService.search method."""

    def test_search_returns_results(self, sample_search_query, monkeypatch):
        """Search should return results for valid query."""
        monkeypatch.setattr(MusicService, "_search_entries", lambda query, limit, oversample=1: [
            {
                "title": "Fixture Song",
                "webpage_url": "https://youtube.com/watch?v=fixture",
                "duration": 180,
                "artist": "Fixture Artist",
                "thumbnail": "https://img.example/cover.jpg",
            }
        ][:limit])
        results = MusicService.search(sample_search_query, limit=1)
        
        assert isinstance(results, list)
        if results:
            result = results[0]
            assert isinstance(result, SongSearchResult)
            assert result.title
            assert result.webpage_url
            assert result.stream_url

    def test_search_respects_limit(self, sample_search_query, monkeypatch):
        """Search should respect limit parameter."""
        monkeypatch.setattr(MusicService, "_search_entries", lambda query, limit, oversample=1: [
            {"title": f"Fixture {idx}", "webpage_url": f"https://youtube.com/watch?v={idx}"}
            for idx in range(5)
        ][:limit])
        results = MusicService.search(sample_search_query, limit=3)
        
        assert len(results) <= 3

    def test_search_empty_query(self):
        """Search should handle empty query."""
        with pytest.raises(SearchServiceError):
            MusicService.search("", limit=1)

    def test_search_caching(self, sample_search_query, monkeypatch):
        """Search results should be cached."""
        MusicService._search_cache.clear()
        calls = {"count": 0}

        class FakeYoutubeDL:
            def __init__(self, opts):
                self.opts = opts

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def extract_info(self, query, download=False):
                calls["count"] += 1
                return {
                    "entries": [
                        {
                            "title": "Fixture",
                            "webpage_url": "https://youtube.com/watch?v=fixture",
                        }
                    ]
                }

        monkeypatch.setattr("services.music_service.yt_dlp.YoutubeDL", FakeYoutubeDL)
        results1 = MusicService.search(sample_search_query, limit=1)
        results2 = MusicService.search(sample_search_query, limit=1)

        assert len(results1) == len(results2)
        assert results1[0].title == results2[0].title
        assert calls["count"] == 1


class TestMusicServiceStream:
    """Tests for MusicService stream methods."""

    def test_get_stream_source(self, sample_youtube_url, monkeypatch):
        """get_stream_source should return URL and headers."""
        monkeypatch.setattr(
            MusicService,
            "_extract_audio_source",
            lambda url: ("https://rr1---sn.googlevideo.com/videoplayback", {"User-Agent": "fixture"}),
        )
        direct_url, headers = MusicService.get_stream_source(sample_youtube_url)
        
        assert isinstance(direct_url, str)
        assert direct_url.startswith("http")
        assert isinstance(headers, dict)

    def test_get_stream_source_invalid_url(self):
        """get_stream_source should error on invalid URL."""
        with pytest.raises(StreamResolutionError):
            MusicService.get_stream_source("invalid-url")

    def test_stream_caching(self, sample_youtube_url, monkeypatch):
        """Stream sources should be cached."""
        MusicService._stream_cache.clear()
        calls = {"count": 0}

        class FakeYoutubeDL:
            def __init__(self, opts):
                self.opts = opts

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def extract_info(self, url, download=False):
                calls["count"] += 1
                return {
                    "url": "https://rr1---sn.googlevideo.com/videoplayback",
                    "http_headers": {"User-Agent": "fixture"},
                }

        monkeypatch.setattr("services.music_service.yt_dlp.YoutubeDL", FakeYoutubeDL)
        url1, headers1 = MusicService.get_stream_source(sample_youtube_url)
        url2, headers2 = MusicService.get_stream_source(sample_youtube_url)

        assert url1 == url2
        assert headers1 == headers2
        assert calls["count"] == 1


class TestMusicServiceHelpers:
    """Tests for MusicService helper methods."""

    def test_normalize_query(self):
        """_normalize_query should normalize whitespace."""
        assert MusicService._normalize_query("  test   query  ") == "test query"
        assert MusicService._normalize_query("TEST") == "test"

    def test_extract_year_from_upload_date(self):
        """_extract_year should extract year from upload_date."""
        entry = {"upload_date": "20240115"}
        year = MusicService._extract_year(entry)
        assert year == 2024

    def test_extract_year_from_release_date(self):
        """_extract_year should extract year from release_date."""
        entry = {"release_date": "2023-06-15"}
        year = MusicService._extract_year(entry)
        assert year == 2023

    def test_extract_year_from_release_year(self):
        """_extract_year should use release_year if present."""
        entry = {"release_year": 2022}
        year = MusicService._extract_year(entry)
        assert year == 2022

    def test_album_from_entry(self):
        """_album_from_entry should extract album."""
        entry = {"album": "Test Album"}
        assert MusicService._album_from_entry(entry) == "Test Album"

    def test_album_from_playlist(self):
        """_album_from_entry should use playlist as fallback."""
        entry = {"playlist": "Test Playlist"}
        assert MusicService._album_from_entry(entry) == "Test Playlist"

    def test_album_missing(self):
        """_album_from_entry should return None if missing."""
        entry = {}
        assert MusicService._album_from_entry(entry) is None


class TestMetadataService:
    """Tests for MetadataService."""

    @pytest.mark.asyncio
    async def test_autocomplete_returns_suggestions(self, monkeypatch):
        """Autocomplete should return suggestions."""
        async def fake_recordings(query, limit):
            return [{
                "id": "rec-1",
                "title": "Blinding Lights",
                "length": 200000,
                "score": 95,
                "artist-credit": [{"name": "The Weeknd"}],
                "releases": [{"id": "rel-1", "title": "After Hours", "date": "2020-03-20"}],
            }]

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        MetadataService._autocomplete_cache.clear()
        suggestions = await MetadataService.autocomplete("blinding lights", limit=3)
        
        assert isinstance(suggestions, list)
        if suggestions:
            suggestion = suggestions[0]
            assert isinstance(suggestion, AutocompleteSuggestion)
            assert suggestion.title
            assert suggestion.query

    @pytest.mark.asyncio
    async def test_autocomplete_empty_query(self):
        """Autocomplete should return empty list for short query."""
        suggestions = await MetadataService.autocomplete("a", limit=3)
        
        assert suggestions == []

    @pytest.mark.asyncio
    async def test_autocomplete_caching(self, monkeypatch):
        """Autocomplete results should be cached."""
        MetadataService._autocomplete_cache.clear()
        calls = {"count": 0}

        async def fake_recordings(query, limit):
            calls["count"] += 1
            return [{"id": "rec-1", "title": "Test", "score": 90}]

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        results1 = await MetadataService.autocomplete("test", limit=3)
        results2 = await MetadataService.autocomplete("test", limit=3)

        assert len(results1) == len(results2)
        assert calls["count"] == 1

    def test_normalize(self):
        """_normalize should normalize strings."""
        assert MetadataService._normalize("  Test  ") == "test"
        assert MetadataService._normalize("TEST") == "test"

    def test_duration_seconds(self):
        """_duration_seconds should convert ms to seconds."""
        assert MetadataService._duration_seconds(180000) == 180
        # Python uses banker's rounding (round half to even)
        assert MetadataService._duration_seconds(180500) == 180  # Rounds to even
        assert MetadataService._duration_seconds(181500) == 182  # Rounds to even
        assert MetadataService._duration_seconds(None) == 0

    def test_release_year(self):
        """_release_year should extract year from date."""
        assert MetadataService._release_year("2024-01-15") == 2024
        assert MetadataService._release_year("2023") == 2023
        assert MetadataService._release_year(None) is None


class TestServiceErrorHandling:
    """Tests for service error handling."""

    def test_music_service_error_message(self):
        """MusicServiceError should have descriptive message."""
        error = MusicServiceError("Test error message")
        assert str(error) == "Test error message"

    def test_search_service_error_message(self):
        """SearchServiceError should have descriptive message."""
        error = SearchServiceError("Search failed")
        assert str(error) == "Search failed"

    def test_stream_resolution_error_message(self):
        """StreamResolutionError should have descriptive message."""
        error = StreamResolutionError("Could not resolve stream")
        assert str(error) == "Could not resolve stream"

    def test_metadata_service_error_message(self):
        """MetadataServiceError should have descriptive message."""
        error = MetadataServiceError("Metadata lookup failed")
        assert str(error) == "Metadata lookup failed"


class TestMusicBrainzMatcher:
    """Tests for MusicBrainz matching."""

    @pytest.mark.asyncio
    async def test_match_track_by_isrc(self, monkeypatch):
        """Should match tracks by ISRC."""
        MusicBrainzMatcher._match_cache.clear()
        track = ImportedTrack(
            provider="spotify",
            provider_playlist_id="playlist",
            title="Fixture Song",
            artist_names=["Fixture Artist"],
            album="Fixture Album",
            duration_ms=180000,
            isrc="USRC17607839",
        )

        async def fake_by_isrc(isrc):
            return [{
                "id": "rec-1",
                "title": "Fixture Song",
                "length": 180000,
                "score": 80,
                "artist-credit": [{"name": "Fixture Artist"}],
                "releases": [{
                    "id": "rel-1",
                    "title": "Fixture Album",
                    "date": "2024-01-01",
                    "release-group": {"id": "rg-1", "title": "Fixture Album"},
                }],
            }]

        monkeypatch.setattr(MusicBrainzMatcher, "_recordings_by_isrc", fake_by_isrc)
        result = await MusicBrainzMatcher.match_track(track)

        assert result.match_reason == "isrc"
        assert result.confidence >= 80
        assert result.recording_mbid == "rec-1"

    @pytest.mark.asyncio
    async def test_match_track_by_text(self, monkeypatch):
        """Should match tracks by text search."""
        MusicBrainzMatcher._match_cache.clear()
        track = ImportedTrack(
            provider="spotify",
            provider_playlist_id="playlist",
            title="Fallback Song",
            artist_names=["Fallback Artist"],
            duration_ms=181000,
        )

        async def fake_by_text(track):
            return [{
                "id": "rec-2",
                "title": "Fallback Song",
                "length": 181000,
                "score": 75,
                "artist-credit": [{"name": "Fallback Artist"}],
                "releases": [{"id": "rel-2", "title": "Fallback Release"}],
            }]

        monkeypatch.setattr(MusicBrainzMatcher, "_recordings_by_text", fake_by_text)
        result = await MusicBrainzMatcher.match_track(track)

        assert result.match_reason == "artist_title_duration"
        assert result.confidence >= 75

    def test_normalize_track_title(self):
        """Matcher should normalize track titles."""
        from services.musicbrainz_matcher import MusicBrainzMatcher
        
        assert MusicBrainzMatcher._normalize("Test Title") == "test title"
        assert MusicBrainzMatcher._normalize("Test  Title") == "test title"


class TestLyricsParsing:
    """Tests for LRCLIB lyric parsing."""

    def test_parse_synced_lyrics(self):
        lines = LyricsService._parse_synced_lyrics("[00:01.50]First\n[00:03.00]Second")

        assert [line.text for line in lines] == ["First", "Second"]
        assert lines[0].start_time_ms == 1500
        assert lines[0].end_time_ms == 3000

    def test_parse_plain_lyrics(self):
        lines = LyricsService._parse_plain_lyrics(" First \n\nSecond")

        assert [line.text for line in lines] == ["First", "Second"]
        assert lines[0].start_time_ms is None

    def test_parse_malformed_synced_lyrics(self):
        assert LyricsService._parse_synced_lyrics("no timestamp\n[bad]line") == []


class TestFocusScoring:
    """Tests for focus audio feature scoring."""

    def test_focus_feature_match_and_score(self):
        features = AudioFeatures(
            {
                "id": "track",
                "tempo": 90,
                "energy": 0.5,
                "valence": 0.5,
                "instrumentalness": 0.8,
                "speechiness": 0.01,
                "liveness": 0.01,
            }
        )

        assert features.matches_profile(DEFAULT_PROFILE)
        assert features.focus_score(DEFAULT_PROFILE) > 75

    def test_focus_feature_rejects_out_of_range_bpm(self):
        features = AudioFeatures({"tempo": 180, "instrumentalness": 1.0})

        assert not features.matches_profile(DEFAULT_PROFILE)


class TestFocusProfileStorage:
    """Tests for focus profile storage adapters."""

    def test_local_json_storage_roundtrip(self, tmp_path):
        storage = LocalJsonFocusProfileStorage(tmp_path / "focus_profile.json")
        profile = {**DEFAULT_PROFILE, "label": "Deep Work"}

        storage.save(profile)

        assert storage.load() == profile
        storage.reset()
        assert storage.load() is None

    def test_focus_profile_uses_configured_local_storage(self, tmp_path, monkeypatch):
        monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))
        saved = FocusProfile.save({"bpm_min": 70, "bpm_max": 90})

        assert saved["bpm_min"] == 70
        assert FocusProfile.load()["bpm_max"] == 90
        assert (tmp_path / "focus_profile.json").exists()

    def test_kv_storage_stub_fails_clearly(self):
        storage = KvFocusProfileStorageStub("focus")

        with pytest.raises(RuntimeError, match="KV focus profile storage is not wired"):
            storage.load()
