from __future__ import annotations

import json
import re
import ssl
import threading
import time
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import certifi

from models import AutocompleteSuggestion


class MetadataServiceError(Exception):
    pass


class MetadataService:
    _cache_lock = threading.Lock()
    _request_lock = threading.Lock()
    _autocomplete_cache: dict[str, tuple[list[AutocompleteSuggestion], float]] = {}
    _author_index: dict[str, list[AutocompleteSuggestion]] = {}
    _last_request_at = 0.0
    _CACHE_TTL_SECONDS = 900
    _MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2/recording/"
    _USER_AGENT = "dev-music-service/1.0 (https://github.com/barif-7/dev-music-service)"
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

    @staticmethod
    def _normalize(value: str) -> str:
        return " ".join(value.split()).lower()

    @staticmethod
    def _tokens(value: str | None) -> set[str]:
        if not value:
            return set()
        return {token for token in re.split(r"[^a-z0-9']+", value.lower()) if len(token) > 1}

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
    def _throttle_musicbrainz_request() -> None:
        with MetadataService._request_lock:
            now = time.monotonic()
            wait_seconds = 1.05 - (now - MetadataService._last_request_at)
            if wait_seconds > 0:
                time.sleep(wait_seconds)
            MetadataService._last_request_at = time.monotonic()

    @staticmethod
    def _musicbrainz_json(url: str, params: dict[str, str | int]) -> dict:
        request = Request(
            f"{url}?{urlencode(params)}",
            headers={
                "Accept": "application/json",
                "User-Agent": MetadataService._USER_AGENT,
            },
        )

        MetadataService._throttle_musicbrainz_request()
        try:
            with urlopen(request, timeout=4, context=MetadataService._SSL_CONTEXT) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise MetadataServiceError(f"MusicBrainz request to {url} failed with {exc.code}: {body}") from exc

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
    def _recording_search(search_query: str, limit: int) -> list[dict]:
        payload = MetadataService._musicbrainz_json(
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
    def _query_confidence_bonus(recording: dict, query: str | None) -> int:
        query_tokens = MetadataService._tokens(query)
        if not query_tokens:
            return 0

        title_tokens = MetadataService._tokens(recording.get("title"))
        artist_tokens = MetadataService._tokens(MetadataService._artist_credit_name(recording.get("artist-credit")))
        matched_title = len(query_tokens & title_tokens)
        matched_artist = len(query_tokens & artist_tokens)

        bonus = matched_title * 8 + matched_artist * 6
        if title_tokens and title_tokens <= query_tokens:
            bonus += 12
        if artist_tokens and artist_tokens <= query_tokens:
            bonus += 10
        if not matched_title:
            bonus -= 18
        return bonus

    @staticmethod
    def _confidence(recording: dict, release: dict, query: str | None = None) -> int:
        score = int(recording.get("score") or 0)
        if release.get("title"):
            score += 5
        else:
            score -= 10
        if MetadataService._artist_credit_name(recording.get("artist-credit")):
            score += 5
        if recording.get("length"):
            score += 3
        else:
            score -= 5
        score += MetadataService._query_confidence_bonus(recording, query)
        return max(0, min(100, score))

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
        query = f"{artist} - {title}" if artist else title

        return AutocompleteSuggestion(
            title=title,
            query=query,
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
    def _suggestion_rank(suggestion: AutocompleteSuggestion, query: str) -> tuple[int, int, int, int]:
        query_tokens = MetadataService._tokens(query)
        title_tokens = MetadataService._tokens(suggestion.title)
        artist_tokens = MetadataService._tokens(suggestion.artist)
        artist_matches = len(query_tokens & artist_tokens)
        title_matches = len(query_tokens & title_tokens)
        title_complete = int(bool(title_tokens) and title_tokens <= query_tokens)
        artist_complete = int(bool(artist_tokens) and artist_tokens <= query_tokens)
        return artist_matches + artist_complete, title_matches + title_complete, suggestion.confidence, -len(title_tokens)

    @staticmethod
    def _index_authors(suggestions: list[AutocompleteSuggestion]) -> None:
        with MetadataService._cache_lock:
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
    def _autocomplete_recordings(query: str, limit: int) -> list[dict]:
        recordings = MetadataService._recording_search(MetadataService._autocomplete_search_query(query), limit)
        if recordings:
            return recordings

        # Fielded fallback helps explicit "artist - title" searches without paying
        # the artist endpoint cost on every keystroke.
        parts = [part.strip() for part in re.split(r"\s+-\s+|\s+by\s+", query, maxsplit=1, flags=re.IGNORECASE)]
        if len(parts) != 2 or not all(parts):
            return []

        artist, title = parts
        return MetadataService._recording_search(
            f'artist:"{MetadataService._safe_musicbrainz_phrase(artist)}" AND recording:"{MetadataService._safe_musicbrainz_phrase(title)}"',
            limit,
        )

    @staticmethod
    def autocomplete(query: str, limit: int = 6) -> list[AutocompleteSuggestion]:
        normalized = MetadataService._normalize(query)
        if len(normalized) < 2:
            return []

        cached = MetadataService._cache_get(normalized)
        if cached is not None:
            return cached[:limit]

        try:
            recordings = MetadataService._autocomplete_recordings(query, max(limit, 8))
        except Exception as exc:
            author_matches = MetadataService._author_index_matches(query, limit)
            if author_matches:
                return author_matches
            raise MetadataServiceError(f"Metadata autocomplete failed for '{query}'") from exc

        suggestions = []
        seen: set[str] = set()
        for recording in recordings:
            suggestion = MetadataService._suggestion_from_recording(recording, query)
            if not suggestion:
                continue
            key = MetadataService._normalize(suggestion.query)
            if key in seen:
                continue
            seen.add(key)
            suggestions.append(suggestion)

        suggestions.sort(key=lambda item: MetadataService._suggestion_rank(item, query), reverse=True)
        MetadataService._index_authors(suggestions)
        indexed_matches = MetadataService._author_index_matches(query, limit)

        merged = []
        merged_seen: set[str] = set()
        for suggestion in [*indexed_matches, *suggestions]:
            key = MetadataService._normalize(suggestion.query)
            if key in merged_seen:
                continue
            merged_seen.add(key)
            merged.append(suggestion)
        merged.sort(key=lambda item: MetadataService._suggestion_rank(item, query), reverse=True)

        return MetadataService._cache_set(normalized, merged)[:limit]
