"""Tests for the SQLite-backed translation cache."""

from __future__ import annotations

from pathlib import Path

import pytest

from services.translation_cache import (
    SqliteTranslationCache,
    TranslationCacheKey,
    get_translation_cache,
    reset_translation_cache_for_tests,
)


@pytest.fixture
def cache(tmp_path: Path) -> SqliteTranslationCache:
    return SqliteTranslationCache(tmp_path / "test-translation-cache.sqlite3")


def test_round_trip_put_get(cache: SqliteTranslationCache) -> None:
    key = TranslationCacheKey(
        track_key=("artist", "title", None, None),
        locale="fr-FR",
        source_hash="abc123",
    )
    lines = {0: "line zero", 1: "line one", 5: "line five"}

    cache.put_lines(key, lines)
    result = cache.get_lines(key)

    assert result == lines


def test_get_unknown_key_returns_empty_dict(cache: SqliteTranslationCache) -> None:
    key = TranslationCacheKey(
        track_key=("unknown", "track", None, None),
        locale="de-DE",
        source_hash="xyz789",
    )

    result = cache.get_lines(key)

    assert result == {}


def test_upsert_overwrites_existing_lines(cache: SqliteTranslationCache) -> None:
    key = TranslationCacheKey(
        track_key=("artist", "title", "album", 42),
        locale="es-ES",
        source_hash="hash1",
    )

    cache.put_lines(key, {0: "original", 1: "first"})
    cache.put_lines(key, {0: "updated", 2: "second"})

    result = cache.get_lines(key)

    assert result == {0: "updated", 1: "first", 2: "second"}


def test_enqueue_job_returns_queued_job_with_indices(cache: SqliteTranslationCache) -> None:
    key = TranslationCacheKey(
        track_key=("artist", "title", None, 7),
        locale="ja-JP",
        source_hash="japan-hash",
    )
    indices = (3, 7, 12)

    job = cache.enqueue_job(key, indices)

    assert job.status == "queued"
    assert job.cache_key == key
    assert job.requested_indices == indices
    assert len(job.id) == 32  # uuid4 hex length


def test_get_translation_cache_creates_file_under_tmp_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reset_translation_cache_for_tests()
    monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))

    cache = get_translation_cache()

    expected_path = tmp_path / "translation-cache.sqlite3"
    assert expected_path.exists()
    assert isinstance(cache, SqliteTranslationCache)

    # Clean up so other tests aren't affected.
    reset_translation_cache_for_tests()
