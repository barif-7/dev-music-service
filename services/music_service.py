from __future__ import annotations

import threading
from urllib.parse import urlencode

from cachetools import TTLCache
import structlog
import yt_dlp

from models import BrowserPlaybackState, SongSearchResult, TrackMetadata
from services.text_match import combined_score, normalize

logger = structlog.get_logger()


class MusicServiceError(Exception):
    pass


class SearchServiceError(MusicServiceError):
    pass


class StreamResolutionError(MusicServiceError):
    pass


class MusicService:
    _cache_lock = threading.Lock()
    _SEARCH_TTL_SECONDS = 300
    _STREAM_TTL_SECONDS = 240
    _search_cache: TTLCache[str, list[dict]] = TTLCache(
        maxsize=256,
        ttl=_SEARCH_TTL_SECONDS,
    )
    _stream_cache: TTLCache[str, tuple[str, dict[str, str]]] = TTLCache(
        maxsize=128,
        ttl=_STREAM_TTL_SECONDS,
    )
    _BROWSER_AUDIO_FORMAT = "bestaudio[ext=m4a]/best[ext=mp4]/bestaudio/best"

    @staticmethod
    def _normalize_query(query: str) -> str:
        return " ".join(query.split()).lower()

    @staticmethod
    def _cache_get(cache: dict, key):
        with MusicService._cache_lock:
            return cache.get(key)

    @staticmethod
    def _cache_set(cache: dict, key, value, ttl_seconds: int):
        with MusicService._cache_lock:
            cache[key] = value
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

    _DURATION_TOLERANCE_SECONDS = 5
    _OFFICIAL_CHANNEL_TOKENS = ("topic", "vevo", "official")

    # Shared YouTube extractor settings.
    #
    # - `player_client`: prefer "tv" (signed-in TV client) which doesn't require
    #   a GVS PO Token and isn't currently subject to YouTube's SABR-only
    #   streaming experiment (see yt-dlp issue #12482). Fall back to
    #   `web_safari` and `web` so we still surface formats if `tv` is blocked.
    # - `remote_components`: opt in to the EJS challenge solver script so deno
    #   can resolve YouTube's player JS / signature challenges. Without this,
    #   `n` and signature solving silently fail and many videos return
    #   incomplete or SABR-only formats.
    _YOUTUBE_EXTRACTOR_ARGS = {
        "youtube": {
            "player_client": ["tv", "web_safari", "web"],
        }
    }
    _YOUTUBE_REMOTE_COMPONENTS = ["ejs:github"]

    @staticmethod
    def _search_entries(query: str, limit: int = 5, oversample: int = 1) -> list[dict]:
        # `oversample` lets the caller fetch extra candidates so we can filter/
        # rerank by duration and channel quality without paying for it on every
        # cache hit. Cache always stores the oversampled pool.
        cache_key = MusicService._normalize_query(query)
        fetch_count = max(1, limit * max(1, oversample))
        cached = MusicService._cache_get(MusicService._search_cache, cache_key)
        if cached is not None and len(cached) >= fetch_count:
            logger.debug("search_cache_hit", query=cache_key)
            return cached

        ydl_opts = {
            "format": MusicService._BROWSER_AUDIO_FORMAT,
            "quiet": True,
            "noplaylist": True,
            "extractor_args": MusicService._YOUTUBE_EXTRACTOR_ARGS,
            "remote_components": MusicService._YOUTUBE_REMOTE_COMPONENTS,
        }

        try:
            logger.debug("youtube_search_started", query=cache_key, fetch=fetch_count)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch{fetch_count}:{query}", download=False)
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
        )

    @staticmethod
    def _channel_quality_bonus(entry: dict) -> float:
        # "- Topic" channels are auto-generated official audio uploads; VEVO /
        # "Official" channels are typically the artist-owned canonical version.
        channel = (entry.get("channel") or entry.get("uploader") or "").lower()
        if not channel:
            return 0.0
        if "- topic" in channel or channel.endswith(" topic"):
            return 25.0
        if any(token in channel for token in MusicService._OFFICIAL_CHANNEL_TOKENS):
            return 15.0
        return 0.0

    @staticmethod
    def _entry_score(
        entry: dict,
        query: str,
        target_duration: int | None,
        expected_artist: str | None,
        expected_title: str | None,
        expected_album: str | None = None,
        expected_year: int | None = None,
    ) -> float:
        # Identity match against title/artist (normalized + fuzzy)
        candidate_title = entry.get("title") or ""
        candidate_artist = entry.get("artist") or entry.get("channel") or entry.get("uploader")

        if expected_title or expected_artist:
            score = combined_score(
                f"{expected_artist or ''} {expected_title or ''}".strip(),
                candidate_title,
                candidate_artist,
            )
        else:
            score = combined_score(query, candidate_title, candidate_artist)

        # Duration coherence: if we have an expected duration, anything more
        # than the tolerance gets penalised heavily (linear ramp). Inside the
        # tolerance window the score is unchanged.
        duration = entry.get("duration") or 0
        if target_duration and duration:
            delta = abs(duration - target_duration)
            if delta > MusicService._DURATION_TOLERANCE_SECONDS:
                # 1.0 point lost per extra second outside the tolerance window,
                # capped so wildly-off durations don't go negative beyond -60.
                score -= min(60.0, delta - MusicService._DURATION_TOLERANCE_SECONDS)
        elif target_duration and not duration:
            # No duration metadata on a candidate we expected to match → slight
            # penalty so candidates with verifiable duration win.
            score -= 5

        candidate_album = MusicService._album_from_entry(entry)
        if expected_album:
            if candidate_album and normalize(candidate_album) == normalize(expected_album):
                score += 10
            elif candidate_album:
                score -= 4
            else:
                score -= 2

        if expected_year:
            candidate_year = MusicService._extract_year(entry)
            if candidate_year:
                if candidate_year == expected_year:
                    score += 8
                elif abs(candidate_year - expected_year) <= 1:
                    score += 3
                else:
                    score -= 4

        score += MusicService._channel_quality_bonus(entry)

        # Penalise obvious non-canonical variants by title keywords.
        lowered = candidate_title.lower()
        for bad in ("cover", "karaoke", "instrumental", "remix", "sped up", "slowed", "8d audio"):
            if bad in lowered and (not expected_title or bad not in expected_title.lower()):
                score -= 12
                break

        return score

    @staticmethod
    def search(
        query: str,
        limit: int = 5,
        target_duration: int | None = None,
        expected_artist: str | None = None,
        expected_title: str | None = None,
        expected_album: str | None = None,
        expected_year: int | None = None,
    ) -> list[SongSearchResult]:
        # When the caller knows what they're looking for (duration / title /
        # artist), oversample so we have room to rerank by identity match,
        # duration coherence, and channel quality.
        oversample = 5 if (target_duration or expected_title or expected_artist) else 1
        entries = MusicService._search_entries(query, limit=limit, oversample=oversample)

        usable: list[tuple[float, dict]] = []
        for entry in entries:
            if not entry.get("webpage_url"):
                continue
            score = MusicService._entry_score(
                entry,
                query,
                target_duration,
                expected_artist,
                expected_title,
                expected_album,
                expected_year,
            )
            # When a duration target is set, hard-drop entries that are wildly
            # off (10x tolerance) so live versions / loops don't survive.
            if target_duration and entry.get("duration"):
                delta = abs(entry["duration"] - target_duration)
                if delta > MusicService._DURATION_TOLERANCE_SECONDS * 10:
                    continue
            usable.append((score, entry))

        usable.sort(key=lambda pair: pair[0], reverse=True)

        results: list[SongSearchResult] = []
        for _, entry in usable[:limit]:
            webpage_url = entry["webpage_url"]
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
    def _metadata_from_entry(entry: dict, fallback_url: str | None = None) -> TrackMetadata:
        webpage_url = entry.get("webpage_url") or fallback_url
        if not webpage_url:
            raise StreamResolutionError("Extracted metadata is missing a webpage URL")

        return TrackMetadata(
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
            source="youtube",
        )

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
            "extractor_args": MusicService._YOUTUBE_EXTRACTOR_ARGS,
            "remote_components": MusicService._YOUTUBE_REMOTE_COMPONENTS,
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
    def get_metadata(webpage_url: str) -> TrackMetadata:
        ydl_opts = {
            "format": MusicService._BROWSER_AUDIO_FORMAT,
            "quiet": True,
            "noplaylist": True,
            "extractor_args": MusicService._YOUTUBE_EXTRACTOR_ARGS,
            "remote_components": MusicService._YOUTUBE_REMOTE_COMPONENTS,
        }

        try:
            logger.debug("extracting_track_metadata", url=webpage_url)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(webpage_url, download=False)
        except Exception as exc:
            logger.error("metadata_extraction_failed", url=webpage_url, error=str(exc))
            raise StreamResolutionError(f"Could not extract metadata for {webpage_url}: {str(exc)}") from exc

        return MusicService._metadata_from_entry(info, fallback_url=webpage_url)

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
