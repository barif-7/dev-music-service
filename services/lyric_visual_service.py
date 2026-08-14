"""Portable contracts for the embedded Lyrics Shader Lab.

The browser owns frame-level Web Audio analysis.  This module supplies the
deterministic lyric interpretation and canonical track-prior shapes used by
the lab, so the UI never needs a Base44 token or a client-side model secret.
"""

from __future__ import annotations

from collections.abc import Mapping

from models import LyricVisualAnalysisRequest


_MOOD_KEYWORDS = {
    "calm": {"quiet", "still", "gentle", "soft", "peace", "drift", "snow", "silent", "fades", "white", "hollow"},
    "euphoric": {"light", "sun", "suns", "thousand", "electric", "burning", "bright", "neon", "glow", "fire", "blaze"},
    "sad": {"lost", "ghost", "lonely", "tears", "broken", "empty", "cold", "shadow", "shadows", "grey"},
    "aggressive": {"burn", "crash", "scream", "rage", "smash", "chains", "current", "veins", "voltage"},
    "dreamy": {"dream", "float", "haze", "cloud", "mist", "frequencies", "tangled", "web", "time", "machine"},
    "chaotic": {"noise", "chaos", "static", "shatter", "storm", "dissolving", "nothing", "seems"},
}

_SECTION_ENERGY = {"intro": 0.2, "verse": 0.45, "chorus": 0.85, "bridge": 0.6, "outro": 0.15}
_MOOD_COLORS = {
    "calm": ("#1E3A5F", "#4A90B8"),
    "euphoric": ("#F59E0B", "#EC4899"),
    "sad": ("#1E1B4B", "#6366F1"),
    "aggressive": ("#7F1D1D", "#EF4444"),
    "dreamy": ("#7C3AED", "#06B6D4"),
    "chaotic": ("#DC2626", "#FACC15"),
}
_MOOD_PARAMS = {
    "calm": (0.3, 0.1, 0.2),
    "euphoric": (0.9, 0.4, 0.9),
    "sad": (0.2, 0.15, 0.3),
    "aggressive": (0.7, 0.8, 0.95),
    "dreamy": (0.5, 0.25, 0.5),
    "chaotic": (0.6, 0.9, 0.7),
}
_VISUAL_DIRECTIONS = {
    "calm": "soft ambient glow and gentle drifting particles",
    "euphoric": "radiant light beams and a golden energy burst",
    "sad": "cold rain on glass and slow blue shadows",
    "aggressive": "red lightning and fractured pulse geometry",
    "dreamy": "neon fog and iridescent aurora trails",
    "chaotic": "glitch distortion and a rapidly shifting grid",
}


class LyricVisualService:
    """Build stable visual-engine responses without external model calls."""

    @staticmethod
    def analyze_lyric(body: LyricVisualAnalysisRequest) -> dict[str, object]:
        words = [word.strip(".,!?;:\"'()[]{}").lower() for word in body.lyric_line.split()]
        scores = {
            mood: sum(any(keyword in word for keyword in keywords) for word in words)
            for mood, keywords in _MOOD_KEYWORDS.items()
        }
        mood = max(scores, key=scores.get) if any(scores.values()) else "calm"
        section_energy = _SECTION_ENERGY.get(body.section, 0.4)
        word_energy = min(1.0, len(words) / 12)
        energy = round(min(1.0, section_energy * 0.6 + word_energy * 0.4), 2)
        brightness, chaos, pulse = _MOOD_PARAMS[mood]
        color_a, color_b = _MOOD_COLORS[mood]
        return {
            "provider": "dev-music-service-local",
            "mood": mood,
            "energy": energy,
            "brightness": brightness,
            "chaos": chaos,
            "pulse": pulse,
            "colorA": color_a,
            "colorB": color_b,
            "visualPrompt": f"{_VISUAL_DIRECTIONS[mood]} — \"{body.lyric_line}\"",
        }

    @staticmethod
    def neutral_audio_features(
        *, title: str, artist: str, duration_ms: int | None = None, reason: str = "provider_unavailable"
    ) -> dict[str, object]:
        return {
            "available": False,
            "source": "neutral_default",
            "confidence": 0.0,
            "reason": reason,
            "title": title,
            "artist": artist,
            "danceability": 0.5,
            "energy": 0.5,
            "loudness": -14.0,
            "speechiness": 0.1,
            "acousticness": 0.3,
            "instrumentalness": 0.2,
            "liveness": 0.1,
            "valence": 0.5,
            "tempo": 120.0,
            "key": -1,
            "mode": 1,
            "time_signature": 4,
            "duration_ms": duration_ms or 0,
        }

    @staticmethod
    def provider_audio_features(
        raw: Mapping[str, object], *, title: str, artist: str
    ) -> dict[str, object]:
        return {
            "available": True,
            "source": "spotify_legacy",
            "confidence": 0.85,
            "title": title,
            "artist": artist,
            "providerTrackId": raw.get("track_id"),
            **dict(raw),
        }
