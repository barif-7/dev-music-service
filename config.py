from __future__ import annotations

import os
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    spotify_redirect_uri: str | None = None
    vercel: bool = Field(default=False)
    dms_control_auth_token: str | None = None
    stream_allowed_hosts: tuple[str, ...] = (
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
