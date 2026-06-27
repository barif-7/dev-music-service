from __future__ import annotations

import threading
from urllib.parse import urlencode

from cachetools import TTLCache
import structlog
import yt_dlp

from models import VideoSearchResult

logger = structlog.get_logger()


class VideoServiceError(Exception):
    pass


class VideoSearchError(VideoServiceError):
    pass


class VideoStreamResolutionError(VideoServiceError):
    pass


class VideoService:
    _cache_lock = threading.Lock()
    _SEARCH_TTL_SECONDS = 300
    _STREAM_TTL_SECONDS = 240
    _video_search_cache: TTLCache[str, list[dict]] = TTLCache(
        maxsize=128,
        ttl=_SEARCH_TTL_SECONDS,
    )
    _video_stream_cache: TTLCache[str, tuple[str, dict[str, str]]] = TTLCache(
        maxsize=128,
        ttl=_STREAM_TTL_SECONDS,
    )

    # A plain <video src> needs one progressive file containing both audio and
    # video. Split DASH formats require a muxing or MSE layer that this endpoint
    # intentionally does not provide.
    _BROWSER_VIDEO_FORMAT = (
        "best[ext=mp4][height<=480][vcodec!=none][acodec!=none]/"
        "best[height<=480][vcodec!=none][acodec!=none]/"
        "best[ext=mp4][vcodec!=none][acodec!=none]/"
        "best[vcodec!=none][acodec!=none]"
    )
    _YOUTUBE_EXTRACTOR_ARGS = {
        "youtube": {
            "player_client": ["android", "web"],
        }
    }
    _KINDS = {"music_video", "shorts", "live"}

    @staticmethod
    def _normalize_query(query: str) -> str:
        return " ".join(query.split()).lower()

    @staticmethod
    def _cache_get(cache: dict, key):
        with VideoService._cache_lock:
            return cache.get(key)

    @staticmethod
    def _cache_set(cache: dict, key, value):
        with VideoService._cache_lock:
            cache[key] = value
        return value

    @staticmethod
    def _build_query(title: str, artist: str | None, kind: str) -> str:
        normalized_title = " ".join(title.split())
        if not normalized_title:
            raise VideoSearchError("Video title is required")
        if kind not in VideoService._KINDS:
            raise VideoSearchError(f"Unsupported video kind: {kind}")

        normalized_artist = " ".join((artist or "").split())
        base = " ".join(
            part for part in (normalized_artist, normalized_title) if part
        ).strip()
        if kind == "shorts":
            return f"{base} shorts"
        if kind == "live":
            return f"{base} live performance"
        return f"{base} official music video"

    @staticmethod
    def _score_video(entry: dict, kind: str) -> float:
        title = (entry.get("title") or "").lower()
        channel = (entry.get("channel") or entry.get("uploader") or "").lower()
        duration = entry.get("duration") or 0
        score = 0.0

        if "official" in title:
            score += 20
        if "music video" in title:
            score += 20
        if "vevo" in channel:
            score += 20
        if "official" in channel:
            score += 10

        if kind == "shorts":
            if duration and duration <= 75:
                score += 30
            if "shorts" in title or "#shorts" in title:
                score += 20
        elif duration and 90 <= duration <= 600:
            score += 15

        for unwanted in (
            "lyrics",
            "lyric video",
            "audio",
            "topic",
            "cover",
            "reaction",
            "slowed",
            "sped up",
        ):
            if unwanted in title:
                score -= 20

        return score

    @staticmethod
    def _ydl_options() -> dict:
        return {
            "format": VideoService._BROWSER_VIDEO_FORMAT,
            "quiet": True,
            "noplaylist": True,
            "extractor_args": VideoService._YOUTUBE_EXTRACTOR_ARGS,
        }

    @staticmethod
    def search(
        title: str,
        artist: str | None = None,
        kind: str = "music_video",
        limit: int = 3,
    ) -> list[VideoSearchResult]:
        query = VideoService._build_query(title, artist, kind)
        safe_limit = min(max(1, limit), 5)
        cache_key = f"{kind}:{VideoService._normalize_query(query)}:{safe_limit}"
        entries = VideoService._cache_get(VideoService._video_search_cache, cache_key)

        if entries is None:
            fetch_count = max(safe_limit * 5, 10)
            try:
                logger.debug("video_search_started", query=query, fetch=fetch_count)
                with yt_dlp.YoutubeDL(VideoService._ydl_options()) as ydl:
                    info = ydl.extract_info(
                        f"ytsearch{fetch_count}:{query}",
                        download=False,
                    )
            except Exception as exc:
                logger.error("video_search_failed", query=query, error=str(exc))
                raise VideoSearchError(f"Video search failed for '{query}'") from exc

            entries = [
                entry
                for entry in (info.get("entries") or [])
                if entry and entry.get("webpage_url")
            ]
            VideoService._cache_set(
                VideoService._video_search_cache,
                cache_key,
                entries,
            )

            for entry in entries:
                webpage_url = entry.get("webpage_url")
                direct_url = entry.get("url")
                if webpage_url and direct_url:
                    VideoService._cache_set(
                        VideoService._video_stream_cache,
                        webpage_url,
                        (direct_url, dict(entry.get("http_headers") or {})),
                    )

        ranked = sorted(
            entries,
            key=lambda entry: VideoService._score_video(entry, kind),
            reverse=True,
        )
        return [
            VideoSearchResult(
                title=entry.get("title", "Unknown Video"),
                webpage_url=entry["webpage_url"],
                video_stream_url=(
                    f"/api/video/stream?{urlencode({'url': entry['webpage_url']})}"
                ),
                duration=entry.get("duration") or 0,
                thumbnail=entry.get("thumbnail"),
                channel=entry.get("channel") or entry.get("uploader"),
                kind=kind,
                width=entry.get("width"),
                height=entry.get("height"),
            )
            for entry in ranked[:safe_limit]
        ]

    @staticmethod
    def get_video_stream_source(webpage_url: str) -> tuple[str, dict[str, str]]:
        if not webpage_url.startswith(("http://", "https://")):
            raise VideoStreamResolutionError("A valid video webpage URL is required")

        cached = VideoService._cache_get(
            VideoService._video_stream_cache,
            webpage_url,
        )
        if cached is not None:
            direct_url, headers = cached
            return direct_url, dict(headers)

        try:
            logger.debug("extracting_video_stream", url=webpage_url)
            with yt_dlp.YoutubeDL(VideoService._ydl_options()) as ydl:
                info = ydl.extract_info(webpage_url, download=False)
        except Exception as exc:
            logger.error("video_extraction_failed", url=webpage_url, error=str(exc))
            raise VideoStreamResolutionError(
                f"Could not resolve video stream for {webpage_url}"
            ) from exc

        direct_url = info.get("url")
        if not direct_url:
            raise VideoStreamResolutionError(
                f"Failed to extract video URL from {webpage_url}"
            )

        cached_value = (direct_url, dict(info.get("http_headers") or {}))
        VideoService._cache_set(
            VideoService._video_stream_cache,
            webpage_url,
            cached_value,
        )
        return cached_value[0], dict(cached_value[1])
