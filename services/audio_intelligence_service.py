"""Future Audio Intelligence / MIR service boundary.

Step 10 skeleton: Essentia should live behind a separate audio-intelligence
service, not inside the translation bridge. dev-music-service can request BPM,
structure, mood, and timing features, then pass those features as song_context
to CaptionLocalizer's `localize_lyrics` tool.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class AudioIntelligenceFeatures:
    bpm: int | None = None
    mood: tuple[str, ...] = field(default_factory=tuple)
    sections: tuple[str, ...] = field(default_factory=tuple)
    timing_confidence: float | None = None


class AudioIntelligenceBackend(Protocol):
    def analyze_track(self, *, title: str, artist: str, audio_url: str) -> AudioIntelligenceFeatures:
        """Return MIR features from a future Essentia-backed sidecar service."""


class EssentiaAudioIntelligenceSkeleton:
    """Placeholder for an HTTP/gRPC client to an Essentia-based MIR service."""

    def analyze_track(self, *, title: str, artist: str, audio_url: str) -> AudioIntelligenceFeatures:
        raise NotImplementedError("Call the separate Essentia audio-intelligence service here.")
