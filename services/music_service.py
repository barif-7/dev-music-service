from __future__ import annotations

import threading
import time
from urllib.parse import urlencode

import yt_dlp

from models import BrowserPlaybackState, SongSearchResult


class MusicServiceError(Exception):
    pass


class SearchServiceError(MusicServiceError):
    pass


class StreamResolutionError(MusicServiceError):
    pass


class MusicService:
    _cache_lock = threading.Lock()
    _search_cache: dict[str, tuple[list[dict], float]] = {}
    _stream_cache: dict[str, tuple[tuple[str, dict[str, str]], float]] = {}
    _SEARCH_TTL_SECONDS = 300
    _STREAM_TTL_SECONDS = 600

    @staticmethod
    def _normalize_query(query: str) -> str:
        return " ".join(query.split()).lower()

    @staticmethod
    def _cache_get(cache: dict, key):
        now = time.monotonic()
        with MusicService._cache_lock:
            entry = cache.get(key)
            if not entry:
                return None

            value, expires_at = entry
            if expires_at <= now:
                cache.pop(key, None)
                return None

            return value

    @staticmethod
    def _cache_set(cache: dict, key, value, ttl_seconds: int):
        with MusicService._cache_lock:
            cache[key] = (value, time.monotonic() + ttl_seconds)
        return value

    @staticmethod
    def _search_entries(query: str, limit: int = 5) -> list[dict]:
        cache_key = MusicService._normalize_query(query)
        cached = MusicService._cache_get(MusicService._search_cache, cache_key)
        if cached is not None and len(cached) >= limit:
            return cached[:limit]

        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "noplaylist": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch{max(1, limit)}:{query}", download=False)
        except Exception as exc:
            raise SearchServiceError(f"Search failed for query '{query}'") from exc

        entries = [entry for entry in (info.get("entries") or []) if entry]
        return MusicService._cache_set(
            MusicService._search_cache,
            cache_key,
            entries,
            MusicService._SEARCH_TTL_SECONDS,
        )[:limit]

    @staticmethod
    def search(query: str, limit: int = 5) -> list[SongSearchResult]:
        results: list[SongSearchResult] = []
        for entry in MusicService._search_entries(query, limit=limit):
            webpage_url = entry.get("webpage_url")
            if not webpage_url:
                continue

            results.append(
                SongSearchResult(
                    title=entry.get("title", "Unknown Title"),
                    webpage_url=webpage_url,
                    stream_url=f"/stream?{urlencode({'url': webpage_url})}",
                    duration=entry.get("duration") or 0,
                )
            )

        return results

    @staticmethod
    def first_result(query: str) -> SongSearchResult:
        results = MusicService.search(query, limit=1)
        if not results:
            raise SearchServiceError(f"No results found for '{query}'")

        return results[0]

    @staticmethod
    def build_browser_state(webpage_url: str, title: str, duration: int = 0) -> BrowserPlaybackState:
        return BrowserPlaybackState(
            title=title,
            duration=duration,
            webpage_url=webpage_url,
            stream_url=f"/stream?{urlencode({'url': webpage_url})}",
        )

    @staticmethod
    def _extract_audio_source(webpage_url: str) -> tuple[str, dict[str, str]]:
        cached = MusicService._cache_get(MusicService._stream_cache, webpage_url)
        if cached is not None:
            direct_url, headers = cached
            return direct_url, dict(headers)

        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "noplaylist": True,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android"],
                }
            },
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(webpage_url, download=False)
        except Exception as exc:
            raise StreamResolutionError(f"Could not resolve stream for {webpage_url}") from exc

        direct_url = info.get("url")
        if not direct_url:
            raise StreamResolutionError("Failed to extract audio URL")

        headers = info.get("http_headers") or {}
        cached_value = (direct_url, dict(headers))
        MusicService._cache_set(
            MusicService._stream_cache,
            webpage_url,
            cached_value,
            MusicService._STREAM_TTL_SECONDS,
        )
        return direct_url, dict(headers)

    @staticmethod
    def ffmpeg_http_args(headers: dict[str, str], referer: str) -> list[str]:
        args: list[str] = []

        user_agent = headers.get("User-Agent")
        if user_agent:
            args.extend(["-user_agent", user_agent])

        if referer:
            args.extend(["-referer", referer])

        custom_headers = []
        for key, value in headers.items():
            if key.lower() in {"user-agent", "referer"}:
                continue
            custom_headers.append(f"{key}: {value}")

        if custom_headers:
            args.extend(["-headers", "\r\n".join(custom_headers) + "\r\n"])

        return args

    @staticmethod
    def resolve_stream_url(webpage_url: str) -> str:
        direct_url, _headers = MusicService._extract_audio_source(webpage_url)
        return direct_url
