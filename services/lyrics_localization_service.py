"""Localize synced lyric lines through the CaptionLocalizer service.

dev-music-service owns lyric retrieval (LRCLIB); CaptionLocalizer owns
translation/adaptation. This module is the thin bridge: it maps timed
LyricsLine objects to CaptionLocalizer lyric segments, calls the
``localize_lyrics`` tool, and maps the localized text back by stable line index.

Failures are non-fatal — if CaptionLocalizer is unreachable or returns an
unexpected shape, callers fall back to the original (untranslated) lines.
"""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from config import get_settings
from models import LyricsLine

logger = logging.getLogger(__name__)

_TOOL_PATH = "/tools/localize_lyrics/run"
_REQUEST_TIMEOUT_SECONDS = 180.0
_DEFAULT_FALLBACK_LOCALIZER_URL = "http://127.0.0.1:8001"

LyricItem = tuple[int, str] | tuple[int, str, int | None, int | None]


class LyricsLocalizationService:
    @staticmethod
    def _localizer_url() -> str:
        settings = get_settings()
        url = settings.caption_localizer_url.rstrip("/")
        if url and url == settings.dev_music_base_url.rstrip("/"):
            logger.warning(
                "caption_localizer_url_points_to_dev_music_service; "
                "using default CaptionLocalizer port instead"
            )
            return _DEFAULT_FALLBACK_LOCALIZER_URL
        return url

    @staticmethod
    def _source_locale() -> str:
        return get_settings().lyrics_source_locale or "auto"

    @staticmethod
    def _segment_for(line: LyricsLine, index: int) -> dict:
        """Map one timed line to a CaptionLocalizer lyric segment.

        Plain lyrics get synthetic timing so the downstream contract is stable,
        but the original line index is always carried for cache/playhead safety.
        """
        start = line.start_time_ms if line.start_time_ms is not None else index * 4000
        end = line.end_time_ms if line.end_time_ms is not None else start + 4000
        return {"index": index, "start_ms": start, "end_ms": end, "text": line.text}

    @staticmethod
    def _item_segment(item: LyricItem, position: int) -> dict:
        index = item[0]
        text = item[1]
        start = item[2] if len(item) > 2 and item[2] is not None else position * 4000
        end = item[3] if len(item) > 3 and item[3] is not None else start + 4000
        return {"index": index, "start_ms": start, "end_ms": end, "text": text}

    @staticmethod
    def _song_context(
        *,
        title: str | None = None,
        artist: str | None = None,
        album: str | None = None,
        duration: int | None = None,
        section: str | None = None,
        bpm: int | None = None,
        mood: list[str] | None = None,
        preserve_singability: bool = True,
        preserve_repetition: bool = True,
    ) -> dict:
        return {
            key: value
            for key, value in {
                "title": title,
                "artist": artist,
                "album": album,
                "duration_seconds": duration,
                "section": section,
                "bpm": bpm,
                "mood": mood or [],
                "preserve_singability": preserve_singability,
                "preserve_repetition": preserve_repetition,
            }.items()
            if value not in (None, "", [])
        }

    @staticmethod
    def build_song_context(**kwargs) -> dict:
        return LyricsLocalizationService._song_context(**kwargs)

    @staticmethod
    def _segment_index(segment: dict | None, fallback_index: int) -> int:
        if isinstance(segment, dict):
            value = segment.get("index")
            if isinstance(value, int):
                return value
            if isinstance(value, str) and value.isdigit():
                return int(value)
        return fallback_index

    @staticmethod
    def _localized_text(segment: dict | None) -> str | None:
        if not isinstance(segment, dict):
            return None
        value = (
            segment.get("localized_text")
            or segment.get("translated_text")
            or segment.get("text")
        )
        return value if isinstance(value, str) and value.strip() else None

    @staticmethod
    def _quality(segment: dict | None) -> dict | None:
        if not isinstance(segment, dict):
            return None
        quality = segment.get("quality")
        return quality if isinstance(quality, dict) else None

    @staticmethod
    def localize_subset(
        lines: list[LyricsLine],
        indices: list[int],
        target_locale: str,
        song_context: dict | None = None,
    ) -> dict[int, str]:
        """Translate only ``indices`` and return ``{index: localized_text}``.

        This is the just-in-time path: callers translate a small window of lines
        around the playhead instead of the whole song. On any error an empty map
        is returned so display falls back to the original language.
        """
        if not target_locale or not lines or not indices:
            return {}

        wanted = [i for i in dict.fromkeys(indices) if 0 <= i < len(lines)]
        if not wanted:
            return {}

        segments = [LyricsLocalizationService._segment_for(lines[i], i) for i in wanted]
        try:
            localized_segments = LyricsLocalizationService._call_localizer(
                segments, target_locale, song_context=song_context
            )
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            logger.warning("lyrics_localization_subset_failed: %s", exc)
            return {}

        result: dict[int, str] = {}
        for fallback_index, segment in zip(wanted, localized_segments):
            index = LyricsLocalizationService._segment_index(segment, fallback_index)
            localized_text = LyricsLocalizationService._localized_text(segment)
            if localized_text:
                result[index] = localized_text
        return result

    @staticmethod
    def localize_items(
        items: list[LyricItem],
        target_locale: str,
        song_context: dict | None = None,
    ) -> dict[int, str]:
        """Translate ``(index, text)`` pairs and return ``{index: localized_text}``.

        Unlike :meth:`localize_subset` this needs no pre-fetched line list, so it
        works for any source of lines (LRC or transcribed). Synthetic timing is
        supplied to satisfy the caption contract. Returns an empty map on error.
        """
        if not target_locale or not items:
            return {}

        segments = [
            LyricsLocalizationService._item_segment(item, position)
            for position, item in enumerate(items)
        ]
        try:
            localized_segments = LyricsLocalizationService._call_localizer(
                segments, target_locale, song_context=song_context
            )
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            logger.warning("lyrics_localization_items_failed: %s", exc)
            return {}

        result: dict[int, str] = {}
        for item, segment in zip(items, localized_segments):
            index = LyricsLocalizationService._segment_index(segment, item[0])
            localized_text = LyricsLocalizationService._localized_text(segment)
            if localized_text:
                result[index] = localized_text
        return result

    @staticmethod
    def localize(
        lines: list[LyricsLine],
        target_locale: str,
        song_context: dict | None = None,
    ) -> list[LyricsLine]:
        """Return a new list of lines with ``localized_text`` populated.

        On any error the input lines are returned unchanged so lyric display
        degrades gracefully to the original language.
        """
        if not target_locale or not lines:
            return lines

        segments = [
            LyricsLocalizationService._segment_for(line, index)
            for index, line in enumerate(lines)
        ]

        try:
            localized_segments = LyricsLocalizationService._call_localizer(
                segments, target_locale, song_context=song_context
            )
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            logger.warning("lyrics_localization_failed: %s", exc)
            return lines

        result: list[LyricsLine] = []
        by_index = {
            LyricsLocalizationService._segment_index(segment, fallback): segment
            for fallback, segment in enumerate(localized_segments)
            if isinstance(segment, dict)
        }
        for index, line in enumerate(lines):
            segment = by_index.get(index)
            if segment is None:
                result.append(line)
                continue
            localized_text = LyricsLocalizationService._localized_text(segment)
            quality = LyricsLocalizationService._quality(segment)
            update = {"localized_text": localized_text}
            if quality:
                update["localization_quality"] = quality
            result.append(line.model_copy(update=update))
        return result

    @staticmethod
    def _call_localizer(
        segments: list[dict],
        target_locale: str,
        song_context: dict | None = None,
    ) -> list[dict]:
        payload = json.dumps(
            {
                "input": {
                    "segments": segments,
                    "source_locale": LyricsLocalizationService._source_locale(),
                    "target_locale": target_locale,
                    "song_context": song_context or {},
                    "localization_policy": {
                        "mode": "lyrics",
                        "preserve_meaning": True,
                        "preserve_emotional_tone": True,
                        "preserve_line_order": True,
                        "preserve_repetition": True,
                        "preserve_slang": True,
                        "prefer_natural_lyrics": True,
                        "avoid_ad_copy_rewrite": True,
                    },
                }
            }
        ).encode("utf-8")
        request = Request(
            f"{LyricsLocalizationService._localizer_url()}{_TOOL_PATH}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        # Scheme is pinned to http(s) by the caption_localizer_url validator.
        with urlopen(request, timeout=_REQUEST_TIMEOUT_SECONDS) as response:  # nosec B310
            body = json.loads(response.read().decode("utf-8"))
        return body.get("output", {}).get("segments", [])
