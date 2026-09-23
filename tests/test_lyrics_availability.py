import sqlite3
from pathlib import Path

import pytest

from services.lyrics_availability import (
    LYRICS_STATUSES,
    LyricsAvailabilityStore,
    get_store,
    reset_store_for_tests,
)


@pytest.fixture(autouse=True)
def _reset_global_store() -> None:
    reset_store_for_tests()
    yield
    reset_store_for_tests()


@pytest.fixture
def store(tmp_path: Path) -> LyricsAvailabilityStore:
    return LyricsAvailabilityStore(tmp_path / "lyrics-availability.sqlite3")


def test_lyrics_statuses_constant() -> None:
    assert LYRICS_STATUSES == ("synced", "plain", "instrumental", "none", "unknown")


def test_get_returns_unknown_when_missing(store: LyricsAvailabilityStore) -> None:
    assert store.get("Adele", "Hello") == "unknown"


def test_record_and_get(store: LyricsAvailabilityStore) -> None:
    store.record("Adele", "Hello", "synced")
    assert store.get("Adele", "Hello") == "synced"


def test_record_ignores_unknown(store: LyricsAvailabilityStore) -> None:
    store.record("Adele", "Hello", "synced")
    store.record("Adele", "Hello", "unknown")
    # The earlier synced value should remain.
    assert store.get("Adele", "Hello") == "synced"


def test_normalization(store: LyricsAvailabilityStore) -> None:
    store.record("The Weeknd", "Blinding Lights", "synced")
    assert store.get("the weeknd", "blinding lights") == "synced"
    assert store.get("  THE WEEKND  ", "  Blinding Lights!  ") == "synced"


def test_get_many_returns_keys_exactly_as_passed(store: LyricsAvailabilityStore) -> None:
    store.record("Adele", "Hello", "synced")
    store.record("Drake", "Hotline Bling", "plain")

    keys = [("ADELE", "hello"), ("Drake", "Hotline Bling"), ("Unknown", "Song")]
    result = store.get_many(keys)

    assert set(result.keys()) == set(keys)
    assert result[("ADELE", "hello")] == "synced"
    assert result[("Drake", "Hotline Bling")] == "plain"
    assert result[("Unknown", "Song")] == "unknown"


def test_get_many_mixed_known_unknown(store: LyricsAvailabilityStore) -> None:
    store.record("A", "One", "instrumental")
    store.record("B", "Two", "none")

    result = store.get_many([("A", "One"), ("C", "Three")])

    assert result[("A", "One")] == "instrumental"
    assert result[("C", "Three")] == "unknown"


def test_get_many_empty(store: LyricsAvailabilityStore) -> None:
    assert store.get_many([]) == {}


def test_none_expires_after_30_days(
    store: LyricsAvailabilityStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = 1_700_000_000.0

    # Record a "none" entry 31 days in the past.
    monkeypatch.setattr("time.time", lambda: now - 31 * 24 * 3600)
    store.record("Old Artist", "Old Song", "none")

    # Move to the present; the expired "none" should look like unknown.
    monkeypatch.setattr("time.time", lambda: now)
    assert store.get("Old Artist", "Old Song") == "unknown"

    # Other statuses should not expire.
    store.record("Another", "Song", "synced")
    assert store.get("Another", "Song") == "synced"


def test_record_swallows_sqlite_error(
    store: LyricsAvailabilityStore,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise sqlite3.OperationalError("disk I/O error")

    class _BrokenConn:
        execute = staticmethod(_boom)

        def commit(self) -> None:
            pass

    monkeypatch.setattr(store, "_conn", _BrokenConn())

    # Should not raise.
    store.record("A", "B", "synced")

    assert "Failed to record" in caplog.text


def test_get_store_singleton(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import services.lyrics_availability as lav

    class FakeSettings:
        dms_data_dir = tmp_path

    monkeypatch.setattr(lav, "get_settings", lambda: FakeSettings())

    store1 = get_store()
    store2 = get_store()

    assert store1 is store2
    assert store1._path == tmp_path / "lyrics-availability.sqlite3"
