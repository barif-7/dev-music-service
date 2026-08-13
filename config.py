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
    # Small private-beta authentication. Disabled by default so local development
    # remains frictionless; hosted deployments should enable it and provide all
    # three secrets/identity settings below.
    beta_auth_enabled: bool = False
    beta_auth_secret: str | None = None
    beta_invite_code: str | None = None
    beta_allowed_emails: Annotated[tuple[str, ...], NoDecode] = ()
    beta_owner_email: str | None = None
    beta_session_hours: int = 168
    beta_cookie_secure: bool = False
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
    # MusicKit on the Web embeds a signed developer token in the client. Prefer
    # an origin claim restricted to the app's Funnel and local development URLs.
    apple_music_developer_token: str | None = None
    apple_music_storefront: str = "ca"
    apple_music_app_name: str = "Phase Field"
    apple_music_app_build: str = "0.4.0"
    # Optional local Music/iTunes export used as Phase's persistent read-only
    # Apple Music library. JSON exports and raw Library.xml plists are accepted.
    apple_music_import_path: Path | None = None
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
    # Optional permitted-voice TTS backend. This is deliberately not an artist
    # voice-clone path; requests are limited to neutral, user-consented, or
    # licensed profiles by the API layer.
    pikaprojbackend_url: str | None = None
    pikaprojbackend_tts_path: str = "/api/tts/segments"
    translated_vocals_voice_mode: str = "neutral"
    translated_vocals_voice_profile_id: str | None = None
    translated_vocals_voice_consent_token: str | None = None
    translated_vocals_voice_label: str = "Neutral voice"
    translated_vocals_local_say_fallback: bool = True
    translated_vocals_say_command: str = "/usr/bin/say"
    translated_vocals_say_voice: str | None = None
    translated_vocals_ffmpeg_command: str = "/opt/homebrew/bin/ffmpeg"
    translated_vocals_audio_dir: Path | None = None

    @field_validator("stream_allowed_hosts", mode="before")
    @classmethod
    def _parse_stream_allowed_hosts(cls, value):
        if isinstance(value, str):
            return tuple(item.strip() for item in value.split(",") if item.strip())
        return value

    @field_validator("beta_allowed_emails", mode="before")
    @classmethod
    def _parse_beta_allowed_emails(cls, value):
        if isinstance(value, str):
            return tuple(
                item.strip().lower() for item in value.split(",") if item.strip()
            )
        return value

    @field_validator("beta_owner_email", mode="before")
    @classmethod
    def _normalize_beta_owner_email(cls, value):
        return value.strip().lower() if isinstance(value, str) and value.strip() else None

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

    @field_validator("translated_vocals_voice_mode")
    @classmethod
    def _validate_translated_vocals_voice_mode(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"neutral", "user_consent", "licensed"}:
            raise ValueError(
                "TRANSLATED_VOCALS_VOICE_MODE must be neutral, user_consent, or licensed"
            )
        return normalized

    @property
    def backend_origin(self) -> str:
        return self.dev_music_backend_origin or self.dev_music_base_url

    @property
    def focus_profile_path(self) -> Path:
        return self.dms_data_dir / "focus_profile.json"

    @property
    def apple_music_configured(self) -> bool:
        return bool(self.apple_music_developer_token and self.apple_music_developer_token.strip())

    @property
    def apple_music_import_available(self) -> bool:
        path = self.apple_music_import_path
        return bool(path and path.expanduser().is_file())

    @property
    def beta_auth_configured(self) -> bool:
        return bool(
            self.beta_auth_secret
            and self.beta_invite_code
            and self.beta_owner_email
            and self.beta_owner_email in self.beta_allowed_emails
        )


def get_settings() -> Settings:
    return Settings()


def configure_ytdlp_js_runtime(default: str = "node") -> None:
    runtime = get_settings().ytdlp_js_runtime or default
    os.environ["YTDLP_JS_RUNTIME"] = runtime
