from __future__ import annotations

import threading
from typing import TYPE_CHECKING

import structlog

from config import get_settings
from services.focus_storage import build_focus_profile_storage
from services.spotify_import_service import SpotifyImportService

if TYPE_CHECKING:  # typing only — avoids any import cycle
    from services.audio_feature_provider import AudioFeatureProvider

logger = structlog.get_logger()

_AUDIO_FEATURES_UNAVAILABLE_MESSAGE = (
    "Audio features are sourced from ReccoBeats, which has no data for these "
    "tracks. They are shown without analysis."
)

# ---------------------------------------------------------------------------
# Data models (plain dicts / dataclasses — no heavy deps)
# ---------------------------------------------------------------------------

DEFAULT_PROFILE = {
    "bpm_min": 60,
    "bpm_max": 120,
    "instrumentalness_min": 0.6,   # 0.0–1.0; >0.5 is mostly instrumental
    "energy_min": 0.0,
    "energy_max": 1.0,
    "valence_min": 0.0,            # 0=negative mood, 1=positive
    "valence_max": 1.0,
    "label": "Focus",
}

_PROFILE_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Audio features (provider-agnostic shape)
# ---------------------------------------------------------------------------

class AudioFeatures:
    """
    A single track's audio features. The field set / ranges match what Spotify
    historically returned (tempo in BPM, most fields 0–1, loudness in dB), which
    ReccoBeats also returns — so scoring stays unchanged across the source swap.
    """

    __slots__ = (
        "track_id", "tempo", "energy", "valence",
        "instrumentalness", "acousticness", "speechiness",
        "liveness", "danceability", "loudness",
        "source",
        # musical-identity / structural fields — used as visual priors by the
        # frontend TrackVisualProfile (key/mode → colour, time_signature → grid).
        "key", "mode", "time_signature", "duration_ms",
    )

    def __init__(self, raw: dict) -> None:
        self.track_id: str = raw.get("id") or ""
        self.tempo: float = float(raw.get("tempo") or 0)
        self.energy: float = float(raw.get("energy") or 0)
        self.valence: float = float(raw.get("valence") or 0)
        self.instrumentalness: float = float(raw.get("instrumentalness") or 0)
        self.acousticness: float = float(raw.get("acousticness") or 0)
        self.speechiness: float = float(raw.get("speechiness") or 0)
        self.liveness: float = float(raw.get("liveness") or 0)
        self.danceability: float = float(raw.get("danceability") or 0)
        self.loudness: float = float(raw.get("loudness") or 0)
        # Which provider produced this record ("reccobeats" today, "essentia"
        # later). Tagged so a low-quality source can be re-analysed in future.
        self.source: str = raw.get("source") or "reccobeats"
        # Optional fields: Spotify provides these in audio-features, but they may be
        # absent from other providers — default to "unknown" sentinels (-1) so the
        # frontend stays neutral rather than guessing.
        self.key: int = int(raw["key"]) if raw.get("key") is not None else -1
        self.mode: int = int(raw["mode"]) if raw.get("mode") is not None else -1
        self.time_signature: int = int(raw.get("time_signature") or 4)
        self.duration_ms: int = int(raw.get("duration_ms") or 0)

    def matches_profile(self, profile: dict) -> bool:
        if not (profile["bpm_min"] <= self.tempo <= profile["bpm_max"]):
            return False
        if self.instrumentalness < profile["instrumentalness_min"]:
            return False
        if not (profile["energy_min"] <= self.energy <= profile["energy_max"]):
            return False
        if not (profile["valence_min"] <= self.valence <= profile["valence_max"]):
            return False
        return True

    def focus_score(self, profile: dict) -> float:
        """
        0–100 score of how well this track matches the focus profile.
        Used to rank results within a filtered set.
        """
        bpm_mid = (profile["bpm_min"] + profile["bpm_max"]) / 2
        bpm_range = max(1, (profile["bpm_max"] - profile["bpm_min"]) / 2)
        bpm_score = max(0.0, 1.0 - abs(self.tempo - bpm_mid) / bpm_range)

        instr_score = min(1.0, self.instrumentalness / max(0.01, profile["instrumentalness_min"]))

        # Penalise spoken word — bad for focus
        speech_penalty = 1.0 - min(1.0, self.speechiness * 3)

        # Penalise live recordings (crowd noise disrupts rhythm entrainment)
        live_penalty = 1.0 - min(1.0, self.liveness * 2)

        score = (bpm_score * 0.40 + instr_score * 0.35 + speech_penalty * 0.15 + live_penalty * 0.10)
        return round(score * 100, 1)

    def to_dict(self) -> dict:
        return {
            "track_id": self.track_id,
            "tempo": round(self.tempo, 1),
            "energy": round(self.energy, 3),
            "valence": round(self.valence, 3),
            "instrumentalness": round(self.instrumentalness, 3),
            "acousticness": round(self.acousticness, 3),
            "speechiness": round(self.speechiness, 3),
            "liveness": round(self.liveness, 3),
            "danceability": round(self.danceability, 3),
            "loudness": round(self.loudness, 1),
            "source": self.source,
            "key": self.key,
            "mode": self.mode,
            "time_signature": self.time_signature,
            "duration_ms": self.duration_ms,
        }


class AudioFeaturesUnavailableError(Exception):
    """
    Reserved error type for "the audio-feature source has no data."

    The failure mode is now partial coverage from ReccoBeats (some tracks have
    no features), not a hard Spotify block. Normal analysis surfaces coverage
    instead of raising; this type is kept for callers/back-compat.
    """

    def __init__(self) -> None:
        super().__init__(_AUDIO_FEATURES_UNAVAILABLE_MESSAGE)


def _resolve_provider(provider: "AudioFeatureProvider | None") -> "AudioFeatureProvider":
    if provider is not None:
        return provider
    # Lazy import keeps focus_service free of a concrete-provider dependency.
    from services.reccobeats_service import get_audio_feature_provider
    return get_audio_feature_provider()


# ---------------------------------------------------------------------------
# Focus profile persistence
# ---------------------------------------------------------------------------

class FocusProfile:

    @staticmethod
    def load(user_id: str | None = None) -> dict:
        with _PROFILE_LOCK:
            profile = build_focus_profile_storage(get_settings(), user_id).load()
            return {**DEFAULT_PROFILE, **profile} if profile else dict(DEFAULT_PROFILE)

    @staticmethod
    def save(profile: dict, user_id: str | None = None) -> dict:
        merged = {**DEFAULT_PROFILE, **profile}
        # clamp values
        merged["bpm_min"] = max(40, min(220, int(merged["bpm_min"])))
        merged["bpm_max"] = max(merged["bpm_min"] + 5, min(220, int(merged["bpm_max"])))
        merged["instrumentalness_min"] = max(0.0, min(1.0, float(merged["instrumentalness_min"])))
        merged["energy_min"] = max(0.0, min(1.0, float(merged["energy_min"])))
        merged["energy_max"] = max(merged["energy_min"], min(1.0, float(merged["energy_max"])))
        merged["valence_min"] = max(0.0, min(1.0, float(merged["valence_min"])))
        merged["valence_max"] = max(merged["valence_min"], min(1.0, float(merged["valence_max"])))
        with _PROFILE_LOCK:
            build_focus_profile_storage(get_settings(), user_id).save(merged)
        return merged

    @staticmethod
    def reset(user_id: str | None = None) -> dict:
        with _PROFILE_LOCK:
            build_focus_profile_storage(get_settings(), user_id).reset()
        return dict(DEFAULT_PROFILE)


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------

class FocusService:
    """
    Filters / scores tracks against the user's focus profile using audio
    features from an :class:`AudioFeatureProvider` (ReccoBeats today).

    FocusService depends only on the provider interface — never on a concrete
    source — so a different/fallback provider (e.g. a future Essentia analyser)
    can be injected without touching scoring or routes.

    Track *lists* still come from Spotify (playlists, top tracks); only the
    audio-feature source moved off Spotify's deprecated endpoint. Tracks the
    provider has no data for are surfaced honestly as "no data", never as
    fabricated zero-score rows, and coverage is reported.
    """

    @staticmethod
    async def get_track_features(
        track_id: str,
        provider: "AudioFeatureProvider | None" = None,
    ) -> AudioFeatures | None:
        return await _resolve_provider(provider).get_features(track_id)

    @staticmethod
    async def analyse_playlist(
        track_ids: list[str],
        profile: dict | None = None,
        provider: "AudioFeatureProvider | None" = None,
    ) -> list[dict]:
        """
        Given Spotify track IDs, return each track *that has features* with its
        focus score, sorted best-first.
        """
        if profile is None:
            profile = FocusProfile.load()
        features_map = await _resolve_provider(provider).get_features_bulk(track_ids)

        results = []
        for tid in track_ids:
            af = features_map.get(tid)
            if af is None:
                continue
            results.append({
                **af.to_dict(),
                "matches_profile": af.matches_profile(profile),
                "focus_score": af.focus_score(profile),
            })
        results.sort(key=lambda x: x["focus_score"], reverse=True)
        return results

    # ---------------------------------------------------------------------------
    # Focus-filtered playlist preview
    # ---------------------------------------------------------------------------

    @staticmethod
    async def focus_filter_playlist(
        access_token: str,
        playlist_id: str,
        limit: int = 50,
        profile: dict | None = None,
        provider: "AudioFeatureProvider | None" = None,
    ) -> dict:
        """
        Fetch up to `limit` playlist tracks, enrich with audio features, and
        return matched / rejected / no-data buckets plus coverage.
        """
        if profile is None:
            profile = FocusProfile.load()

        payload = await SpotifyImportService._spotify_get(
            access_token,
            f"/playlists/{playlist_id}/items",
            {
                "limit": max(1, min(limit, 50)),
                "offset": 0,
                "fields": "items(track(type,id,name,duration_ms,artists(name),album(name,images)))",
            },
        )

        items = payload.get("items") or []
        tracks_meta: list[dict] = []
        track_ids: list[str] = []
        for item in items:
            track = (item.get("track") or {})
            if track.get("type") != "track" or not track.get("id"):
                continue
            artists = [a.get("name") for a in track.get("artists") or [] if a.get("name")]
            album = track.get("album") or {}
            images = album.get("images") or []
            tracks_meta.append({
                "id": track["id"],
                "title": track.get("name") or "Unknown",
                "artist": artists[0] if artists else "Unknown",
                "album": album.get("name"),
                "thumbnail": images[0].get("url") if images else None,
                "duration_ms": track.get("duration_ms") or 0,
            })
            track_ids.append(track["id"])

        features_map = await _resolve_provider(provider).get_features_bulk(track_ids)

        matched: list[dict] = []
        rejected: list[dict] = []
        no_data: list[dict] = []
        for meta in tracks_meta:
            af = features_map.get(meta["id"])
            if af is None:
                no_data.append({**meta, "has_features": False})
                continue
            entry = {
                **meta,
                **af.to_dict(),
                "has_features": True,
                "focus_score": af.focus_score(profile),
                "matches_profile": af.matches_profile(profile),
            }
            (matched if af.matches_profile(profile) else rejected).append(entry)

        matched.sort(key=lambda x: x["focus_score"], reverse=True)

        return {
            "profile": profile,
            "total_tracks": len(tracks_meta),
            "features_total": len(track_ids),
            "features_covered": len(track_ids) - len(no_data),
            "focus_tracks": matched,
            "focus_tracks_count": len(matched),
            "rejected": rejected[:10],
            "rejected_tracks": len(rejected),
            "no_data_tracks": no_data[:10],
            "no_data_count": len(no_data),
            "audio_features_available": True,
            "source": "reccobeats",
        }

    # ---------------------------------------------------------------------------
    # Top tracks focus analysis — uses user-top-read scope
    # ---------------------------------------------------------------------------

    @staticmethod
    async def analyse_top_tracks(
        access_token: str,
        time_range: str = "medium_term",  # short_term | medium_term | long_term
        limit: int = 50,
        profile: dict | None = None,
        provider: "AudioFeatureProvider | None" = None,
    ) -> dict:
        """
        Fetch the user's top tracks and analyse which match their focus profile.
        Tracks ReccoBeats has no features for are returned in `no_data_tracks`.
        """
        if profile is None:
            profile = FocusProfile.load()

        payload = await SpotifyImportService._spotify_get(
            access_token,
            "/me/top/tracks",
            {"time_range": time_range, "limit": min(limit, 50)},
        )

        items = payload.get("items") or []
        track_ids = [t["id"] for t in items if t.get("id")]
        meta_map = {}
        for t in items:
            if t.get("id"):
                artists = [a.get("name") for a in t.get("artists") or [] if a.get("name")]
                album = t.get("album") or {}
                images = album.get("images") or []
                meta_map[t["id"]] = {
                    "id": t["id"],
                    "title": t.get("name") or "Unknown",
                    "artist": artists[0] if artists else "Unknown",
                    "album": album.get("name"),
                    "thumbnail": images[0].get("url") if images else None,
                    "popularity": t.get("popularity") or 0,
                }

        features_map = await _resolve_provider(provider).get_features_bulk(track_ids)

        focus_tracks = []
        no_data_tracks = []
        bpm_distribution: list[float] = []
        for tid in track_ids:
            meta = meta_map.get(tid, {})
            af = features_map.get(tid)
            if af is None:
                no_data_tracks.append({**meta, "has_features": False})
                continue
            bpm_distribution.append(af.tempo)
            entry = {
                **meta,
                **af.to_dict(),
                "has_features": True,
                "focus_score": af.focus_score(profile),
                "matches_profile": af.matches_profile(profile),
            }
            if af.matches_profile(profile):
                focus_tracks.append(entry)

        focus_tracks.sort(key=lambda x: x["focus_score"], reverse=True)

        # Insight: what BPM range are most of their (covered) top tracks in?
        bpm_insight = None
        if bpm_distribution:
            avg_bpm = sum(bpm_distribution) / len(bpm_distribution)
            bpm_insight = {
                "mean": round(avg_bpm, 1),
                "min": round(min(bpm_distribution), 1),
                "max": round(max(bpm_distribution), 1),
                "suggestion": _bpm_suggestion(avg_bpm),
            }

        return {
            "profile": profile,
            "time_range": time_range,
            "total_top_tracks": len(track_ids),
            "features_total": len(track_ids),
            "features_covered": len(track_ids) - len(no_data_tracks),
            "focus_tracks_count": len(focus_tracks),
            "focus_tracks": focus_tracks[:20],
            "no_data_tracks": no_data_tracks[:20],
            "no_data_count": len(no_data_tracks),
            "bpm_insight": bpm_insight,
            "audio_features_available": True,
            "source": "reccobeats",
        }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _bpm_suggestion(avg_bpm: float) -> str:
    if avg_bpm < 70:
        return "Your listening skews slow — consider widening the BPM floor to 55 for focus sessions."
    if avg_bpm > 140:
        return "Your listening skews fast — a 90–130 BPM focus window may feel more natural than the default."
    return "Your average listening BPM fits well within a standard focus range."
