from __future__ import annotations

import asyncio
from urllib.parse import urlparse

import certifi
import httpx
import structlog
from cachetools import TTLCache

from config import get_settings
from services.audio_feature_provider import AudioFeatureProvider
from services.focus_service import AudioFeatures

logger = structlog.get_logger()


def _spotify_id_from_href(href: str | None) -> str | None:
    """Extract the Spotify track ID from a ReccoBeats `href`.

    ReccoBeats echoes the originating track as
    ``https://open.spotify.com/track/<spotify_id>`` — the only reliable way to
    re-associate a result with the Spotify ID we sent (response order is not
    guaranteed and the object's own `id` is a ReccoBeats UUID).
    """
    if not href:
        return None
    parts = [p for p in urlparse(href).path.split("/") if p]
    if len(parts) >= 2 and parts[-2] == "track":
        return parts[-1]
    return None


class ReccoBeatsProvider:
    """
    AudioFeatureProvider backed by the ReccoBeats REST API.

    ReccoBeats replaced Spotify's deprecated ``/audio-features`` endpoint. Its
    audio-features lookup is keyed by a ReccoBeats UUID, not a Spotify ID, so
    each fetch is a two-step flow:

      1. ``GET /v1/track?ids=<spotify ids>`` — resolves Spotify IDs to ReccoBeats
         track objects (this batch endpoint accepts Spotify IDs). Each object's
         ``href`` carries the originating Spotify ID for re-association.
      2. ``GET /v1/track/{reccobeatsId}/audio-features`` — per-track features.

    Features are immutable per track, so results (including "no data") are
    cached aggressively. Concurrency is bounded and 429s honor ``Retry-After``.
    """

    _USER_AGENT = "dev-music-service/0.4 (https://github.com/barif-7/dev-music-service)"
    _RESOLVE_CHUNK = 40        # Spotify IDs per /v1/track resolve request
    _MAX_CONCURRENCY = 5       # simultaneous audio-features requests
    _CACHE_TTL = 24 * 3600     # features don't change — 24h
    _CACHE_MAX = 4096
    _MAX_RETRIES = 3
    _MAX_BACKOFF = 30.0

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or get_settings().reccobeats_api_base_url).rstrip("/")
        self._client: httpx.AsyncClient | None = None
        self._sem = asyncio.Semaphore(self._MAX_CONCURRENCY)
        # spotify_track_id -> AudioFeatures | None. None is a cached negative
        # result ("ReccoBeats has no data for this track") so known-missing IDs
        # are not re-fetched. All access is from the event-loop thread, and the
        # cache is read/written without intervening awaits, so no lock is needed.
        self._cache: TTLCache = TTLCache(maxsize=self._CACHE_MAX, ttl=self._CACHE_TTL)

    # -- client lifecycle (warmed in lifespan(), closed on shutdown) ----------

    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                verify=certifi.where(),
                timeout=httpx.Timeout(10.0),
                headers={"User-Agent": self._USER_AGENT, "Accept": "application/json"},
            )
        return self._client

    async def aclose(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # -- HTTP with 429/backoff; 404 -> None (no data) -------------------------

    async def _get_json(self, url: str, params: dict | None = None) -> dict | None:
        client = self.client()
        for attempt in range(self._MAX_RETRIES + 1):
            response = await client.get(url, params=params)
            if response.status_code == 429:
                if attempt >= self._MAX_RETRIES:
                    response.raise_for_status()
                retry_after = response.headers.get("Retry-After")
                try:
                    delay = float(retry_after) if retry_after else 2.0 ** attempt
                except ValueError:
                    delay = 2.0 ** attempt
                logger.warning("reccobeats_rate_limited", url=url, delay=delay)
                await asyncio.sleep(min(delay, self._MAX_BACKOFF))
                continue
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        return None

    # -- two-step lookup ------------------------------------------------------

    async def _resolve_ids(self, spotify_ids: list[str]) -> dict[str, str]:
        """spotify_id -> reccobeats_id, for the IDs ReccoBeats recognises."""
        mapping: dict[str, str] = {}
        for start in range(0, len(spotify_ids), self._RESOLVE_CHUNK):
            chunk = spotify_ids[start:start + self._RESOLVE_CHUNK]
            payload = await self._get_json(
                f"{self._base_url}/track", {"ids": ",".join(chunk)}
            )
            for obj in (payload or {}).get("content") or []:
                sid = _spotify_id_from_href(obj.get("href"))
                rid = obj.get("id")
                if sid and rid:
                    mapping[sid] = rid
        return mapping

    async def _fetch_features(self, spotify_id: str, reccobeats_id: str) -> AudioFeatures | None:
        async with self._sem:
            payload = await self._get_json(
                f"{self._base_url}/track/{reccobeats_id}/audio-features"
            )
        if not payload:
            return None
        # ReccoBeats field names/ranges match Spotify's; only the identity needs
        # rewriting (its `id` is a ReccoBeats UUID — we key on the Spotify ID).
        return AudioFeatures({**payload, "id": spotify_id, "source": "reccobeats"})

    # -- AudioFeatureProvider interface ---------------------------------------

    async def get_features_bulk(self, spotify_track_ids: list[str]) -> dict[str, AudioFeatures]:
        result: dict[str, AudioFeatures] = {}
        uncached: list[str] = []
        for sid in dict.fromkeys(spotify_track_ids):  # dedupe, preserve order
            if not sid:
                continue
            if sid in self._cache:
                cached = self._cache[sid]
                if cached is not None:
                    result[sid] = cached
            else:
                uncached.append(sid)

        if not uncached:
            return result

        mapping = await self._resolve_ids(uncached)
        # IDs ReccoBeats didn't return = no data; cache the negative result.
        for sid in uncached:
            if sid not in mapping:
                self._cache[sid] = None

        resolved = list(mapping.keys())
        features = await asyncio.gather(
            *(self._fetch_features(sid, mapping[sid]) for sid in resolved)
        )
        for sid, feature in zip(resolved, features):  # explicit re-association
            self._cache[sid] = feature
            if feature is not None:
                result[sid] = feature

        logger.info(
            "reccobeats_features_fetched",
            requested=len(uncached),
            resolved=len(resolved),
            with_features=sum(1 for sid in resolved if self._cache.get(sid) is not None),
        )
        return result

    async def get_features(self, spotify_track_id: str) -> AudioFeatures | None:
        results = await self.get_features_bulk([spotify_track_id])
        return results.get(spotify_track_id)


# Module-level singleton so the persistent httpx client and cache are shared
# across requests (warmed/closed in main.lifespan()).
_provider: ReccoBeatsProvider | None = None


def get_audio_feature_provider() -> AudioFeatureProvider:
    global _provider
    if _provider is None:
        _provider = ReccoBeatsProvider()
    return _provider
