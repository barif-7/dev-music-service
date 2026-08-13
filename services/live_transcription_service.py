"""Private bridge to CaptionLocalizer's progressive transcription API.

The browser never connects to the CaptionLocalizer tailnet port. This service
creates a session using its own internal audio proxy as the source, then relays
CaptionLocalizer's SSE stream to the browser. The legacy snapshot method is
retained for API compatibility.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncGenerator
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import httpx

from config import get_settings
from models import LyricsLine

_CREATE_PATH = "/live-sessions"
_REQUEST_TIMEOUT_SECONDS = 30.0


class LiveTranscriptionService:
    @staticmethod
    def _track_key(title: str, artist: str, webpage_url: str) -> str:
        raw = "\n".join((title or "", artist or "", webpage_url or ""))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]

    @staticmethod
    def _source_url(webpage_url: str) -> str:
        settings = get_settings()
        base = settings.caption_audio_source_base_url.rstrip("/")
        return f"{base}/api/stream?{urlencode({'url': webpage_url})}"

    @classmethod
    def _payload(
        cls,
        title: str,
        artist: str,
        webpage_url: str,
        target_locale: str | None = None,
    ) -> dict:
        settings = get_settings()
        return {
            "track_key": cls._track_key(title, artist, webpage_url),
            "source_url": cls._source_url(webpage_url),
            "title": title,
            "artist": artist,
            "source_locale": settings.lyrics_transcription_language,
            "target_locale": target_locale or None,
        }

    @classmethod
    async def start_session(
        cls,
        title: str,
        artist: str,
        webpage_url: str,
        target_locale: str | None = None,
    ) -> dict:
        settings = get_settings()
        url = settings.caption_localizer_url.rstrip("/") + _CREATE_PATH
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    url,
                    json=cls._payload(title, artist, webpage_url, target_locale),
                )
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError(f"CaptionLocalizer live session unavailable: {exc}") from exc

    @staticmethod
    async def stream_events(session_id: str, after: int = 0) -> AsyncGenerator[bytes, None]:
        settings = get_settings()
        url = (
            settings.caption_localizer_url.rstrip("/")
            + f"/live-sessions/{session_id}/events"
        )
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None)) as client:
                async with client.stream("GET", url, params={"after": max(0, after)}) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes():
                        yield chunk
        except (httpx.HTTPError, ValueError) as exc:
            event = {
                "type": "error",
                "session_id": session_id,
                "message": f"Caption stream interrupted: {exc}",
            }
            data = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
            yield f"event: error\ndata: {data}\n\n".encode("utf-8")

    @classmethod
    def get_or_start(cls, title: str, artist: str, webpage_url: str) -> dict:
        """Legacy polling adapter backed by the new session API."""
        settings = get_settings()
        base = settings.caption_localizer_url.rstrip("/")
        payload = json.dumps(cls._payload(title, artist, webpage_url)).encode("utf-8")
        request = Request(
            base + _CREATE_PATH,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=_REQUEST_TIMEOUT_SECONDS) as response:
                session = json.loads(response.read().decode("utf-8"))
            status = session.get("status", "pending")
            lines: list[LyricsLine] = []
            if status == "complete":
                with urlopen(
                    base + f"/live-sessions/{session['session_id']}/segments",
                    timeout=_REQUEST_TIMEOUT_SECONDS,
                ) as response:
                    snapshot = json.loads(response.read().decode("utf-8"))
                lines = [
                    LyricsLine(
                        text=segment["text"],
                        start_time_ms=segment.get("start_ms"),
                        end_time_ms=segment.get("end_ms"),
                        localized_text=segment.get("localized_text"),
                    )
                    for segment in snapshot.get("segments", [])
                    if segment.get("text")
                ]
            return {"status": status, "lines": lines, "error": None}
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            return {"status": "error", "lines": [], "error": str(exc)}
