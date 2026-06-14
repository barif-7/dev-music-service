from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:  # avoid an import cycle — AudioFeatures lives in focus_service
    from services.focus_service import AudioFeatures


@runtime_checkable
class AudioFeatureProvider(Protocol):
    """
    Source of per-track audio features, keyed by Spotify track ID.

    FocusService depends only on this interface, never on a concrete provider,
    so the source can be swapped (ReccoBeats today, an Essentia fallback later)
    without touching scoring or routes.

    Contract:
      - A return of ``None`` (single) / a missing key (bulk) means "this provider
        has no data for that track" — an honest absence, never fabricated zeros.
      - Transport/network failures raise; they are not silently turned into None.
    """

    async def get_features(self, spotify_track_id: str) -> "AudioFeatures | None":
        """Return features for one Spotify track ID, or None if unavailable."""
        ...

    async def get_features_bulk(
        self, spotify_track_ids: list[str]
    ) -> "dict[str, AudioFeatures]":
        """
        Return ``{spotify_track_id: AudioFeatures}`` for the IDs that have data.

        Results MUST be re-associated to the requested Spotify IDs explicitly
        (not by response ordering). IDs with no data are simply absent from the
        returned dict — the caller computes coverage from the difference.
        """
        ...
