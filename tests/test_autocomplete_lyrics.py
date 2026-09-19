from __future__ import annotations

import time
from typing import Any

import pytest

from models import AutocompleteSuggestion
from services.lyrics_availability import get_store, reset_store_for_tests
from services.metadata_service import MetadataService


def _recording(rec_id: str, title: str, artist: str) -> dict[str, Any]:
    """Build a minimal MusicBrainz recording dict for the autocomplete pipeline."""
    return {
        "id": rec_id,
        "title": title,
        "length": 200_000,
        "score": 95,
        "artist-credit": [{"name": artist}],
        "releases": [{"id": f"rel-{rec_id}", "title": "Album", "date": "2020"}],
    }


@pytest.fixture
def lyrics_store(tmp_path, monkeypatch):
    """Provide an isolated lyrics-availability store and clear service caches."""
    class _Settings:
        dms_data_dir = tmp_path

    monkeypatch.setattr(
        "services.lyrics_availability.get_settings", lambda: _Settings()
    )
    reset_store_for_tests()
    MetadataService._autocomplete_cache.clear()
    MetadataService._author_index.clear()
    store = get_store()
    yield store
    reset_store_for_tests()


class TestAutocompleteLyrics:
    """Lyrics availability should nudge, not override, autocomplete ranking."""

    @pytest.mark.asyncio
    async def test_synced_ranks_first_when_text_scores_equal(
        self, monkeypatch, lyrics_store
    ):
        """A 'synced' lyric record should outrank an 'unknown' one with identical text score."""
        async def fake_recordings(query, limit):
            return [
                _recording("rec-1", "Alpha Track", "Artist A"),
                _recording("rec-2", "Beta Track", "Artist B"),
            ]

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        monkeypatch.setattr(
            "services.metadata_service.combined_score", lambda q, t, a=None: 80.0
        )
        MetadataService._autocomplete_cache.clear()

        get_store().record("Artist A", "Alpha Track", "synced")

        suggestions = await MetadataService.autocomplete("alpha beta", limit=2)

        assert [s.title for s in suggestions] == ["Alpha Track", "Beta Track"]
        assert suggestions[0].lyrics == "synced"
        assert suggestions[1].lyrics == "unknown"

    @pytest.mark.asyncio
    async def test_none_ranks_below_unknown(self, monkeypatch, lyrics_store):
        """A 'none' lyric record should rank below an 'unknown' one with the same text score."""
        async def fake_recordings(query, limit):
            return [
                _recording("rec-1", "Gamma Tune", "Artist A"),
                _recording("rec-2", "Delta Tune", "Artist B"),
            ]

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        monkeypatch.setattr(
            "services.metadata_service.combined_score", lambda q, t, a=None: 80.0
        )
        MetadataService._autocomplete_cache.clear()

        get_store().record("Artist A", "Gamma Tune", "none")

        suggestions = await MetadataService.autocomplete("gamma delta", limit=2)

        assert [s.title for s in suggestions] == ["Delta Tune", "Gamma Tune"]
        assert suggestions[0].lyrics == "unknown"
        assert suggestions[1].lyrics == "none"

    @pytest.mark.asyncio
    async def test_strong_text_match_outranks_weak_synced(self, monkeypatch, lyrics_store):
        """Lyrics boost is a nudge: a strong text match with 'none' still beats a weak 'synced' match."""
        async def fake_recordings(query, limit):
            return [
                _recording("rec-1", "Strong Hit", "Artist A"),
                _recording("rec-2", "Weak Song", "Artist B"),
            ]

        def fake_combined(query, title, artist=None):
            return 100.0 if "strong" in title.lower() else 50.0

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        monkeypatch.setattr("services.metadata_service.combined_score", fake_combined)
        MetadataService._autocomplete_cache.clear()

        get_store().record("Artist A", "Strong Hit", "none")
        get_store().record("Artist B", "Weak Song", "synced")

        suggestions = await MetadataService.autocomplete("strong weak", limit=2)

        assert [s.title for s in suggestions] == ["Strong Hit", "Weak Song"]
        assert suggestions[0].lyrics == "none"
        assert suggestions[1].lyrics == "synced"

    @pytest.mark.asyncio
    async def test_probe_records_synced_availability(self, monkeypatch, lyrics_store):
        """Probing LRCLIB should learn synced lyrics and reflect them in the suggestion."""
        async def fake_recordings(query, limit):
            return [_recording("rec-1", "Probe Song", "Probe Artist")]

        class LyricsResponse:
            pass

        class FakeLyricsService:
            @staticmethod
            def get_lyrics(title, artist, album=None, duration=None):
                get_store().record(artist, title, "synced")
                return LyricsResponse()

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        monkeypatch.setattr(
            "services.metadata_service.combined_score", lambda q, t, a=None: 80.0
        )
        monkeypatch.setattr("services.lyrics_service.LyricsService", FakeLyricsService)
        MetadataService._autocomplete_cache.clear()

        suggestions = await MetadataService.autocomplete("probe", limit=1)

        assert len(suggestions) == 1
        assert suggestions[0].lyrics == "synced"

    @pytest.mark.asyncio
    async def test_probe_respects_budget_and_leaves_unknown(self, monkeypatch, lyrics_store):
        """A slow lyrics probe must not block autocomplete past the budget."""
        async def fake_recordings(query, limit):
            return [_recording("rec-1", "Slow Song", "Slow Artist")]

        class SlowLyricsService:
            @staticmethod
            def get_lyrics(title, artist, album=None, duration=None):
                time.sleep(2.0)
                return None

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        monkeypatch.setattr(
            "services.metadata_service.combined_score", lambda q, t, a=None: 80.0
        )
        monkeypatch.setattr("services.lyrics_service.LyricsService", SlowLyricsService)
        MetadataService._autocomplete_cache.clear()

        start = time.monotonic()
        suggestions = await MetadataService.autocomplete("slow", limit=1)
        elapsed = time.monotonic() - start

        assert elapsed < 1.0
        assert len(suggestions) == 1
        assert suggestions[0].lyrics == "unknown"

    @pytest.mark.asyncio
    async def test_cache_hit_re_annotates_and_reorders(self, monkeypatch, lyrics_store):
        """Cached results should be re-annotated with newly learned lyrics availability."""
        async def fake_recordings(query, limit):
            return [
                _recording("rec-1", "Cached One", "Artist A"),
                _recording("rec-2", "Cached Two", "Artist B"),
            ]

        monkeypatch.setattr(MetadataService, "_autocomplete_recordings", fake_recordings)
        monkeypatch.setattr(
            "services.metadata_service.combined_score", lambda q, t, a=None: 80.0
        )
        MetadataService._autocomplete_cache.clear()

        first = await MetadataService.autocomplete("cached", limit=2)
        assert all(s.lyrics == "unknown" for s in first)

        get_store().record("Artist B", "Cached Two", "synced")

        second = await MetadataService.autocomplete("cached", limit=2)
        assert any(s.title == "Cached Two" and s.lyrics == "synced" for s in second)
        assert second[0].title == "Cached Two"
