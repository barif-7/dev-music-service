from __future__ import annotations

import threading
from urllib.parse import urlencode

from cachetools import TTLCache
import structlog
import yt_dlp

from config import ytdlp_options
from models import VideoSearchResult
from services.text_match import fuzzy_score

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
    _video_stream_cache: TTLCache[tuple[str, bool], tuple[str, dict[str, str]]] = TTLCache(
        maxsize=128,
        ttl=_STREAM_TTL_SECONDS,
    )

    # The overlay is muted and follows the separate audio player. A single
    # video-only MP4 works there when YouTube offers no progressive A/V file.
    # Audio playback's fallback must still require a file with an audio track.
    _BROWSER_AV_FORMAT = (
        "best[ext=mp4][height<=480][vcodec!=none][acodec!=none]/"
        "best[height<=480][vcodec!=none][acodec!=none]/"
        "best[ext=mp4][vcodec!=none][acodec!=none]/"
        "best[vcodec!=none][acodec!=none]/"
        "best"
    )
    _BROWSER_VIDEO_FORMAT = (
        _BROWSER_AV_FORMAT + "/"
        "bestvideo[ext=mp4][vcodec^=avc1][height<=480][protocol=https]/"
        "bestvideo[ext=mp4][height<=480][protocol=https]/"
        "bestvideo[ext=mp4][protocol=https]"
    )
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
    def _score_video(
        entry: dict,
        kind: str,
        expected_title: str | None = None,
        expected_artist: str | None = None,
    ) -> float:
        title = (entry.get("title") or "").lower()
        channel = (entry.get("channel") or entry.get("uploader") or "").lower()
        duration = entry.get("duration") or 0
        score = 0.0

        # Identity outranks presentation. Without this term, any official upload
        # by the right artist can beat the song the listener actually requested.
        if expected_title:
            title_match = fuzzy_score(expected_title, title)
            score += title_match * 1.5
            if title_match < 45:
                score -= 90
        if expected_artist:
            artist_match = max(
                fuzzy_score(expected_artist, channel),
                fuzzy_score(expected_artist, title),
            )
            score += artist_match * 0.35

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
        elif kind == "live":
            if any(term in title for term in ("live", "concert", "performance", "session")):
                score += 35
            if "official audio" in title:
                score -= 20
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
    def _ydl_search_options() -> dict:
        """Options for metadata-only search. No format resolution — fast."""
        return {**ytdlp_options(), "extract_flat": "in_playlist"}

    @staticmethod
    def _ydl_stream_options(require_audio: bool = False) -> dict:
        return ytdlp_options(
            VideoService._BROWSER_AV_FORMAT if require_audio
            else VideoService._BROWSER_VIDEO_FORMAT
        )

    @staticmethod
    def _best_thumbnail(entry: dict) -> str | None:
        """Pick the best thumbnail from a flat-extract entry.
        Flat extracts have `thumbnails` (list) not `thumbnail` (string)."""
        thumbs = entry.get("thumbnails")
        if isinstance(thumbs, list) and thumbs:
            # Pick the largest thumbnail by area
            best = max(
                thumbs,
                key=lambda t: (t.get("width", 0) or 0) * (t.get("height", 0) or 0),
            )
            return best.get("url")
        return entry.get("thumbnail")

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
                # Flat extraction: metadata only, no per-entry format resolution.
                # This is fast because yt-dlp only hits the search results page
                # and does not fetch individual video pages.
                with yt_dlp.YoutubeDL(VideoService._ydl_search_options()) as ydl:
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
                if entry and entry.get("url")
            ]
            VideoService._cache_set(
                VideoService._video_search_cache,
                cache_key,
                entries,
            )

        ranked = sorted(
            entries,
            key=lambda entry: VideoService._score_video(
                entry,
                kind,
                expected_title=title,
                expected_artist=artist,
            ),
            reverse=True,
        )
        return [
            VideoSearchResult(
                title=entry.get("title", "Unknown Video"),
                webpage_url=entry["url"],
                video_stream_url=(
                    f"/api/video/stream?{urlencode({'url': entry['url']})}"
                ),
                duration=int(entry.get("duration") or 0),
                thumbnail=VideoService._best_thumbnail(entry),
                channel=entry.get("channel") or entry.get("uploader"),
                kind=kind,
                width=entry.get("width"),
                height=entry.get("height"),
            )
            for entry in ranked[:safe_limit]
        ]

    @staticmethod
    def get_video_stream_source(
        webpage_url: str, *, require_audio: bool = False,
    ) -> tuple[str, dict[str, str]]:
        if not webpage_url.startswith(("http://", "https://")):
            raise VideoStreamResolutionError("A valid video webpage URL is required")

        cache_key = (webpage_url, require_audio)
        cached = VideoService._cache_get(
            VideoService._video_stream_cache,
            cache_key,
        )
        if cached is not None:
            direct_url, headers = cached
            return direct_url, dict(headers)

        try:
            logger.debug("extracting_video_stream", url=webpage_url)
            with yt_dlp.YoutubeDL(VideoService._ydl_stream_options(require_audio)) as ydl:
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
            cache_key,
            cached_value,
        )
        return cached_value[0], dict(cached_value[1])
