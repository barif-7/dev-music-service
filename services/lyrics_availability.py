"""SQLite-backed lyrics availability cache.

The store keeps a lightweight (artist, title) -> status mapping so that
downstream code can avoid repeatedly asking lyric providers for songs that are
known to be instrumental or missing.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
from pathlib import Path

from config import get_settings
from services.text_match import normalize

LYRICS_STATUSES = ("synced", "plain", "instrumental", "none", "unknown")

logger = logging.getLogger(__name__)

_NONE_TTL_SECONDS = 30 * 24 * 60 * 60  # "none" entries expire after 30 days


class LyricsAvailabilityStore:
    """Thread-safe SQLite store for lyrics availability lookups."""

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
                CREATE TABLE IF NOT EXISTS lyrics_availability (
                    artist TEXT,
                    title TEXT,
                    status TEXT,
                    checked_at REAL,
                    PRIMARY KEY (artist, title)
                )
                """
            )
            self._conn.commit()

    def get(self, artist: str, title: str) -> str:
        """Return the stored status, or ``unknown`` if missing/expired."""
        norm_artist = normalize(artist)
        norm_title = normalize(title)
        now = time.time()

        with self._lock:
            row = self._conn.execute(
                "SELECT status, checked_at FROM lyrics_availability WHERE artist = ? AND title = ?",
                (norm_artist, norm_title),
            ).fetchone()

        if row is None:
            return "unknown"

        status, checked_at = row
        if status == "none" and (now - checked_at) > _NONE_TTL_SECONDS:
            return "unknown"
        return status

    def get_many(
        self, keys: list[tuple[str, str]]
    ) -> dict[tuple[str, str], str]:
        """Return statuses for many (artist, title) pairs.

        Keys are normalized internally, but the returned dictionary is keyed by
        the exact tuples that were passed in.
        """
        result: dict[tuple[str, str], str] = {}
        if not keys:
            return result

        now = time.time()
        with self._lock:
            for raw_artist, raw_title in keys:
                norm_artist = normalize(raw_artist)
                norm_title = normalize(raw_title)
                row = self._conn.execute(
                    "SELECT status, checked_at FROM lyrics_availability WHERE artist = ? AND title = ?",
                    (norm_artist, norm_title),
                ).fetchone()

                if row is None:
                    result[(raw_artist, raw_title)] = "unknown"
                    continue

                status, checked_at = row
                if status == "none" and (now - checked_at) > _NONE_TTL_SECONDS:
                    result[(raw_artist, raw_title)] = "unknown"
                else:
                    result[(raw_artist, raw_title)] = status

        return result

    def record(self, artist: str, title: str, status: str) -> None:
        """Upsert a status for a track. ``unknown`` is ignored; failures are logged."""
        if status == "unknown":
            return

        norm_artist = normalize(artist)
        norm_title = normalize(title)
        now = time.time()

        try:
            with self._lock:
                self._conn.execute(
                    """
                    INSERT INTO lyrics_availability (artist, title, status, checked_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(artist, title) DO UPDATE SET
                        status = excluded.status,
                        checked_at = excluded.checked_at
                    """,
                    (norm_artist, norm_title, status, now),
                )
                self._conn.commit()
        except sqlite3.Error:
            # Availability is best-effort; never fail the caller.
            logger.warning(
                "Failed to record lyrics availability for (%r, %r) status=%s",
                artist,
                title,
                status,
                exc_info=True,
            )


_store: LyricsAvailabilityStore | None = None
_store_lock = threading.Lock()


def get_store() -> LyricsAvailabilityStore:
    """Return the process-wide store, creating it on first call."""
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                path = get_settings().dms_data_dir / "lyrics-availability.sqlite3"
                _store = LyricsAvailabilityStore(path)
    return _store


def reset_store_for_tests() -> None:
    """Drop the cached store instance. Tests should call this to avoid cross-test state."""
    global _store
    with _store_lock:
        if _store is not None:
            try:
                _store._conn.close()
            except Exception:
                logger.debug("Failed to close lyrics availability store", exc_info=True)
        _store = None
