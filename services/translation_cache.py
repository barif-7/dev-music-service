"""Durable translation cache/job storage backed by SQLite.

Step 9: the current lyrics path uses in-process memory for translated line
windows. This module provides a thread-safe SQLite implementation that can be
swapped in behind the :class:`TranslationCacheBackend` protocol. The original
:class:`InMemoryTranslationCacheSkeleton` is kept as a backwards-compatible
subclass of the new implementation.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TranslationCacheKey:
    track_key: tuple[str, str, str | None, int | None]
    locale: str
    source_hash: str


@dataclass(frozen=True)
class TranslationJob:
    id: str
    cache_key: TranslationCacheKey
    status: str
    requested_indices: tuple[int, ...]


class TranslationCacheBackend(Protocol):
    def get_lines(self, key: TranslationCacheKey) -> dict[int, str]:
        """Return cached localized lines for a track/locale/source revision."""

    def put_lines(self, key: TranslationCacheKey, lines: dict[int, str]) -> None:
        """Persist translated line results and quality metadata in a later pass."""

    def enqueue_job(self, key: TranslationCacheKey, indices: tuple[int, ...]) -> TranslationJob:
        """Create a durable background translation job in Redis/Postgres."""


class SqliteTranslationCache:
    """Thread-safe SQLite-backed translation cache and job queue."""

    def __init__(self, path: Path) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        # check_same_thread=False is safe because every access is guarded by _lock.
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS translated_lines (
                    track_key TEXT,
                    locale TEXT,
                    source_hash TEXT,
                    line_index INTEGER,
                    text TEXT,
                    created_at REAL,
                    PRIMARY KEY (track_key, locale, source_hash, line_index)
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS translation_jobs (
                    id TEXT PRIMARY KEY,
                    track_key TEXT,
                    locale TEXT,
                    source_hash TEXT,
                    status TEXT,
                    requested_indices TEXT,
                    created_at REAL
                )
                """
            )
            self._conn.commit()

    @staticmethod
    def _serialize_track_key(track_key: tuple[str, str, str | None, int | None]) -> str:
        return json.dumps(list(track_key))

    def get_lines(self, key: TranslationCacheKey) -> dict[int, str]:
        """Return cached localized lines for a track/locale/source revision."""
        serialized_key = self._serialize_track_key(key.track_key)
        try:
            with self._lock:
                rows = self._conn.execute(
                    "SELECT line_index, text FROM translated_lines WHERE track_key = ? AND locale = ? AND source_hash = ?",
                    (serialized_key, key.locale, key.source_hash),
                ).fetchall()
        except sqlite3.Error:
            logger.warning(
                "Failed to read translation cache for key=%r",
                key,
                exc_info=True,
            )
            return {}

        return {int(line_index): text for line_index, text in rows}

    def put_lines(self, key: TranslationCacheKey, lines: dict[int, str]) -> None:
        """Persist translated line results and quality metadata in a later pass."""
        if not lines:
            return

        serialized_key = self._serialize_track_key(key.track_key)
        now = time.time()
        try:
            with self._lock:
                self._conn.executemany(
                    """
                    INSERT INTO translated_lines (track_key, locale, source_hash, line_index, text, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(track_key, locale, source_hash, line_index) DO UPDATE SET
                        text = excluded.text,
                        created_at = excluded.created_at
                    """,
                    [
                        (serialized_key, key.locale, key.source_hash, int(idx), text, now)
                        for idx, text in lines.items()
                    ],
                )
                self._conn.commit()
        except sqlite3.Error:
            logger.warning(
                "Failed to write translation cache for key=%r",
                key,
                exc_info=True,
            )

    def enqueue_job(self, key: TranslationCacheKey, indices: tuple[int, ...]) -> TranslationJob:
        """Create a durable background translation job in Redis/Postgres."""
        job_id = uuid.uuid4().hex
        serialized_key = self._serialize_track_key(key.track_key)
        serialized_indices = json.dumps(list(indices))
        now = time.time()

        try:
            with self._lock:
                self._conn.execute(
                    """
                    INSERT INTO translation_jobs (id, track_key, locale, source_hash, status, requested_indices, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (job_id, serialized_key, key.locale, key.source_hash, "queued", serialized_indices, now),
                )
                self._conn.commit()
        except sqlite3.Error:
            logger.warning(
                "Failed to enqueue translation job for key=%r",
                key,
                exc_info=True,
            )

        return TranslationJob(
            id=job_id,
            cache_key=key,
            status="queued",
            requested_indices=tuple(indices),
        )


class InMemoryTranslationCacheSkeleton(SqliteTranslationCache):
    """Placeholder shape for the eventual Redis/Postgres-backed implementation.

    Kept for backwards compatibility; now delegates to the SQLite backend.
    """

    def __init__(self, path: Path | None = None) -> None:
        if path is None:
            path = get_settings().dms_data_dir / "translation-cache.sqlite3"
        super().__init__(path)


_cache: SqliteTranslationCache | None = None
_cache_lock = threading.Lock()


def get_translation_cache() -> SqliteTranslationCache:
    """Return the process-wide translation cache, creating it on first call."""
    global _cache
    if _cache is None:
        with _cache_lock:
            if _cache is None:
                path = get_settings().dms_data_dir / "translation-cache.sqlite3"
                _cache = SqliteTranslationCache(path)
    return _cache


def reset_translation_cache_for_tests() -> None:
    """Drop the cached translation cache instance. Tests should call this to avoid cross-test state."""
    global _cache
    with _cache_lock:
        if _cache is not None:
            try:
                _cache._conn.close()
            except Exception:
                pass
        _cache = None