from __future__ import annotations

import base64
import hashlib
import logging
from pathlib import Path
import shutil
import subprocess  # nosec B404 - local neutral TTS fallback only
from typing import Any

import httpx

from config import Settings, get_settings
from models import TranslatedVocalRequest

logger = logging.getLogger(__name__)


class TranslatedVocalsPolicyError(ValueError):
    pass


class TranslatedVocalsServiceError(RuntimeError):
    pass


class TranslatedVocalsService:
    """Create timed translated-vocal segment plans for permitted voice profiles.

    Artist impersonation is intentionally blocked here. The downstream backend,
    when configured, should receive only neutral, user-consented, or licensed
    voice requests.
    """

    @staticmethod
    def _resolve_voice(body: TranslatedVocalRequest, settings: Settings) -> dict[str, str | None]:
        voice_mode = body.voice_mode
        voice_profile_id = body.voice_profile_id
        voice_consent_token = body.voice_consent_token

        if voice_mode == "neutral" and settings.translated_vocals_voice_mode != "neutral":
            voice_mode = settings.translated_vocals_voice_mode
        if voice_mode in {"user_consent", "licensed"}:
            voice_profile_id = voice_profile_id or settings.translated_vocals_voice_profile_id
            voice_consent_token = voice_consent_token or settings.translated_vocals_voice_consent_token

        return {
            "voice_mode": voice_mode,
            "voice_profile_id": voice_profile_id,
            "voice_consent_token": voice_consent_token,
        }

    @staticmethod
    def _validate_voice_policy(
        voice_mode: str,
        voice_profile_id: str | None,
        voice_consent_token: str | None,
    ) -> None:
        if voice_mode == "artist_clone":
            raise TranslatedVocalsPolicyError(
                "Artist voice cloning is not supported. Use neutral, user_consent, or licensed voices."
            )
        if voice_mode in {"user_consent", "licensed"}:
            if not voice_profile_id or not voice_consent_token:
                raise TranslatedVocalsPolicyError(
                    "Consented and licensed voices require voice_profile_id and voice_consent_token."
                )

    @staticmethod
    def _segment_plan(body: TranslatedVocalRequest) -> list[dict[str, Any]]:
        segments: list[dict[str, Any]] = []
        for line in body.lines:
            start = line.start_time_ms or 0
            end = line.end_time_ms if line.end_time_ms and line.end_time_ms > start else start + 3500
            segments.append(
                {
                    "index": line.index,
                    "text": line.text,
                    "start_time_ms": start,
                    "end_time_ms": end,
                    "audio_url": None,
                }
            )
        return segments

    @staticmethod
    def audio_dir(settings: Settings | None = None) -> Path:
        settings = settings or get_settings()
        root = settings.translated_vocals_audio_dir or (settings.dms_data_dir / "translated-vocals")
        root.mkdir(parents=True, exist_ok=True)
        return root.resolve()

    @staticmethod
    def audio_path(filename: str) -> Path:
        clean = Path(filename).name
        root = TranslatedVocalsService.audio_dir()
        path = (root / clean).resolve()
        if path.parent != root or not clean.endswith((".wav", ".aiff", ".mp3")):
            raise FileNotFoundError(filename)
        return path

    @staticmethod
    def _audio_filename(body: TranslatedVocalRequest, segment: dict[str, Any], suffix: str) -> str:
        digest = hashlib.sha256(
            "|".join(
                [
                    body.title,
                    body.artist,
                    body.locale,
                    str(segment["index"]),
                    str(segment["start_time_ms"]),
                    str(segment["end_time_ms"]),
                    segment["text"],
                ]
            ).encode("utf-8")
        ).hexdigest()[:24]
        return f"{digest}{suffix}"

    @staticmethod
    def _write_audio_bytes(
        body: TranslatedVocalRequest,
        segment: dict[str, Any],
        audio_bytes: bytes,
        mime_type: str = "audio/wav",
    ) -> str:
        suffix = ".mp3" if "mpeg" in mime_type or "mp3" in mime_type else ".wav"
        filename = TranslatedVocalsService._audio_filename(body, segment, suffix)
        path = TranslatedVocalsService.audio_dir() / filename
        if not path.exists():
            path.write_bytes(audio_bytes)
        return f"/api/vocals/audio/{filename}"

    @staticmethod
    def _try_pika_batch_backend(
        body: TranslatedVocalRequest,
        settings: Settings,
        voice: dict[str, str | None],
        segments: list[dict[str, Any]],
    ) -> tuple[dict[str, Any] | None, str | None]:
        if not settings.pikaprojbackend_url:
            return None, None
        url = settings.pikaprojbackend_url.rstrip("/") + settings.pikaprojbackend_tts_path
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    url,
                    json={
                        "title": body.title,
                        "artist": body.artist,
                        "locale": body.locale,
                        "voice_mode": voice["voice_mode"],
                        "voice_profile_id": voice["voice_profile_id"],
                        "voice_consent_token": voice["voice_consent_token"],
                        "segments": segments,
                    },
                )
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("translated_vocals_backend_failed: %s", exc)
            return None, "Translated vocal backend is unavailable"

        returned_segments = data.get("segments") if isinstance(data, dict) else None
        if isinstance(returned_segments, list):
            by_index = {
                int(item.get("index")): item
                for item in returned_segments
                if isinstance(item, dict) and item.get("index") is not None
            }
            for segment in segments:
                generated = by_index.get(segment["index"])
                if generated and generated.get("audio_url"):
                    segment["audio_url"] = generated["audio_url"]
            return data, None

        return data if isinstance(data, dict) else None, None

    @staticmethod
    def _try_pika_tts_backend(
        body: TranslatedVocalRequest,
        settings: Settings,
        voice: dict[str, str | None],
        segments: list[dict[str, Any]],
    ) -> str | None:
        if not settings.pikaprojbackend_url or settings.pikaprojbackend_tts_path.rstrip("/") != "/tts":
            return None

        url = settings.pikaprojbackend_url.rstrip("/") + "/tts"
        with httpx.Client(timeout=60.0) as client:
            for segment in segments:
                response = client.post(
                    url,
                    json={
                        "text": segment["text"],
                        "voiceProfileID": voice["voice_profile_id"],
                    },
                )
                if response.status_code == 503:
                    return "Pika TTS provider is not configured."
                response.raise_for_status()
                data = response.json()
                audio_b64 = data.get("audioBase64") if isinstance(data, dict) else None
                if not audio_b64:
                    return "Pika TTS returned no audio."
                audio_bytes = base64.b64decode(audio_b64)
                segment["audio_url"] = TranslatedVocalsService._write_audio_bytes(
                    body,
                    segment,
                    audio_bytes,
                    data.get("mimeType", "audio/wav"),
                )
        return None

    @staticmethod
    def _try_local_say_fallback(
        body: TranslatedVocalRequest,
        settings: Settings,
        voice: dict[str, str | None],
        segments: list[dict[str, Any]],
    ) -> str | None:
        if not settings.translated_vocals_local_say_fallback:
            return None
        if voice["voice_mode"] not in {"neutral", "user_consent"}:
            return None
        if voice["voice_mode"] == "user_consent" and not voice["voice_profile_id"]:
            return None

        say = settings.translated_vocals_say_command
        ffmpeg = settings.translated_vocals_ffmpeg_command
        if not say or not Path(say).exists():
            say = shutil.which("say") or ""
        if not ffmpeg or not Path(ffmpeg).exists():
            ffmpeg = shutil.which("ffmpeg") or ""
        if not say or not ffmpeg:
            return "Local neutral TTS fallback requires macOS say and ffmpeg."

        for segment in segments:
            filename = TranslatedVocalsService._audio_filename(body, segment, ".wav")
            wav_path = TranslatedVocalsService.audio_dir(settings) / filename
            if not wav_path.exists():
                aiff_path = wav_path.with_suffix(".aiff")
                try:
                    say_args = [say]
                    if settings.translated_vocals_say_voice:
                        say_args.extend(["-v", settings.translated_vocals_say_voice])
                    say_args.extend(["-o", str(aiff_path), segment["text"]])
                    subprocess.run(  # nosec B603 - command path is fixed/resolved above
                        say_args,
                        check=True,
                        timeout=20,
                        capture_output=True,
                    )
                    subprocess.run(  # nosec B603 - command path is fixed/resolved above
                        [ffmpeg, "-y", "-i", str(aiff_path), "-ar", "44100", "-ac", "1", str(wav_path)],
                        check=True,
                        timeout=20,
                        capture_output=True,
                    )
                except (subprocess.SubprocessError, OSError) as exc:
                    logger.warning("translated_vocals_local_say_failed: %s", exc)
                    return "Local neutral TTS fallback failed."
                finally:
                    aiff_path.unlink(missing_ok=True)
            segment["audio_url"] = f"/api/vocals/audio/{filename}"
        return None

    @staticmethod
    def create(body: TranslatedVocalRequest) -> dict[str, Any]:
        settings = get_settings()
        voice = TranslatedVocalsService._resolve_voice(body, settings)
        TranslatedVocalsService._validate_voice_policy(
            voice["voice_mode"] or "neutral",
            voice["voice_profile_id"],
            voice["voice_consent_token"],
        )
        segments = TranslatedVocalsService._segment_plan(body)
        payload = {
            "title": body.title,
            "artist": body.artist,
            "locale": body.locale,
            "voice_mode": voice["voice_mode"],
            "voice_profile_id": voice["voice_profile_id"],
            "segments": segments,
            "status": "not_configured",
            "message": "Set PIKAPROJBACKEND_URL or enable local neutral TTS fallback.",
        }

        backend_data = None
        backend_message = None
        if settings.pikaprojbackend_tts_path.rstrip("/") == "/tts":
            try:
                backend_message = TranslatedVocalsService._try_pika_tts_backend(
                    body, settings, voice, segments
                )
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("translated_vocals_pika_tts_failed: %s", exc)
                backend_message = "Pika TTS backend is unavailable."
        else:
            backend_data, backend_message = TranslatedVocalsService._try_pika_batch_backend(
                body, settings, voice, segments
            )

        if not any(s.get("audio_url") for s in segments):
            fallback_message = TranslatedVocalsService._try_local_say_fallback(
                body, settings, voice, segments
            )
            backend_message = fallback_message or backend_message

        has_audio = any(s.get("audio_url") for s in segments)
        if has_audio:
            payload["status"] = "ready"
        elif settings.pikaprojbackend_url or settings.translated_vocals_local_say_fallback:
            payload["status"] = "pending"
        else:
            payload["status"] = "not_configured"
        if backend_data and backend_data.get("message"):
            payload["message"] = backend_data["message"]
        else:
            payload["message"] = backend_message
        return payload

    @staticmethod
    def config_status() -> dict[str, Any]:
        settings = get_settings()
        profile_ready = bool(
            settings.translated_vocals_voice_profile_id
            and settings.translated_vocals_voice_consent_token
        )
        voice_mode = settings.translated_vocals_voice_mode
        public_voice_label = {
            "neutral": "Neutral voice",
            "user_consent": "Shared consented voice",
            "licensed": "Shared licensed voice",
        }[voice_mode]
        local_fallback_ready = bool(
            settings.translated_vocals_local_say_fallback
            and (Path(settings.translated_vocals_say_command).exists() or shutil.which("say"))
            and (
                Path(settings.translated_vocals_ffmpeg_command).exists()
                or shutil.which("ffmpeg")
            )
        )
        return {
            "pika_voice_profile": {
                "enabled": settings.pika_voice_profile_enabled,
                "stage": "under_development",
                "scope": "shared",
            },
            "backend_configured": bool(settings.pikaprojbackend_url) or local_fallback_ready,
            "pika_backend_configured": bool(settings.pikaprojbackend_url),
            "local_fallback_configured": local_fallback_ready,
            "tts_path": settings.pikaprojbackend_tts_path,
            "voice_mode": voice_mode,
            # Never reflect an operator/profile name into the browser. The
            # concrete profile and consent credential remain server-side and
            # every client sees the same identity-free description.
            "voice_label": public_voice_label,
            "local_voice": settings.translated_vocals_say_voice,
            "profile_configured": voice_mode == "neutral" or profile_ready,
            "permitted_modes": ["neutral", "user_consent", "licensed"],
        }
