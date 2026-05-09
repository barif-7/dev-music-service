from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from models import LyricsLine, LyricsResponse
from services.music_service import MusicServiceError

_TIMESTAMP_RE = re.compile(r"\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]")


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
        return os.getenv(
            "LRCLIB_USER_AGENT",
            "dev-music-service/1.0 (lyrics integration; contact: unset)",
        )

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
            with urlopen(request, timeout=10) as response:
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
