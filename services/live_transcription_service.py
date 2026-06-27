"""Live transcription fallback — caption a track that has no LRCLIB lyrics.

When LRCLIB returns nothing, dev-music-service can still produce timed,
localizable lines by transcribing the audio: it downloads the resolved track to
a temp file and hands the path to CaptionLocalizer's ``transcribe_video`` tool
(local faster-whisper). The resulting segments become :class:`LyricsLine`s with
the same shape as LRC lines, so the existing live-display and windowed
localization paths work on them unchanged.

Transcription is slow relative to a request, so it runs as a background job: the
first call starts it and returns ``pending``; later calls poll until ``ready``.
Sung audio over instrumentation transcribes imperfectly — this is a best-effort
fallback, not a replacement for real synced lyrics.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import yt_dlp

from config import get_settings
from models import LyricsLine

logger = logging.getLogger(__name__)

_TOOL_PATH = "/tools/transcribe_video/run"
_REQUEST_TIMEOUT_SECONDS = 600.0
_JOB_TTL_SECONDS = 3600.0

# job status values surfaced to the API/frontend
STATUS_PENDING = "pending"
STATUS_READY = "ready"
STATUS_ERROR = "error"
STATUS_DISABLED = "disabled"


class LiveTranscriptionService:
    _lock = threading.Lock()
    # track_key -> {"status", "lines": list[LyricsLine], "error", "expires_at"}
    _jobs: dict[str, dict] = {}

    @staticmethod
    def _track_key(title: str, artist: str, webpage_url: str) -> str:
        raw = "\n".join((title or "", artist or "", webpage_url or ""))
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _prune(now: float) -> None:
        stale = [k for k, job in LiveTranscriptionService._jobs.items() if job["expires_at"] <= now]
        for key in stale:
            LiveTranscriptionService._jobs.pop(key, None)

    @staticmethod
    def get_or_start(
        title: str,
        artist: str,
        webpage_url: str,
    ) -> dict:
        """Return the transcription job for a track, starting it if needed.

        Result shape: ``{"status", "lines": [LyricsLine...], "error"}``. ``lines``
        is only populated once ``status == "ready"``.
        """
        settings = get_settings()
        if not settings.lyrics_transcription_enabled:
            return {"status": STATUS_DISABLED, "lines": [], "error": "Transcription is disabled"}
        if not webpage_url:
            return {"status": STATUS_ERROR, "lines": [], "error": "A track URL is required"}

        key = LiveTranscriptionService._track_key(title, artist, webpage_url)
        now = time.monotonic()
        with LiveTranscriptionService._lock:
            LiveTranscriptionService._prune(now)
            job = LiveTranscriptionService._jobs.get(key)
            if job is None:
                job = {
                    "status": STATUS_PENDING,
                    "lines": [],
                    "error": None,
                    "expires_at": now + _JOB_TTL_SECONDS,
                }
                LiveTranscriptionService._jobs[key] = job
                thread = threading.Thread(
                    target=LiveTranscriptionService._run_job,
                    args=(key, title, artist, webpage_url),
                    daemon=True,
                )
                thread.start()
            return {
                "status": job["status"],
                "lines": list(job["lines"]),
                "error": job["error"],
            }

    @staticmethod
    def _finish(key: str, *, status: str, lines: list[LyricsLine] | None = None, error: str | None = None) -> None:
        with LiveTranscriptionService._lock:
            job = LiveTranscriptionService._jobs.get(key)
            if job is None:
                return
            job["status"] = status
            job["lines"] = lines or []
            job["error"] = error
            job["expires_at"] = time.monotonic() + _JOB_TTL_SECONDS

    @staticmethod
    def _run_job(key: str, title: str, artist: str, webpage_url: str) -> None:
        audio_path: Path | None = None
        try:
            audio_path = LiveTranscriptionService._download_audio(key, webpage_url)
            segments = LiveTranscriptionService._transcribe(audio_path, key)
            lines = LiveTranscriptionService._segments_to_lines(segments)
            if not lines:
                LiveTranscriptionService._finish(key, status=STATUS_ERROR, error="No speech detected")
                return
            LiveTranscriptionService._finish(key, status=STATUS_READY, lines=lines)
            logger.info("transcription_ready: %s lines for %s - %s", len(lines), artist, title)
        except Exception as exc:  # noqa: BLE001 — surface any failure as job error
            logger.warning("transcription_failed: %s", exc)
            LiveTranscriptionService._finish(key, status=STATUS_ERROR, error=str(exc))
        finally:
            if audio_path is not None:
                try:
                    audio_path.unlink(missing_ok=True)
                except OSError:
                    pass

    @staticmethod
    def _temp_dir() -> Path:
        path = Path(get_settings().lyrics_transcription_temp_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def _download_audio(key: str, webpage_url: str) -> Path:
        temp_dir = LiveTranscriptionService._temp_dir()
        outtmpl = str(temp_dir / f"{key}.%(ext)s")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": outtmpl,
            "quiet": True,
            "noplaylist": True,
            "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(webpage_url, download=True)
        downloaded = info.get("requested_downloads", [{}])[0].get("filepath")
        if downloaded and Path(downloaded).exists():
            return Path(downloaded)
        # Fall back to whatever file landed under the key prefix.
        for candidate in temp_dir.glob(f"{key}.*"):
            return candidate
        raise RuntimeError("Audio download produced no file")

    @staticmethod
    def _transcribe(audio_path: Path, video_id: str) -> list[dict]:
        settings = get_settings()
        payload = json.dumps(
            {
                "input": {
                    "video_path": str(audio_path),
                    "video_id": video_id,
                    "language": settings.lyrics_transcription_language,
                }
            }
        ).encode("utf-8")
        url = settings.caption_localizer_url.rstrip("/") + _TOOL_PATH
        request = Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=_REQUEST_TIMEOUT_SECONDS) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as exc:
            raise RuntimeError(f"CaptionLocalizer transcribe unreachable: {exc}") from exc
        return body.get("output", {}).get("segments", [])

    @staticmethod
    def _segments_to_lines(segments: list[dict]) -> list[LyricsLine]:
        lines: list[LyricsLine] = []
        for segment in segments:
            text = (segment.get("text") or "").strip()
            if not text:
                continue
            lines.append(
                LyricsLine(
                    text=text,
                    start_time_ms=segment.get("start_ms"),
                    end_time_ms=segment.get("end_ms"),
                )
            )
        return lines
