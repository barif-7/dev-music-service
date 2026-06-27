"""Localize synced lyric lines through the CaptionLocalizer service.

dev-music-service owns lyric retrieval (LRCLIB); CaptionLocalizer owns
translation/adaptation. This module is the thin bridge: it maps timed
LyricsLine objects to CaptionLocalizer caption segments, calls the
``localize_captions`` tool, and maps the localized text back by index.

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

_TOOL_PATH = "/tools/localize_captions/run"
_REQUEST_TIMEOUT_SECONDS = 180.0


class LyricsLocalizationService:
    @staticmethod
    def _localizer_url() -> str:
        return get_settings().caption_localizer_url.rstrip("/")

    @staticmethod
    def _source_locale() -> str:
        return get_settings().lyrics_source_locale or "auto"

    @staticmethod
    def _segment_for(line: LyricsLine, index: int) -> dict:
        """Map one timed line to a CaptionLocalizer caption segment, synthesizing
        timing for plain (untimed) lyrics so the contract is always satisfied."""
        start = line.start_time_ms if line.start_time_ms is not None else index * 4000
        end = line.end_time_ms if line.end_time_ms is not None else start + 4000
        return {"start_ms": start, "end_ms": end, "text": line.text}

    @staticmethod
    def localize_subset(
        lines: list[LyricsLine], indices: list[int], target_locale: str
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
            localized_segments = LyricsLocalizationService._call_localizer(segments, target_locale)
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            logger.warning("lyrics_localization_subset_failed: %s", exc)
            return {}

        result: dict[int, str] = {}
        for index, segment in zip(wanted, localized_segments):
            localized_text = (segment or {}).get("localized_text") or None
            if localized_text:
                result[index] = localized_text
        return result

    @staticmethod
    def localize_items(items: list[tuple[int, str]], target_locale: str) -> dict[int, str]:
        """Translate ``(index, text)`` pairs and return ``{index: localized_text}``.

        Unlike :meth:`localize_subset` this needs no pre-fetched line list, so it
        works for any source of lines (LRC or transcribed). Synthetic timing is
        supplied to satisfy the caption contract. Returns an empty map on error.
        """
        if not target_locale or not items:
            return {}

        segments = [
            {"start_ms": pos * 4000, "end_ms": pos * 4000 + 4000, "text": text}
            for pos, (_, text) in enumerate(items)
        ]
        try:
            localized_segments = LyricsLocalizationService._call_localizer(segments, target_locale)
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            logger.warning("lyrics_localization_items_failed: %s", exc)
            return {}

        result: dict[int, str] = {}
        for (index, _), segment in zip(items, localized_segments):
            localized_text = (segment or {}).get("localized_text") or None
            if localized_text:
                result[index] = localized_text
        return result

    @staticmethod
    def localize(lines: list[LyricsLine], target_locale: str) -> list[LyricsLine]:
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
            localized_segments = LyricsLocalizationService._call_localizer(segments, target_locale)
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            logger.warning("lyrics_localization_failed: %s", exc)
            return lines

        result: list[LyricsLine] = []
        for line, segment in zip(lines, localized_segments):
            localized_text = (segment or {}).get("localized_text") or None
            result.append(line.model_copy(update={"localized_text": localized_text}))
        # If the localizer returned fewer segments than lines, keep the rest as-is.
        result.extend(lines[len(result):])
        return result

    @staticmethod
    def _call_localizer(segments: list[dict], target_locale: str) -> list[dict]:
        payload = json.dumps(
            {
                "input": {
                    "segments": segments,
                    "source_locale": LyricsLocalizationService._source_locale(),
                    "target_locale": target_locale,
                }
            }
        ).encode("utf-8")
        request = Request(
            f"{LyricsLocalizationService._localizer_url()}{_TOOL_PATH}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=_REQUEST_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
        return body.get("output", {}).get("segments", [])
