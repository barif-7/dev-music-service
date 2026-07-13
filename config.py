from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    dev_music_base_url: str = "http://127.0.0.1:8000"
    dev_music_frontend_origin: str = "*"
    dev_music_backend_origin: str | None = None
    dev_music_mcp_origin: str | None = None
    dms_data_dir: Path = Path(".")
    ytdlp_js_runtime: str | None = None
    lrclib_user_agent: str = (
        "dev-music-service/1.0 (lyrics integration; contact: unset)"
    )
    spotify_client_id: str | None = None
    spotify_client_secret: str | None = None
    spotify_redirect_uri: str | None = None
    vercel: bool = Field(default=False)
    dms_control_auth_token: str | None = None
    # NoDecode keeps pydantic-settings from JSON-decoding the env value so the
    # comma-separated form below is parsed by _parse_stream_allowed_hosts.
    stream_allowed_hosts: Annotated[tuple[str, ...], NoDecode] = (
        "googlevideo.com",
        "youtube.com",
        "youtu.be",
        "ytimg.com",
        "ggpht.com",
        "googleusercontent.com",
    )
    stream_delivery_mode: str = "proxy"
    focus_profile_storage_backend: str = "local-json"
    focus_profile_kv_namespace: str | None = None
    phase_field_api_base_url: str = "http://localhost:8787"
    # CaptionLocalizer integration — used to localize synced lyric lines on demand.
    caption_localizer_url: str = "http://127.0.0.1:8001"
    lyrics_source_locale: str = "auto"
    # Live localization tuning. The first window of lines is translated inline so
    # the caption appears quickly; the rest are filled in the background and
    # served just-in-time as the playhead advances.
    lyrics_localize_window: int = 6
    lyrics_localize_background_fill: bool = True
    # Live transcription fallback (CaptionLocalizer transcribe_video / local
    # faster-whisper) used only when LRCLIB has no lyrics for a track.
    lyrics_transcription_enabled: bool = True
    lyrics_transcription_language: str = "auto"
    # Shared with the local CaptionLocalizer process — the resolved audio file is
    # written here and its path is handed to transcribe_video on the same host.
    lyrics_transcription_temp_dir: str = "/tmp/dev-music-transcribe"

    @field_validator("stream_allowed_hosts", mode="before")
    @classmethod
    def _parse_stream_allowed_hosts(cls, value):
        if isinstance(value, str):
            return tuple(item.strip() for item in value.split(",") if item.strip())
        return value

    @field_validator("stream_delivery_mode")
    @classmethod
    def _validate_stream_delivery_mode(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"proxy", "redirect"}:
            raise ValueError("STREAM_DELIVERY_MODE must be proxy or redirect")
        return normalized

    @field_validator("focus_profile_storage_backend")
    @classmethod
    def _validate_focus_profile_storage_backend(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"local-json", "kv"}:
            raise ValueError("FOCUS_PROFILE_STORAGE_BACKEND must be local-json or kv")
        return normalized

    @property
    def backend_origin(self) -> str:
        return self.dev_music_backend_origin or self.dev_music_base_url

    @property
    def focus_profile_path(self) -> Path:
        return self.dms_data_dir / "focus_profile.json"


def get_settings() -> Settings:
    return Settings()


def configure_ytdlp_js_runtime(default: str = "node") -> None:
    runtime = get_settings().ytdlp_js_runtime or default
    os.environ["YTDLP_JS_RUNTIME"] = runtime
