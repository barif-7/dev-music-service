from __future__ import annotations

import json
import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from config import get_settings
from models import LyricsLine, LyricsResponse
from services.lyrics_localization_service import LyricsLocalizationService
from services.music_service import MusicServiceError
from services.text_match import combined_score

_TIMESTAMP_RE = re.compile(r"\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]")
logger = logging.getLogger(__name__)


class LyricsServiceError(MusicServiceError):
    pass


class LyricsRequestError(LyricsServiceError):
    pass


class LyricsNotFoundError(LyricsServiceError):
    pass


class LyricsProviderError(LyricsServiceError):
    pass


@dataclass(frozen=True)
class _LyricsQuery:
    title: str
    artist: str
    album: str | None
    duration: int | None


class LyricsService:
    _cache_lock = threading.Lock()
    _lyrics_cache: dict[tuple[str, str, str | None, int | None], tuple[LyricsResponse, float]] = {}
    # Line-level localized cache: (base_key, locale) -> {line_index: localized_text}.
    # Filled incrementally by the inline first window, the background fill thread,
    # and just-in-time window requests, so re-requests are served from memory.
    _localized_cache: dict[tuple, dict[int, str]] = {}
    _localized_expiry: dict[tuple, float] = {}
    _localized_inflight: set[tuple] = set()
    _LYRICS_TTL_SECONDS = 3600
    _BASE_URL = "https://lrclib.net/api"

    @staticmethod
    def _normalize_text(value: str) -> str:
        return " ".join(value.split())

    @staticmethod
    def _cache_key(query: _LyricsQuery) -> tuple[str, str, str | None, int | None]:
        return (
            LyricsService._normalize_text(query.title).lower(),
            LyricsService._normalize_text(query.artist).lower(),
            LyricsService._normalize_text(query.album).lower() if query.album else None,
            query.duration,
        )

    @staticmethod
    def _cache_get(key: tuple[str, str, str | None, int | None]) -> LyricsResponse | None:
        now = time.monotonic()
        with LyricsService._cache_lock:
            entry = LyricsService._lyrics_cache.get(key)
            if not entry:
                return None

            value, expires_at = entry
            if expires_at <= now:
                LyricsService._lyrics_cache.pop(key, None)
                return None

            return value

    @staticmethod
    def _cache_set(
        key: tuple[str, str, str | None, int | None], value: LyricsResponse
    ) -> LyricsResponse:
        with LyricsService._cache_lock:
            LyricsService._lyrics_cache[key] = (
                value,
                time.monotonic() + LyricsService._LYRICS_TTL_SECONDS,
            )
        return value

    @staticmethod
    def _user_agent() -> str:
        return get_settings().lrclib_user_agent

    @staticmethod
    def _request_json(path: str, params: dict[str, Any]) -> dict[str, Any]:
        query_string = urlencode({key: value for key, value in params.items() if value is not None})
        request = Request(
            f"{LyricsService._BASE_URL}{path}?{query_string}",
            headers={
                "Accept": "application/json",
                "User-Agent": LyricsService._user_agent(),
            },
        )

        try:
            with urlopen(request, timeout=10) as response:  # nosec B310
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code == 404:
                raise LyricsNotFoundError("Lyrics not found") from exc
            raise LyricsProviderError(f"LRCLIB request failed with status {exc.code}") from exc
        except URLError as exc:
            raise LyricsProviderError("Could not reach LRCLIB") from exc
        except json.JSONDecodeError as exc:
            raise LyricsProviderError("LRCLIB returned invalid JSON") from exc

    @staticmethod
    def _request_json_list(path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        query_string = urlencode({key: value for key, value in params.items() if value is not None})
        request = Request(
            f"{LyricsService._BASE_URL}{path}?{query_string}",
            headers={
                "Accept": "application/json",
                "User-Agent": LyricsService._user_agent(),
            },
        )
        try:
            with urlopen(request, timeout=10) as response:  # nosec B310
                data = json.loads(response.read().decode("utf-8"))
                return data if isinstance(data, list) else []
        except (HTTPError, URLError, json.JSONDecodeError):
            return []

    @staticmethod
    def _search_fallback(query: _LyricsQuery) -> dict[str, Any]:
        results = LyricsService._request_json_list(
            "/search",
            {"q": f"{query.artist} {query.title}"},
        )
        if not results:
            raise LyricsNotFoundError("Lyrics not found")

        def score(item: dict[str, Any]) -> float:
            title = item.get("trackName") or ""
            artist = item.get("artistName") or ""
            match = combined_score(f"{query.artist} {query.title}", title, artist)
            has_synced = 5.0 if item.get("syncedLyrics") else 0.0
            dur_penalty = 0.0
            if query.duration and item.get("duration"):
                diff = abs(int(item["duration"]) - query.duration)
                if diff > 5:
                    dur_penalty = min(15.0, diff * 0.5)
            return match + has_synced - dur_penalty

        best = max(results, key=score)
        if combined_score(f"{query.artist} {query.title}", best.get("trackName") or "", best.get("artistName") or "") < 40:
            raise LyricsNotFoundError("Lyrics not found")
        return best

    @staticmethod
    def _parse_fraction_to_ms(fraction: str | None) -> int:
        if not fraction:
            return 0
        if len(fraction) == 1:
            return int(fraction) * 100
        if len(fraction) == 2:
            return int(fraction) * 10
        return int(fraction[:3])

    @staticmethod
    def _timestamp_to_ms(minutes: str, seconds: str, fraction: str | None) -> int:
        return (int(minutes) * 60 * 1000) + (int(seconds) * 1000) + LyricsService._parse_fraction_to_ms(
            fraction
        )

    @staticmethod
    def _parse_synced_lyrics(lrc_text: str) -> list[LyricsLine]:
        parsed_lines: list[LyricsLine] = []

        for raw_line in lrc_text.splitlines():
            matches = list(_TIMESTAMP_RE.finditer(raw_line))
            if not matches:
                continue

            text = _TIMESTAMP_RE.sub("", raw_line).strip()
            if not text:
                continue

            for match in matches:
                start_time_ms = LyricsService._timestamp_to_ms(
                    match.group(1), match.group(2), match.group(3)
                )
                parsed_lines.append(LyricsLine(text=text, start_time_ms=start_time_ms))

        parsed_lines.sort(key=lambda line: (line.start_time_ms or 0, line.text))
        for index, line in enumerate(parsed_lines[:-1]):
            next_line = parsed_lines[index + 1]
            line.end_time_ms = next_line.start_time_ms

        return parsed_lines

    @staticmethod
    def _parse_plain_lyrics(plain_text: str) -> list[LyricsLine]:
        return [LyricsLine(text=line.strip()) for line in plain_text.splitlines() if line.strip()]

    @staticmethod
    def _build_response(payload: dict[str, Any], query: _LyricsQuery) -> LyricsResponse:
        synced_lyrics = payload.get("syncedLyrics")
        plain_lyrics = payload.get("plainLyrics")
        instrumental = bool(payload.get("instrumental"))

        lines: list[LyricsLine] = []
        synced = False
        if synced_lyrics:
            lines = LyricsService._parse_synced_lyrics(synced_lyrics)
            synced = bool(lines)
        if not synced and plain_lyrics:
            lines = LyricsService._parse_plain_lyrics(plain_lyrics)

        return LyricsResponse(
            title=payload.get("trackName") or query.title,
            artist=payload.get("artistName") or query.artist,
            album=payload.get("albumName") or query.album,
            duration=payload.get("duration") or query.duration,
            instrumental=instrumental,
            synced=synced,
            plain_lyrics=plain_lyrics,
            synced_lyrics=synced_lyrics,
            lines=lines,
        )

    @staticmethod
    def _unavailable_response(query: _LyricsQuery, exc: Exception) -> LyricsResponse:
        """Return an empty successful payload so the UI can try transcription.

        LRCLIB is an upstream lyrics provider, not the whole lyrics experience.
        When it is unreachable, the frontend can still fall through to
        /api/lyrics/transcribe if this endpoint returns an empty 200 response.
        """
        logger.warning("lrclib_unavailable: %s", exc)
        return LyricsResponse(
            provider="lrclib_unavailable",
            title=query.title,
            artist=query.artist,
            album=query.album,
            duration=query.duration,
            lines=[],
        )

    @staticmethod
    def get_lyrics(
        title: str,
        artist: str,
        album: str | None = None,
        duration: int | None = None,
    ) -> LyricsResponse:
        normalized_title = LyricsService._normalize_text(title)
        normalized_artist = LyricsService._normalize_text(artist)
        normalized_album = LyricsService._normalize_text(album) if album else None

        if not normalized_title:
            raise LyricsRequestError("title is required")
        if not normalized_artist:
            raise LyricsRequestError("artist is required")
        if duration is not None and duration < 0:
            raise LyricsRequestError("duration must be non-negative")

        query = _LyricsQuery(
            title=normalized_title,
            artist=normalized_artist,
            album=normalized_album,
            duration=duration,
        )
        cache_key = LyricsService._cache_key(query)
        cached = LyricsService._cache_get(cache_key)
        if cached is not None:
            return cached

        provider_error: LyricsProviderError | None = None
        try:
            payload = LyricsService._request_json(
                "/get",
                {
                    "track_name": query.title,
                    "artist_name": query.artist,
                    "album_name": query.album,
                    "duration": query.duration,
                },
            )
            return LyricsService._cache_set(cache_key, LyricsService._build_response(payload, query))
        except LyricsNotFoundError:
            pass
        except LyricsProviderError as exc:
            provider_error = exc

        try:
            payload = LyricsService._search_fallback(query)
        except LyricsNotFoundError:
            if provider_error is not None:
                return LyricsService._unavailable_response(query, provider_error)
            raise
        return LyricsService._cache_set(cache_key, LyricsService._build_response(payload, query))

    # ── Live (windowed) localization ────────────────────────────────────────

    @staticmethod
    def _base_key(
        title: str, artist: str, album: str | None, duration: int | None
    ) -> tuple[str, str, str | None, int | None]:
        return LyricsService._cache_key(
            _LyricsQuery(
                title=LyricsService._normalize_text(title),
                artist=LyricsService._normalize_text(artist),
                album=LyricsService._normalize_text(album) if album else None,
                duration=duration,
            )
        )

    @staticmethod
    def _localized_map(loc_key: tuple) -> dict[int, str]:
        """Return the cached {index: localized_text} map for a (track, locale),
        evicting it once stale. Always returns a fresh dict copy."""
        now = time.monotonic()
        with LyricsService._cache_lock:
            expires_at = LyricsService._localized_expiry.get(loc_key, 0.0)
            if expires_at <= now:
                LyricsService._localized_cache.pop(loc_key, None)
                LyricsService._localized_expiry.pop(loc_key, None)
                return {}
            return dict(LyricsService._localized_cache.get(loc_key, {}))

    @staticmethod
    def _store_localized(loc_key: tuple, mapping: dict[int, str]) -> None:
        if not mapping:
            return
        with LyricsService._cache_lock:
            current = LyricsService._localized_cache.setdefault(loc_key, {})
            current.update(mapping)
            LyricsService._localized_expiry[loc_key] = (
                time.monotonic() + LyricsService._LYRICS_TTL_SECONDS
            )

    @staticmethod
    def _apply_localized(response: LyricsResponse, mapping: dict[int, str], locale: str) -> LyricsResponse:
        lines = [
            line.model_copy(update={"localized_text": mapping.get(index) or line.localized_text})
            for index, line in enumerate(response.lines)
        ]
        return response.model_copy(update={"lines": lines, "target_locale": locale})

    @staticmethod
    def _background_fill(
        loc_key: tuple,
        lines: list[LyricsLine],
        locale: str,
        already: set[int],
        song_context: dict,
    ) -> None:
        """Translate every still-untranslated line into the cache, in chunks, so
        later just-in-time windows are cache hits. Runs on a daemon thread."""
        try:
            chunk = max(1, get_settings().lyrics_localize_window)
            pending = [i for i in range(len(lines)) if i not in already]
            for start in range(0, len(pending), chunk):
                indices = pending[start:start + chunk]
                mapping = LyricsLocalizationService.localize_subset(
                    lines, indices, locale, song_context=song_context
                )
                LyricsService._store_localized(loc_key, mapping)
        finally:
            with LyricsService._cache_lock:
                LyricsService._localized_inflight.discard(loc_key)

    @staticmethod
    def _start_background_fill(
        loc_key: tuple,
        lines: list[LyricsLine],
        locale: str,
        already: set[int],
        song_context: dict,
    ) -> None:
        if not get_settings().lyrics_localize_background_fill:
            return
        if len(already) >= len(lines):
            return
        with LyricsService._cache_lock:
            if loc_key in LyricsService._localized_inflight:
                return
            LyricsService._localized_inflight.add(loc_key)
        thread = threading.Thread(
            target=LyricsService._background_fill,
            args=(loc_key, lines, locale, set(already), dict(song_context)),
            daemon=True,
        )
        thread.start()

    @staticmethod
    def localize_window(
        title: str,
        artist: str,
        album: str | None,
        duration: int | None,
        locale: str,
        items: list[tuple[int, str] | tuple[int, str, int | None, int | None]],
        *,
        section: str | None = None,
        bpm: int | None = None,
        mood: list[str] | None = None,
        preserve_singability: bool = True,
        preserve_repetition: bool = True,
    ) -> dict[int, str]:
        """Return localized text for the requested ``(index, text)`` lines only.

        Serves cached translations immediately and translates any missing lines
        just-in-time, storing them for reuse under the same (track, locale) key
        the eager path uses. Carrying the source text means this works for both
        LRC and transcribed lyrics. This is the per-playhead window path the
        frontend calls as the song advances.
        """
        if not locale or not items:
            return {}

        loc_key = (LyricsService._base_key(title, artist, album, duration), locale)
        cached = LyricsService._localized_map(loc_key)
        song_context = LyricsLocalizationService.build_song_context(
            title=title,
            artist=artist,
            album=album,
            duration=duration,
            section=section,
            bpm=bpm,
            mood=mood or [],
            preserve_singability=preserve_singability,
            preserve_repetition=preserve_repetition,
        )

        result: dict[int, str] = {}
        missing: list[tuple[int, str] | tuple[int, str, int | None, int | None]] = []
        seen: set[int] = set()
        for item in items:
            index = item[0]
            if index in seen:
                continue
            seen.add(index)
            if index in cached:
                result[index] = cached[index]
            else:
                missing.append(item)

        if missing:
            fresh = LyricsLocalizationService.localize_items(
                missing, locale, song_context=song_context
            )
            LyricsService._store_localized(loc_key, fresh)
            result.update(fresh)
        return result

    @staticmethod
    def get_localized_lyrics(
        title: str,
        artist: str,
        album: str | None = None,
        duration: int | None = None,
        locale: str | None = None,
    ) -> LyricsResponse:
        """Fetch lyrics and, when a locale is given, attach localized lines.

        Only the first window of lines is translated inline so the response
        returns quickly; the remainder is filled in the background and served
        just-in-time via :meth:`localize_window`. Already-cached translations are
        applied immediately.
        """
        response = LyricsService.get_lyrics(title, artist, album, duration)
        if not locale or not response.lines:
            return response

        loc_key = (LyricsService._base_key(title, artist, album, duration), locale)
        cached = LyricsService._localized_map(loc_key)
        song_context = LyricsLocalizationService.build_song_context(
            title=response.title,
            artist=response.artist,
            album=response.album,
            duration=response.duration,
        )

        window = max(0, get_settings().lyrics_localize_window)
        first = [i for i in range(min(window, len(response.lines))) if i not in cached]
        if first:
            fresh = LyricsLocalizationService.localize_subset(
                response.lines, first, locale, song_context=song_context
            )
            LyricsService._store_localized(loc_key, fresh)
            cached.update(fresh)

        LyricsService._start_background_fill(
            loc_key, response.lines, locale, set(cached), song_context
        )
        return LyricsService._apply_localized(response, cached, locale)
