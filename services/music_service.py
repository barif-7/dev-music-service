from __future__ import annotations

import logging
import threading
import time
from urllib.parse import urlencode

import structlog
import yt_dlp

from models import BrowserPlaybackState, SongSearchResult

logger = structlog.get_logger()


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
    _BROWSER_AUDIO_FORMAT = "bestaudio[ext=m4a]/best[ext=mp4]/bestaudio/best"

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
    def _extract_year(entry: dict) -> int | None:
        release_year = entry.get("release_year")
        if isinstance(release_year, int):
            return release_year

        upload_date = entry.get("upload_date")
        if isinstance(upload_date, str) and len(upload_date) >= 4 and upload_date[:4].isdigit():
            return int(upload_date[:4])

        release_date = entry.get("release_date")
        if isinstance(release_date, str) and len(release_date) >= 4 and release_date[:4].isdigit():
            return int(release_date[:4])

        return None

    @staticmethod
    def _album_from_entry(entry: dict) -> str | None:
        album = entry.get("album")
        if isinstance(album, str) and album.strip():
            return album.strip()

        playlist = entry.get("playlist")
        if isinstance(playlist, str) and playlist.strip():
            return playlist.strip()

        return None

    @staticmethod
    def _search_entries(query: str, limit: int = 5) -> list[dict]:
        cache_key = MusicService._normalize_query(query)
        cached = MusicService._cache_get(MusicService._search_cache, cache_key)
        if cached is not None and len(cached) >= limit:
            logger.debug("search_cache_hit", query=cache_key)
            return cached[:limit]

        ydl_opts = {
            "format": MusicService._BROWSER_AUDIO_FORMAT,
            "quiet": True,
            "noplaylist": True,
        }

        try:
            logger.debug("youtube_search_started", query=cache_key, limit=limit)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch{max(1, limit)}:{query}", download=False)
        except Exception as exc:
            logger.error("youtube_search_failed", query=cache_key, error=str(exc))
            raise SearchServiceError(f"Search failed for query '{query}'") from exc

        entries = [entry for entry in (info.get("entries") or []) if entry]
        logger.debug("youtube_search_completed", query=cache_key, results=len(entries))
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
                    album=MusicService._album_from_entry(entry),
                    artist=entry.get("artist") or entry.get("channel") or entry.get("uploader"),
                    thumbnail=entry.get("thumbnail"),
                    artwork_source="youtube" if entry.get("thumbnail") else None,
                    artwork_confidence="video" if entry.get("thumbnail") else None,
                    release_year=MusicService._extract_year(entry),
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
    def build_browser_state(
        webpage_url: str,
        title: str,
        duration: int = 0,
        album: str | None = None,
        artist: str | None = None,
        thumbnail: str | None = None,
        artwork_source: str | None = None,
        artwork_confidence: str | None = None,
        release_year: int | None = None,
    ) -> BrowserPlaybackState:
        return BrowserPlaybackState(
            title=title,
            duration=duration,
            webpage_url=webpage_url,
            stream_url=f"/stream?{urlencode({'url': webpage_url})}",
            album=album,
            artist=artist,
            thumbnail=thumbnail,
            artwork_source=artwork_source,
            artwork_confidence=artwork_confidence,
            release_year=release_year,
        )

    @staticmethod
    def _extract_audio_source(webpage_url: str) -> tuple[str, dict[str, str]]:
        cached = MusicService._cache_get(MusicService._stream_cache, webpage_url)
        if cached is not None:
            logger.debug("stream_cache_hit", url=webpage_url)
            direct_url, headers = cached
            return direct_url, dict(headers)

        ydl_opts = {
            "format": MusicService._BROWSER_AUDIO_FORMAT,
            "quiet": True,
            "noplaylist": True,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "web"],
                }
            },
        }

        try:
            logger.debug("extracting_audio_stream", url=webpage_url)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(webpage_url, download=False)
        except Exception as exc:
            logger.error("audio_extraction_failed", url=webpage_url, error=str(exc))
            raise StreamResolutionError(f"Could not resolve stream for {webpage_url}: {str(exc)}") from exc

        direct_url = info.get("url")
        if not direct_url:
            logger.error("audio_url_missing", url=webpage_url)
            raise StreamResolutionError(f"Failed to extract audio URL from {webpage_url}")

        headers = info.get("http_headers") or {}
        cached_value = (direct_url, dict(headers))
        MusicService._cache_set(
            MusicService._stream_cache,
            webpage_url,
            cached_value,
            MusicService._STREAM_TTL_SECONDS,
        )
        logger.debug("audio_stream_extracted", url=webpage_url)
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

    @staticmethod
    def get_stream_source(webpage_url: str) -> tuple[str, dict[str, str]]:
        """
        Return the direct audio URL and headers needed for streaming.
        This is used for proxying audio through the server to avoid CORS issues.
        """
        return MusicService._extract_audio_source(webpage_url)
