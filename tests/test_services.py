"""Unit and integration tests for service layer."""
import pytest

from models import AutocompleteSuggestion, SongSearchResult
from services.music_service import MusicService, MusicServiceError, SearchServiceError, StreamResolutionError
from services.metadata_service import MetadataService, MetadataServiceError


class TestMusicServiceSearch:
    """Tests for MusicService.search method."""

    @pytest.mark.skip(reason="Requires actual YouTube API")
    def test_search_returns_results(self, sample_search_query):
        """Search should return results for valid query."""
        results = MusicService.search(sample_search_query, limit=1)
        
        assert isinstance(results, list)
        if results:
            result = results[0]
            assert isinstance(result, SongSearchResult)
            assert result.title
            assert result.webpage_url
            assert result.stream_url

    @pytest.mark.skip(reason="Requires actual YouTube API")
    def test_search_respects_limit(self, sample_search_query):
        """Search should respect limit parameter."""
        results = MusicService.search(sample_search_query, limit=3)
        
        assert len(results) <= 3

    def test_search_empty_query(self):
        """Search should handle empty query."""
        with pytest.raises(SearchServiceError):
            MusicService.search("", limit=1)

    @pytest.mark.skip(reason="Requires actual YouTube API")
    def test_search_caching(self, sample_search_query):
        """Search results should be cached."""
        # First call
        results1 = MusicService.search(sample_search_query, limit=1)
        
        # Second call (should use cache)
        results2 = MusicService.search(sample_search_query, limit=1)
        
        # Results should be the same
        assert len(results1) == len(results2)
        if results1 and results2:
            assert results1[0].title == results2[0].title


class TestMusicServiceStream:
    """Tests for MusicService stream methods."""

    @pytest.mark.skip(reason="Requires actual YouTube video")
    def test_get_stream_source(self, sample_youtube_url):
        """get_stream_source should return URL and headers."""
        direct_url, headers = MusicService.get_stream_source(sample_youtube_url)
        
        assert isinstance(direct_url, str)
        assert direct_url.startswith("http")
        assert isinstance(headers, dict)

    def test_get_stream_source_invalid_url(self):
        """get_stream_source should error on invalid URL."""
        with pytest.raises(StreamResolutionError):
            MusicService.get_stream_source("invalid-url")

    @pytest.mark.skip(reason="Requires actual YouTube video")
    def test_stream_caching(self, sample_youtube_url):
        """Stream sources should be cached."""
        # First call
        url1, headers1 = MusicService.get_stream_source(sample_youtube_url)
        
        # Second call (should use cache)
        url2, headers2 = MusicService.get_stream_source(sample_youtube_url)
        
        # Should return same URL
        assert url1 == url2


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
    @pytest.mark.skip(reason="Requires actual MusicBrainz API")
    async def test_autocomplete_returns_suggestions(self):
        """Autocomplete should return suggestions."""
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
    @pytest.mark.skip(reason="Requires actual MusicBrainz API")
    async def test_autocomplete_caching(self):
        """Autocomplete results should be cached."""
        # First call
        results1 = await MetadataService.autocomplete("test", limit=3)
        
        # Second call (should use cache)
        results2 = await MetadataService.autocomplete("test", limit=3)
        
        # Results should be the same
        assert len(results1) == len(results2)

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

    @pytest.mark.skip(reason="Requires implementation")
    def test_match_track_by_isrc(self):
        """Should match tracks by ISRC."""
        # TODO: Implement when MusicBrainzMatcher.match_track is complete
        pass

    @pytest.mark.skip(reason="Requires implementation")
    def test_match_track_by_text(self):
        """Should match tracks by text search."""
        # TODO: Implement when MusicBrainzMatcher.match_track is complete
        pass

    def test_normalize_track_title(self):
        """Matcher should normalize track titles."""
        from services.musicbrainz_matcher import MusicBrainzMatcher
        
        assert MusicBrainzMatcher._normalize("Test Title") == "test title"
        assert MusicBrainzMatcher._normalize("Test  Title") == "test title"
