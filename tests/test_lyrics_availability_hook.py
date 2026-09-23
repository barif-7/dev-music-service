import pytest

from services.lyrics_availability import get_store, reset_store_for_tests
from services.lyrics_service import LyricsService, LyricsNotFoundError, LyricsProviderError


@pytest.fixture(autouse=True)
def _fresh_store_and_cache(tmp_path, monkeypatch):
    # Settings are rebuilt from the environment on every get_settings() call,
    # so the env var is the only reliable way to redirect the store.
    monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))
    reset_store_for_tests()
    LyricsService._lyrics_cache = {}
    yield


def _payload(**overrides):
    base = {
        "trackName": "luther",
        "artistName": "Kendrick Lamar",
        "albumName": "GNX",
        "duration": 177,
        "plainLyrics": "plain lyrics",
        "syncedLyrics": None,
        "instrumental": False,
    }
    base.update(overrides)
    return base


def test_records_synced(monkeypatch):
    monkeypatch.setattr(
        LyricsService,
        "_request_json",
        lambda path, params: _payload(syncedLyrics="[00:12.00]line one\n[00:15.00]line two"),
    )
    monkeypatch.setattr(LyricsService, "_request_json_list", lambda path, params: [])

    response = LyricsService.get_lyrics("luther", "Kendrick Lamar", "GNX", 177)

    assert response.synced is True
    assert get_store().get("Kendrick Lamar", "luther") == "synced"


def test_records_plain(monkeypatch):
    monkeypatch.setattr(
        LyricsService,
        "_request_json",
        lambda path, params: _payload(plainLyrics="just plain words", syncedLyrics=None),
    )
    monkeypatch.setattr(LyricsService, "_request_json_list", lambda path, params: [])

    response = LyricsService.get_lyrics("luther", "Kendrick Lamar", "GNX", 177)

    assert response.synced is False
    assert response.plain_lyrics == "just plain words"
    assert get_store().get("Kendrick Lamar", "luther") == "plain"


def test_records_instrumental(monkeypatch):
    monkeypatch.setattr(
        LyricsService,
        "_request_json",
        lambda path, params: _payload(
            plainLyrics=None, syncedLyrics=None, instrumental=True
        ),
    )
    monkeypatch.setattr(LyricsService, "_request_json_list", lambda path, params: [])

    response = LyricsService.get_lyrics("luther", "Kendrick Lamar", "GNX", 177)

    assert response.instrumental is True
    assert get_store().get("Kendrick Lamar", "luther") == "instrumental"


def test_records_none_when_not_found(monkeypatch):
    monkeypatch.setattr(
        LyricsService,
        "_request_json",
        lambda path, params: (_ for _ in ()).throw(LyricsNotFoundError("not found")),
    )
    monkeypatch.setattr(LyricsService, "_request_json_list", lambda path, params: [])

    with pytest.raises(LyricsNotFoundError):
        LyricsService.get_lyrics("luther", "Kendrick Lamar", "GNX", 177)

    assert get_store().get("Kendrick Lamar", "luther") == "none"


def test_leaves_store_unknown_on_provider_outage(monkeypatch):
    monkeypatch.setattr(
        LyricsService,
        "_request_json",
        lambda path, params: (_ for _ in ()).throw(
            LyricsProviderError("Could not reach LRCLIB")
        ),
    )
    monkeypatch.setattr(LyricsService, "_request_json_list", lambda path, params: [])

    response = LyricsService.get_lyrics("luther", "Kendrick Lamar", "GNX", 177)

    assert response.provider == "lrclib_unavailable"
    assert get_store().get("Kendrick Lamar", "luther") == "unknown"
