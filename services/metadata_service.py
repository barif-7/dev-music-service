from __future__ import annotations

import asyncio
import functools
import re
import threading
import time

import certifi
import httpx

from models import AutocompleteSuggestion
from services.text_match import combined_score, fuzzy_score, normalize


class MetadataServiceError(Exception):
    pass


class MetadataService:
    _cache_lock = threading.Lock()
    _request_lock = asyncio.Lock()
    _autocomplete_cache: dict[str, tuple[list[AutocompleteSuggestion], float]] = {}
    _author_index: dict[str, list[AutocompleteSuggestion]] = {}
    _last_request_at = 0.0
    _CACHE_TTL_SECONDS = 900
    _AUTHOR_INDEX_MAX = 500
    _MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2/recording/"
    _USER_AGENT = "dev-music-service/1.0 (https://github.com/barif-7/dev-music-service)"
    _mb_client: httpx.AsyncClient | None = None

    @staticmethod
    def _normalize(value: str) -> str:
        return " ".join(value.split()).lower()

    @staticmethod
    @functools.lru_cache(maxsize=512)
    def _tokens(value: str | None) -> frozenset[str]:
        if not value:
            return frozenset()
        return frozenset(token for token in re.split(r"[^a-z0-9']+", value.lower()) if len(token) > 1)

    @staticmethod
    def _cache_get(key: str) -> list[AutocompleteSuggestion] | None:
        now = time.monotonic()
        with MetadataService._cache_lock:
            entry = MetadataService._autocomplete_cache.get(key)
            if not entry:
                return None

            value, expires_at = entry
            if expires_at <= now:
                MetadataService._autocomplete_cache.pop(key, None)
                return None

            return value

    @staticmethod
    def _cache_set(key: str, value: list[AutocompleteSuggestion]) -> list[AutocompleteSuggestion]:
        with MetadataService._cache_lock:
            MetadataService._autocomplete_cache[key] = (
                value,
                time.monotonic() + MetadataService._CACHE_TTL_SECONDS,
            )
        return value

    @staticmethod
    def _musicbrainz_ready() -> bool:
        now = time.monotonic()
        return (now - MetadataService._last_request_at) >= 1.05

    @staticmethod
    async def _throttle_musicbrainz_request() -> None:
        async with MetadataService._request_lock:
            now = time.monotonic()
            wait_seconds = 1.05 - (now - MetadataService._last_request_at)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
            MetadataService._last_request_at = time.monotonic()

    @classmethod
    def _get_mb_client(cls) -> httpx.AsyncClient:
        if cls._mb_client is None or cls._mb_client.is_closed:
            cls._mb_client = httpx.AsyncClient(
                verify=certifi.where(),
                timeout=4.0,
                headers={
                    "Accept": "application/json",
                    "User-Agent": cls._USER_AGENT,
                },
            )
        return cls._mb_client

    @staticmethod
    async def _musicbrainz_json(url: str, params: dict[str, str | int]) -> dict:
        await MetadataService._throttle_musicbrainz_request()
        try:
            client = MetadataService._get_mb_client()
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            raise MetadataServiceError(
                f"MusicBrainz request to {url} failed with {exc.response.status_code}: {exc.response.text}"
            ) from exc

    @staticmethod
    def _artist_credit_name(artist_credit: list[dict] | None) -> str | None:
        if not artist_credit:
            return None

        parts: list[str] = []
        for credit in artist_credit:
            name = credit.get("name") or (credit.get("artist") or {}).get("name")
            if name:
                parts.append(name)
            join_phrase = credit.get("joinphrase")
            if join_phrase:
                parts.append(join_phrase)

        value = "".join(parts).strip()
        return value or None

    @staticmethod
    def _release_year(date_value: str | None) -> int | None:
        if isinstance(date_value, str) and len(date_value) >= 4 and date_value[:4].isdigit():
            return int(date_value[:4])
        return None

    @staticmethod
    def _duration_seconds(length_ms: int | str | None) -> int:
        if not length_ms:
            return 0
        try:
            return round(int(length_ms) / 1000)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _is_compilation_release(release: dict) -> bool:
        release_group = release.get("release-group") or {}
        secondary_types = set(release_group.get("secondary-types") or [])
        artist_credit = MetadataService._artist_credit_name(release.get("artist-credit"))
        return (
            "Compilation" in secondary_types
            or "DJ-mix" in secondary_types
            or artist_credit == "Various Artists"
        )

    @staticmethod
    def _best_release(releases: list[dict] | None, recording_artist: str | None = None) -> dict:
        if not releases:
            return {}

        direct_releases = [release for release in releases if not MetadataService._is_compilation_release(release)]
        if not direct_releases:
            return {}

        def score(release: dict) -> tuple[int, str]:
            release_group = release.get("release-group") or {}
            primary_type = release_group.get("primary-type") or ""
            status = release.get("status") or ""
            date_value = release.get("date") or ""
            artist_credit = MetadataService._artist_credit_name(release.get("artist-credit"))
            type_score = {"Album": 4, "Single": 3, "EP": 2}.get(primary_type, 1)
            status_score = 2 if status == "Official" else 0
            artist_score = 3 if recording_artist and artist_credit == recording_artist else 0
            return type_score + status_score + artist_score, date_value

        return max(direct_releases, key=score)

    @staticmethod
    def _cover_art_url(release: dict) -> str | None:
        release_group = release.get("release-group") or {}
        release_group_id = release_group.get("id")
        if release_group_id:
            return f"https://coverartarchive.org/release-group/{release_group_id}/front-250"

        release_id = release.get("id")
        if release_id:
            return f"https://coverartarchive.org/release/{release_id}/front-250"

        return None

    @staticmethod
    def _artwork_confidence(release: dict) -> str | None:
        if not release:
            return None

        release_group = release.get("release-group") or {}
        primary_type = release_group.get("primary-type")
        if primary_type == "Album":
            return "album"
        if primary_type in {"Single", "EP"}:
            return primary_type.lower()
        return "release"

    @staticmethod
    def _safe_musicbrainz_phrase(value: str) -> str:
        return value.replace('"', "").strip()

    @staticmethod
    async def _recording_search(search_query: str, limit: int) -> list[dict]:
        payload = await MetadataService._musicbrainz_json(
            MetadataService._MUSICBRAINZ_URL,
            {"query": search_query, "fmt": "json", "limit": max(1, min(limit, 10))},
        )
        return payload.get("recordings") or []

    @staticmethod
    def _autocomplete_search_query(query: str) -> str:
        words = query.split()
        if len(words) < 3:
            return query

        clauses = [f'"{MetadataService._safe_musicbrainz_phrase(query)}"']
        max_artist_words = min(3, len(words) - 1)
        for size in range(1, max_artist_words + 1):
            artist = " ".join(words[:size])
            title = " ".join(words[size:])
            clauses.append(
                f'(artist:"{MetadataService._safe_musicbrainz_phrase(artist)}" AND recording:"{MetadataService._safe_musicbrainz_phrase(title)}")'
            )

        return " OR ".join(clauses)

    @staticmethod
    def _confidence(recording: dict, release: dict, query: str | None = None) -> int:
        # Blend MusicBrainz Lucene score (0-100) with a rapidfuzz match between
        # the normalized query and "artist title". Lucene catches popularity /
        # field-match strength; fuzzy catches the actual identity match the
        # user typed (handles "(Remastered ...)" etc. via normalization).
        lucene = int(recording.get("score") or 0)
        title = recording.get("title")
        artist = MetadataService._artist_credit_name(recording.get("artist-credit"))

        fuzzy = combined_score(query or "", title, artist) if query else 0.0
        # 60% lucene, 40% fuzzy — lucene anchors popularity ordering, fuzzy
        # promotes identity matches above mere keyword overlap.
        score = 0.6 * lucene + 0.4 * fuzzy

        if release.get("title"):
            score += 3
        else:
            score -= 6
        if not artist:
            score -= 8
        if not recording.get("length"):
            score -= 3
        return max(0, min(100, int(round(score))))

    @staticmethod
    def _suggestion_from_recording(recording: dict, query: str | None = None) -> AutocompleteSuggestion | None:
        title = recording.get("title")
        if not title:
            return None

        artist = MetadataService._artist_credit_name(recording.get("artist-credit"))
        release = MetadataService._best_release(recording.get("releases"), artist)
        release_group = release.get("release-group") or {}
        album = release_group.get("title") or release.get("title")
        release_year = MetadataService._release_year(release.get("date"))
        display_query = f"{artist} - {title}" if artist else title

        return AutocompleteSuggestion(
            title=title,
            query=display_query,
            artist=artist,
            album=album,
            thumbnail=MetadataService._cover_art_url(release),
            artwork_source="cover_art_archive" if release else None,
            artwork_confidence=MetadataService._artwork_confidence(release),
            release_year=release_year,
            duration=MetadataService._duration_seconds(recording.get("length")),
            confidence=MetadataService._confidence(recording, release, query),
            recording_mbid=recording.get("id"),
            release_mbid=release.get("id"),
        )

    @staticmethod
    def _suggestion_rank(suggestion: AutocompleteSuggestion, query: str) -> tuple[float, int, int]:
        # Primary: fuzzy combined match of "artist title" against query.
        # Tie-breakers: confidence, then prefer shorter normalized titles
        # (less likely to be a long live/edit variant).
        combined = combined_score(query, suggestion.title, suggestion.artist)
        norm_title_len = len(normalize(suggestion.title))
        return (combined, suggestion.confidence, -norm_title_len)

    @staticmethod
    def _index_authors(suggestions: list[AutocompleteSuggestion]) -> None:
        with MetadataService._cache_lock:
            # Evict oldest keys if the index exceeds the total size cap
            if len(MetadataService._author_index) > MetadataService._AUTHOR_INDEX_MAX:
                excess = len(MetadataService._author_index) - MetadataService._AUTHOR_INDEX_MAX + 50
                for key in list(MetadataService._author_index.keys())[:excess]:
                    del MetadataService._author_index[key]

            for suggestion in suggestions:
                if not suggestion.artist:
                    continue
                key = MetadataService._normalize(suggestion.artist)
                current = MetadataService._author_index.setdefault(key, [])
                existing = {MetadataService._normalize(item.query) for item in current}
                if MetadataService._normalize(suggestion.query) not in existing:
                    current.append(suggestion)
                current.sort(key=lambda item: item.confidence, reverse=True)
                del current[10:]

    @staticmethod
    def _author_index_matches(query: str, limit: int) -> list[AutocompleteSuggestion]:
        normalized = MetadataService._normalize(query)
        if len(normalized) < 2:
            return []

        with MetadataService._cache_lock:
            matches: list[AutocompleteSuggestion] = []
            seen: set[str] = set()
            for author, suggestions in MetadataService._author_index.items():
                if normalized not in author:
                    continue
                for suggestion in suggestions:
                    key = MetadataService._normalize(suggestion.query)
                    if key in seen:
                        continue
                    seen.add(key)
                    matches.append(suggestion)
            matches.sort(key=lambda item: item.confidence, reverse=True)
            return matches[:limit]

    @staticmethod
    async def _autocomplete_recordings(query: str, limit: int) -> list[dict]:
        recordings = await MetadataService._recording_search(MetadataService._autocomplete_search_query(query), limit)
        if recordings:
            return recordings

        # Fielded fallback helps explicit "artist - title" searches without paying
        # the artist endpoint cost on every keystroke.
        parts = [part.strip() for part in re.split(r"\s+-\s+|\s+by\s+", query, maxsplit=1, flags=re.IGNORECASE)]
        if len(parts) != 2 or not all(parts):
            return []

        artist, title = parts
        return await MetadataService._recording_search(
            f'artist:"{MetadataService._safe_musicbrainz_phrase(artist)}" AND recording:"{MetadataService._safe_musicbrainz_phrase(title)}"',
            limit,
        )

    @staticmethod
    def _suggestion_from_spotify_track(item: dict, query: str | None = None) -> AutocompleteSuggestion | None:
        title = item.get("name")
        if not title:
            return None

        artists = [a.get("name") for a in (item.get("artists") or []) if a.get("name")]
        artist = ", ".join(artists) if artists else None
        album_obj = item.get("album") or {}
        images = album_obj.get("images") or []
        # Spotify ships 640/300/64 — pick the middle if present.
        thumb = None
        if images:
            thumb = next(
                (img.get("url") for img in images if 200 <= (img.get("width") or 0) <= 400),
                images[0].get("url"),
            )

        release_year = MetadataService._release_year(album_obj.get("release_date"))
        duration = int(round((item.get("duration_ms") or 0) / 1000))
        display_query = f"{artist} - {title}" if artist else title

        # Spotify popularity is 0-100; treat as a confidence anchor and blend
        # with fuzzy identity match against the user's query.
        popularity = int(item.get("popularity") or 0)
        fuzzy = combined_score(query or "", title, artist) if query else 0.0
        confidence = max(0, min(100, int(round(0.55 * popularity + 0.45 * fuzzy))))

        return AutocompleteSuggestion(
            title=title,
            query=display_query,
            artist=artist,
            album=album_obj.get("name"),
            thumbnail=thumb,
            artwork_source="spotify" if thumb else None,
            artwork_confidence="album" if thumb else None,
            release_year=release_year,
            duration=duration,
            confidence=confidence,
            source="spotify",
        )

    @staticmethod
    def _fuse_candidates(
        primary: list[AutocompleteSuggestion],
        secondary: list[AutocompleteSuggestion],
    ) -> list[AutocompleteSuggestion]:
        """Merge two candidate lists keyed on normalized (artist, title).
        When a candidate appears in both sources, keep the richer record
        (prefer Spotify metadata + artwork) and bump confidence."""
        def key(s: AutocompleteSuggestion) -> tuple[str, str]:
            return (normalize(s.artist), normalize(s.title))

        index: dict[tuple[str, str], AutocompleteSuggestion] = {key(s): s for s in primary}

        for s in secondary:
            k = key(s)
            existing = index.get(k)
            if existing is None:
                index[k] = s
                continue

            # Same track surfaced from two sources — high confidence signal.
            # Prefer Spotify's record for thumbnail/album/year if available,
            # but keep MusicBrainz MBIDs for downstream lookups.
            if s.source == "spotify" and existing.source != "spotify":
                merged_source = "spotify+musicbrainz"
                base = s
                back = existing
            elif existing.source == "spotify" and s.source != "spotify":
                merged_source = "spotify+musicbrainz"
                base = existing
                back = s
            else:
                merged_source = existing.source
                base = existing
                back = s

            boosted = max(existing.confidence, s.confidence) + 12
            index[k] = base.model_copy(
                update={
                    "confidence": min(100, boosted),
                    "source": merged_source,
                    "recording_mbid": base.recording_mbid or back.recording_mbid,
                    "release_mbid": base.release_mbid or back.release_mbid,
                    "duration": base.duration or back.duration,
                    "release_year": base.release_year or back.release_year,
                    "album": base.album or back.album,
                    "thumbnail": base.thumbnail or back.thumbnail,
                    "artwork_source": base.artwork_source or back.artwork_source,
                    "artwork_confidence": base.artwork_confidence or back.artwork_confidence,
                }
            )

        return list(index.values())

    @staticmethod
    async def _spotify_candidates(token: str, query: str, limit: int) -> list[AutocompleteSuggestion]:
        try:
            items = await MetadataService._spotify_search(token, query, limit)
        except Exception:
            return []
        suggestions = []
        seen: set[tuple[str, str]] = set()
        for item in items:
            suggestion = MetadataService._suggestion_from_spotify_track(item, query)
            if not suggestion:
                continue
            key = (normalize(suggestion.artist), normalize(suggestion.title))
            if key in seen:
                continue
            seen.add(key)
            suggestions.append(suggestion)
        return suggestions

    @staticmethod
    async def _spotify_search(token: str, query: str, limit: int) -> list[dict]:
        # Imported lazily to avoid a circular import: spotify_import_service
        # depends on the MusicBrainz matcher which lives alongside this module.
        from services.spotify_import_service import SpotifyImportService

        return await SpotifyImportService.search_tracks(token, query, limit)

    @staticmethod
    async def autocomplete(
        query: str,
        limit: int = 6,
        spotify_token: str | None = None,
    ) -> list[AutocompleteSuggestion]:
        normalized = MetadataService._normalize(query)
        if len(normalized) < 2:
            return []

        # Cache key encodes whether Spotify was queried so a connected user
        # doesn't get a stale MB-only result.
        cache_key = f"{normalized}|spotify" if spotify_token else normalized
        cached = MetadataService._cache_get(cache_key)
        if cached is not None:
            return cached[:limit]

        oversample = max(limit, 8)

        if spotify_token:
            spotify_task = MetadataService._spotify_candidates(spotify_token, query, oversample)
            if MetadataService._musicbrainz_ready():
                mb_coro = MetadataService._autocomplete_recordings(query, oversample)
                spotify_suggestions, mb_result = await asyncio.gather(
                    spotify_task, mb_coro, return_exceptions=True,
                )
            else:
                spotify_suggestions = await spotify_task
                mb_result = None
            if isinstance(spotify_suggestions, Exception):
                spotify_suggestions = []
            recordings = mb_result if isinstance(mb_result, list) else []
        else:
            mb_result = await MetadataService._autocomplete_recordings(query, oversample)
            spotify_suggestions = []
            if isinstance(mb_result, Exception):
                author_matches = MetadataService._author_index_matches(query, limit)
                if author_matches:
                    return author_matches
                raise MetadataServiceError(f"Metadata autocomplete failed for '{query}'") from mb_result
            recordings = mb_result if isinstance(mb_result, list) else []
        mb_suggestions: list[AutocompleteSuggestion] = []
        mb_seen: set[tuple[str, str]] = set()
        for recording in recordings:
            suggestion = MetadataService._suggestion_from_recording(recording, query)
            if not suggestion:
                continue
            key = (normalize(suggestion.artist), normalize(suggestion.title))
            if key in mb_seen:
                continue
            mb_seen.add(key)
            mb_suggestions.append(suggestion)

        spotify_list = spotify_suggestions if isinstance(spotify_suggestions, list) else []
        fused = MetadataService._fuse_candidates(mb_suggestions, spotify_list)

        # Index authors from MB suggestions only (Spotify lacks MBIDs).
        MetadataService._index_authors(mb_suggestions)
        indexed_matches = MetadataService._author_index_matches(query, limit)

        merged = []
        merged_seen: set[tuple[str, str]] = set()
        for suggestion in [*fused, *indexed_matches]:
            key = (normalize(suggestion.artist), normalize(suggestion.title))
            if key in merged_seen:
                continue
            merged_seen.add(key)
            merged.append(suggestion)
        merged.sort(key=lambda item: MetadataService._suggestion_rank(item, query), reverse=True)

        return MetadataService._cache_set(cache_key, merged)[:limit]
