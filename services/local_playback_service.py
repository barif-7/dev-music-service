from __future__ import annotations

import os
import signal
import subprocess  # nosec B404
import threading

from config import get_settings
from models import LocalPlaybackState, PlaybackStatus
from services.music_service import MusicService, SearchServiceError


class LocalPlaybackService:
    _active_process: subprocess.Popen | None = None
    _last_state: LocalPlaybackState | None = None
    _process_lock = threading.Lock()

    @staticmethod
    def _local_playback_available() -> bool:
        return not get_settings().vercel

    @classmethod
    def _ensure_local_playback_available(cls) -> None:
        if cls._local_playback_available():
            return
        raise SearchServiceError("Local playback is unavailable in the Vercel runtime")

    @classmethod
    def _start_playback(cls, state: LocalPlaybackState) -> LocalPlaybackState:
        cls._ensure_local_playback_available()
        cls.stop()
        direct_url, headers = MusicService._extract_audio_source(state.webpage_url)
        process = subprocess.Popen(  # nosec B603 B607
            [
                "ffplay",
                "-nodisp",
                "-autoexit",
                "-loglevel",
                "error",
                *MusicService.ffmpeg_http_args(headers, state.webpage_url),
                direct_url,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        updated_state = state.model_copy(update={"pid": process.pid})
        cls._active_process = process
        cls._last_state = updated_state
        return updated_state

    @classmethod
    def play_query(cls, query: str) -> LocalPlaybackState:
        cls._ensure_local_playback_available()
        result = MusicService.first_result(query)
        return cls._start_playback(
            LocalPlaybackState(
                title=result.title,
                duration=result.duration,
                webpage_url=result.webpage_url,
                pid=0,
            )
        )

    @classmethod
    def stop(cls) -> PlaybackStatus:
        cls._ensure_local_playback_available()
        with cls._process_lock:
            process = cls._active_process
            if not process:
                return PlaybackStatus(playing=False, mode="local", message="No active local playback")

            pid = process.pid
            if process.poll() is None:
                try:
                    os.killpg(os.getpgid(pid), signal.SIGTERM)
                    process.wait(timeout=2)
                except Exception:
                    try:
                        os.killpg(os.getpgid(pid), signal.SIGKILL)
                    except Exception:
                        process.poll()

            cls._active_process = None
        return PlaybackStatus(
            playing=False,
            mode="local",
            pid=pid,
            message="Local playback stopped",
        )

    @classmethod
    def resume(cls) -> LocalPlaybackState:
        cls._ensure_local_playback_available()
        if not cls._last_state:
            raise SearchServiceError("Nothing to resume")

        cls.stop()
        return cls._start_playback(cls._last_state)
