"""Unit and integration tests for service layer."""
import json
import plistlib

import pytest

from urllib.error import URLError

from models import (
    AutocompleteSuggestion,
    ImportedTrack,
    LyricsLine,
    SongSearchResult,
    VideoSearchResult,
)
from services.lyrics_localization_service import LyricsLocalizationService
from services.live_transcription_service import LiveTranscriptionService
from services.apple_music_import_service import AppleMusicImportError, AppleMusicImportService
from services.focus_service import AudioFeatures, DEFAULT_PROFILE, FocusProfile, FocusService
from services.focus_storage import KvFocusProfileStorageStub, LocalJsonFocusProfileStorage
from services.lyrics_service import LyricsProviderError, LyricsService
from services.musicbrainz_matcher import MusicBrainzMatcher
from services.music_service import MusicService, MusicServiceError, SearchServiceError, StreamResolutionError
from services.metadata_service import MetadataService, MetadataServiceError
from services.spotify_import_service import SpotifyImportError, SpotifyImportService
from services.video_service import VideoService, VideoStreamResolutionError


class TestLiveTranscriptionService:
    def test_session_payload_uses_private_audio_proxy(self, monkeypatch):
        monkeypatch.setenv("CAPTION_AUDIO_SOURCE_BASE_URL", "http://127.0.0.1:8000")
        monkeypatch.setenv("LYRICS_TRANSCRIPTION_LANGUAGE", "auto")

        payload = LiveTranscriptionService._payload(
            "Song",
            "Artist",
            "https://www.youtube.com/watch?v=fixture",
            "fr-CA",
        )

        assert payload["source_url"].startswith("http://127.0.0.1:8000/api/stream?")
        assert "youtube.com%2Fwatch%3Fv%3Dfixture" in payload["source_url"]
        assert payload["target_locale"] == "fr-CA"
        assert len(payload["track_key"]) == 24


class TestAppleMusicImportService:
    def test_parses_music_xml_and_preserves_listening_history(self):
        payload = plistlib.dumps(
            {
                "Library Persistent ID": "LIBRARY123",
                "Tracks": {
                    "1": {
                        "Persistent ID": "TRACK1",
                        "Name": "First Song",
                        "Artist": "Fixture Artist",
                        "Album": "Fixture Album",
                        "Total Time": 183000,
                        "Track Number": 1,
                        "Year": 2024,
                        "Play Count": 17,
                        "Skip Count": 2,
                        "Loved": True,
                        "Apple Music": True,
                        "Genre": "Electronic",
                    },
                    "2": {
                        "Persistent ID": "TRACK2",
                        "Name": "Second Song",
                        "Artist": "Fixture Artist",
                        "Album": "Fixture Album",
                        "Total Time": 201000,
                        "Track Number": 2,
                        "Year": 2024,
                        "Play Count": 3,
                    },
                },
            }
        )

        result = AppleMusicImportService.parse_xml(payload)

        assert result["provider"] == "apple_music"
        assert result["library"]["track_count"] == 2
        assert result["library"]["plays"] == 20
        assert result["albums"][0]["track_count"] == 2
        assert result["albums"][0]["tracks"][0]["plays"] == 17
        assert result["albums"][0]["tracks"][0]["streaming"] is True

    def test_rejects_non_library_xml(self):
        with pytest.raises(AppleMusicImportError, match="Tracks"):
            AppleMusicImportService.parse_xml(plistlib.dumps({"Playlists": []}))

    def test_loads_and_normalizes_persistent_json_export(self, tmp_path):
        export = {
            "provider": "apple_music",
            "library": {"title": "Fixture Library", "track_count": 999},
            "albums": [{
                "id": "album-1", "name": "Fixture Album", "artist": "Fixture Artist",
                "tracks": [{
                    "provider": "apple_music", "provider_track_id": "TRACK1",
                    "title": "Fixture Song", "artist_names": ["Fixture Artist"],
                    "album": "Fixture Album", "duration_ms": 183000,
                }],
            }],
        }
        path = tmp_path / "apple_music_import.json"
        path.write_text(json.dumps(export))

        result = AppleMusicImportService.load_export(path)

        assert result["library"]["album_count"] == 1
        assert result["library"]["track_count"] == 1
        assert result["albums"][0]["tracks"][0]["provider"] == "apple_music"


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


class TestVideoService:
    def test_build_query_for_supported_kinds(self):
        assert (
            VideoService._build_query("Blinding Lights", "The Weeknd", "music_video")
            == "The Weeknd Blinding Lights official music video"
        )
        assert (
            VideoService._build_query("Blinding Lights", "The Weeknd", "shorts")
            == "The Weeknd Blinding Lights shorts"
        )
        assert (
            VideoService._build_query("Blinding Lights", "The Weeknd", "live")
            == "The Weeknd Blinding Lights live performance"
        )

    def test_score_prefers_official_video_and_short_duration(self):
        official = {
            "title": "Song (Official Music Video)",
            "channel": "Artist VEVO",
            "duration": 240,
        }
        lyric = {
            "title": "Song lyric video slowed",
            "channel": "Fan channel",
            "duration": 240,
        }
        short = {"title": "Song #Shorts", "duration": 45}
        long_video = {"title": "Song", "duration": 240}

        assert VideoService._score_video(official, "music_video") > VideoService._score_video(
            lyric,
            "music_video",
        )
        assert VideoService._score_video(short, "shorts") > VideoService._score_video(
            long_video,
            "shorts",
        )

    def test_search_returns_ranked_video_results(self, monkeypatch):
        VideoService._video_search_cache.clear()
        VideoService._video_stream_cache.clear()

        class FakeYoutubeDL:
            def __init__(self, opts):
                self.opts = opts

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def extract_info(self, query, download=False):
                return {
                    "entries": [
                        {
                            "title": "Fan lyric video",
                            "webpage_url": "https://youtube.com/watch?v=fan",
                            "duration": 200,
                        },
                        {
                            "title": "Artist - Song (Official Music Video)",
                            "webpage_url": "https://youtube.com/watch?v=official",
                            "url": "https://rr1---sn.googlevideo.com/videoplayback",
                            "http_headers": {"User-Agent": "fixture"},
                            "channel": "Artist VEVO",
                            "duration": 210,
                            "width": 854,
                            "height": 480,
                        },
                    ]
                }

        monkeypatch.setattr("services.video_service.yt_dlp.YoutubeDL", FakeYoutubeDL)
        results = VideoService.search("Song", "Artist", limit=1)

        assert len(results) == 1
        assert isinstance(results[0], VideoSearchResult)
        assert results[0].webpage_url.endswith("official")
        assert results[0].video_stream_url.startswith("/api/video/stream?")
        assert results[0].height == 480

    def test_get_video_stream_source_rejects_invalid_url(self):
        with pytest.raises(VideoStreamResolutionError):
            VideoService.get_video_stream_source("not-a-url")


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

    def test_spotify_suggestion_keeps_track_id(self):
        suggestion = MetadataService._suggestion_from_spotify_track(
            {
                "id": "spotify-track-1",
                "name": "Fixture Song",
                "artists": [{"name": "Fixture Artist"}],
                "album": {"name": "Fixture Album", "images": []},
            },
            "fixture song",
        )

        assert suggestion is not None
        assert suggestion.spotify_id == "spotify-track-1"
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


class TestSpotifyLibrary:
    @pytest.mark.asyncio
    async def test_save_track_uses_current_library_endpoint(self, monkeypatch):
        calls = []

        monkeypatch.setattr(SpotifyImportService, "_access_token", lambda request: "token")

        async def fake_put(access_token, path, params=None):
            calls.append((access_token, path, params))

        monkeypatch.setattr(SpotifyImportService, "_spotify_put", fake_put)

        track_id = await SpotifyImportService.save_track(
            object(),
            title="Fixture Song",
            artist="Fixture Artist",
            spotify_id="4iV5W9uYEdYUVa79Axb7Rh",
        )

        assert track_id == "4iV5W9uYEdYUVa79Axb7Rh"
        assert calls == [
            (
                "token",
                "/me/library",
                {"uris": "spotify:track:4iV5W9uYEdYUVa79Axb7Rh"},
            )
        ]

    @pytest.mark.asyncio
    async def test_save_track_resolves_spotify_id_when_missing(self, monkeypatch):
        calls = []

        monkeypatch.setattr(SpotifyImportService, "_access_token", lambda request: "token")

        async def fake_search(access_token, query, limit=5):
            assert access_token == "token"
            assert query == "Fixture Song Fixture Artist Fixture Album"
            assert limit == 1
            return [{"id": "resolved-track"}]

        async def fake_put(access_token, path, params=None):
            calls.append((access_token, path, params))

        monkeypatch.setattr(SpotifyImportService, "search_tracks", fake_search)
        monkeypatch.setattr(SpotifyImportService, "_spotify_put", fake_put)

        track_id = await SpotifyImportService.save_track(
            object(),
            title="Fixture Song",
            artist="Fixture Artist",
            album="Fixture Album",
        )

        assert track_id == "resolved-track"
        assert calls[0][2] == {"uris": "spotify:track:resolved-track"}

    @pytest.mark.asyncio
    async def test_is_track_saved_reads_contains_endpoint(self, monkeypatch):
        calls = []

        monkeypatch.setattr(SpotifyImportService, "_access_token", lambda request: "token")

        async def fake_get(access_token, path, params=None):
            calls.append((access_token, path, params))
            return [True]

        monkeypatch.setattr(SpotifyImportService, "_spotify_get", fake_get)

        saved = await SpotifyImportService.is_track_saved(object(), "4iV5W9uYEdYUVa79Axb7Rh")

        assert saved is True
        assert calls == [
            ("token", "/me/tracks/contains", {"ids": "4iV5W9uYEdYUVa79Axb7Rh"})
        ]

    @pytest.mark.asyncio
    async def test_is_track_saved_handles_not_saved_and_blank(self, monkeypatch):
        monkeypatch.setattr(SpotifyImportService, "_access_token", lambda request: "token")

        async def fake_get(access_token, path, params=None):
            return [False]

        monkeypatch.setattr(SpotifyImportService, "_spotify_get", fake_get)

        assert await SpotifyImportService.is_track_saved(object(), "abc") is False
        # blank id short-circuits without touching Spotify
        assert await SpotifyImportService.is_track_saved(object(), "") is False


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

    def test_lrclib_provider_outage_returns_empty_response(self, monkeypatch):
        def _provider_down(path, params):
            raise LyricsProviderError("Could not reach LRCLIB")

        monkeypatch.setattr(LyricsService, "_request_json", _provider_down)
        monkeypatch.setattr(LyricsService, "_request_json_list", lambda path, params: [])

        response = LyricsService.get_lyrics("luther", "Kendrick Lamar", "GNX", 177)

        assert response.provider == "lrclib_unavailable"
        assert response.title == "luther"
        assert response.artist == "Kendrick Lamar"
        assert response.lines == []


class TestLyricsLocalization:
    """Tests for the CaptionLocalizer bridge used to localize lyric lines."""

    def _lines(self):
        return [
            LyricsLine(text="Look at the stars", start_time_ms=0, end_time_ms=2000),
            LyricsLine(text="Look how they shine", start_time_ms=2000, end_time_ms=4000),
        ]

    def _fake_urlopen(self, segments, calls=None):
        import json as _json
        from contextlib import contextmanager

        @contextmanager
        def _ctx(request, timeout=None):
            if calls is not None:
                calls.append(
                    {
                        "url": request.full_url,
                        "payload": _json.loads(request.data.decode("utf-8")),
                    }
                )

            class _Resp:
                def read(self_inner):
                    return _json.dumps({"output": {"segments": segments}}).encode("utf-8")

            yield _Resp()

        return _ctx

    def test_localize_maps_localized_text_by_index(self, monkeypatch):
        segments = [
            {"index": 0, "localized_text": "Mira las estrellas"},
            {
                "index": 1,
                "localized_text": "Mira cómo brillan",
                "quality": {"timing_fit": "ok", "too_long": False},
            },
        ]
        monkeypatch.setattr(
            "services.lyrics_localization_service.urlopen", self._fake_urlopen(segments)
        )
        result = LyricsLocalizationService.localize(self._lines(), "es-MX")

        assert [line.localized_text for line in result] == [
            "Mira las estrellas",
            "Mira cómo brillan",
        ]
        # timing and source text are preserved
        assert result[0].start_time_ms == 0
        assert result[0].text == "Look at the stars"
        assert result[1].localization_quality == {"timing_fit": "ok", "too_long": False}

    def test_call_uses_lyrics_tool_and_song_context(self, monkeypatch):
        calls = []
        segments = [{"index": 0, "localized_text": "Mira las estrellas"}]
        monkeypatch.setattr(
            "services.lyrics_localization_service.urlopen",
            self._fake_urlopen(segments, calls),
        )

        result = LyricsLocalizationService.localize_subset(
            self._lines(),
            [0],
            "es-MX",
            song_context={
                "title": "Yellow",
                "artist": "Coldplay",
                "bpm": 87,
                "mood": ["wistful"],
                "preserve_singability": True,
            },
        )

        assert result == {0: "Mira las estrellas"}
        assert calls[0]["url"].endswith("/tools/localize_lyrics/run")
        payload = calls[0]["payload"]["input"]
        assert payload["segments"][0]["index"] == 0
        assert payload["segments"][0]["start_ms"] == 0
        assert payload["song_context"]["title"] == "Yellow"
        assert payload["song_context"]["mood"] == ["wistful"]
        assert payload["localization_policy"]["mode"] == "lyrics"
        assert payload["localization_policy"]["avoid_ad_copy_rewrite"] is True

    def test_localize_no_locale_is_passthrough(self):
        lines = self._lines()
        assert LyricsLocalizationService.localize(lines, "") is lines

    def test_localize_falls_back_on_error(self, monkeypatch):
        def _boom(request, timeout=None):
            raise URLError("localizer down")

        monkeypatch.setattr("services.lyrics_localization_service.urlopen", _boom)
        result = LyricsLocalizationService.localize(self._lines(), "es-MX")

        assert [line.localized_text for line in result] == [None, None]
        assert [line.text for line in result] == ["Look at the stars", "Look how they shine"]

    def test_localize_subset_returns_only_requested_indices(self, monkeypatch):
        # Three lines, but only indices 0 and 2 are requested.
        lines = [
            LyricsLine(text="one", start_time_ms=0, end_time_ms=1000),
            LyricsLine(text="two", start_time_ms=1000, end_time_ms=2000),
            LyricsLine(text="three", start_time_ms=2000, end_time_ms=3000),
        ]
        segments = [{"index": 0, "localized_text": "uno"}, {"index": 2, "localized_text": "tres"}]
        monkeypatch.setattr(
            "services.lyrics_localization_service.urlopen", self._fake_urlopen(segments)
        )
        result = LyricsLocalizationService.localize_subset(lines, [0, 2], "es-MX")
        assert result == {0: "uno", 2: "tres"}

    def test_localize_items_maps_by_carried_index(self, monkeypatch):
        segments = [{"index": 5, "localized_text": "uno"}, {"index": 9, "localized_text": "dos"}]
        monkeypatch.setattr(
            "services.lyrics_localization_service.urlopen", self._fake_urlopen(segments)
        )
        result = LyricsLocalizationService.localize_items([(5, "one"), (9, "two")], "es-MX")
        assert result == {5: "uno", 9: "dos"}

    def test_localize_items_empty_is_passthrough(self):
        assert LyricsLocalizationService.localize_items([], "es-MX") == {}


class TestLyricsWindow:
    """Just-in-time window localization on LyricsService."""

    def setup_method(self):
        LyricsService._localized_cache.clear()
        LyricsService._localized_expiry.clear()
        LyricsService._localized_inflight.clear()

    def test_localize_window_translates_then_caches(self, monkeypatch):
        calls = []

        def _fake_items(items, locale, song_context=None):
            calls.append(list(items))
            assert song_context["title"] == "T"
            assert song_context["artist"] == "A"
            return {index: f"{text}-{locale}" for index, text in items}

        monkeypatch.setattr(
            "services.lyrics_service.LyricsLocalizationService.localize_items", _fake_items
        )
        items = [(0, "hello"), (1, "world")]
        first = LyricsService.localize_window("T", "A", None, None, "es", items)
        assert first == {0: "hello-es", 1: "world-es"}

        # second call is served from cache — the bridge is not hit again
        second = LyricsService.localize_window("T", "A", None, None, "es", items)
        assert second == {0: "hello-es", 1: "world-es"}
        assert len(calls) == 1

    def test_localize_window_only_requests_missing(self, monkeypatch):
        calls = []

        def _fake_items(items, locale, song_context=None):
            calls.append([i for i, _ in items])
            return {index: f"x{index}" for index, _ in items}

        monkeypatch.setattr(
            "services.lyrics_service.LyricsLocalizationService.localize_items", _fake_items
        )
        LyricsService.localize_window("T", "A", None, None, "es", [(0, "a")])
        LyricsService.localize_window("T", "A", None, None, "es", [(0, "a"), (1, "b")])
        # second call only asks the bridge for the new index 1
        assert calls == [[0], [1]]

    def test_localize_window_empty_locale_is_noop(self):
        assert LyricsService.localize_window("T", "A", None, None, "", [(0, "a")]) == {}


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

    @pytest.mark.asyncio
    async def test_top_tracks_falls_back_when_audio_features_are_blocked(self, monkeypatch):
        async def fake_spotify_get(access_token, path, params=None):
            if path == "/me/top/tracks":
                return {
                    "items": [
                        {
                            "id": "track-1",
                            "name": "Fixture Song",
                            "artists": [{"name": "Fixture Artist"}],
                            "album": {"name": "Fixture Album", "images": [{"url": "https://img.example/cover.jpg"}]},
                            "popularity": 80,
                        }
                    ]
                }
            if path == "/audio-features":
                raise SpotifyImportError(
                    'Spotify API request to /audio-features failed with 403: { "error" : { "status" : 403 } }'
                )
            raise AssertionError(f"unexpected Spotify path {path}")

        monkeypatch.setattr("services.spotify_import_service.SpotifyImportService._spotify_get", fake_spotify_get)

        result = await FocusService.analyse_top_tracks("token", profile=DEFAULT_PROFILE)

        assert result["audio_features_available"] is False
        assert result["bpm_insight"] is None
        assert result["top_tracks"][0]["title"] == "Fixture Song"
        assert "audio features" in result["warning"].lower()


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
