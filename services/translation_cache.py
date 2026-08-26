"""Future durable translation cache/job storage.

Step 9 skeleton: the current lyrics path uses in-process memory for translated
line windows. Production scale should move this behind Redis/Postgres so cache
entries, in-flight jobs, retries, and metrics survive process restarts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


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


class InMemoryTranslationCacheSkeleton:
    """Placeholder shape for the eventual Redis/Postgres-backed implementation."""

    def get_lines(self, key: TranslationCacheKey) -> dict[int, str]:
        raise NotImplementedError("Wire Redis/Postgres translation cache here.")

    def put_lines(self, key: TranslationCacheKey, lines: dict[int, str]) -> None:
        raise NotImplementedError("Wire durable translated-line persistence here.")

    def enqueue_job(self, key: TranslationCacheKey, indices: tuple[int, ...]) -> TranslationJob:
        raise NotImplementedError("Wire durable translation jobs/retries here.")
