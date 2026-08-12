from __future__ import annotations

import threading
import time

import structlog

from config import get_settings
from services.focus_storage import build_focus_profile_storage
from services.spotify_import_service import SpotifyImportService
from services.spotify_import_service import SpotifyImportError

logger = structlog.get_logger()

_AUDIO_FEATURES_UNAVAILABLE_MESSAGE = (
    "Spotify no longer exposes audio features to this app, so BPM and focus scoring are unavailable. "
    "Showing your top tracks without analysis."
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
# Audio features from Spotify
# ---------------------------------------------------------------------------

class AudioFeatures:
    """
    Wraps a single Spotify audio-features object.
    Spotify returns: tempo, energy, valence, instrumentalness, danceability,
    acousticness, speechiness, liveness, loudness, key, mode, time_signature.
    We surface the ones relevant to focus/ADHD use.
    """

    __slots__ = (
        "track_id", "tempo", "energy", "valence",
        "instrumentalness", "acousticness", "speechiness",
        "liveness", "danceability", "loudness",
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
            "key": self.key,
            "mode": self.mode,
            "time_signature": self.time_signature,
            "duration_ms": self.duration_ms,
        }


class AudioFeaturesUnavailableError(Exception):
    """Raised when Spotify blocks the deprecated audio-features endpoint."""

    def __init__(self) -> None:
        super().__init__(_AUDIO_FEATURES_UNAVAILABLE_MESSAGE)


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
    Fetches Spotify audio features and filters / scores tracks against
    the user's focus profile.

    Spotify audio-features endpoint:
      GET /audio-features/{id}             — single track
      GET /audio-features?ids=id1,id2,...  — batch up to 100
    """

    # In-memory cache: track_id -> (AudioFeatures, expires_at)
    _cache: dict[str, tuple[AudioFeatures, float]] = {}
    _cache_lock = threading.Lock()
    _CACHE_TTL = 3600  # audio features don't change; 1 hour is conservative

    # ---------------------------------------------------------------------------
    # Spotify API helpers (reuse SpotifyImportService._spotify_get pattern)
    # ---------------------------------------------------------------------------

    @staticmethod
    async def _get_audio_features_batch(
        access_token: str,
        track_ids: list[str],
    ) -> list[AudioFeatures]:
        """Batch fetch up to 100 track IDs in a single request."""
        if not track_ids:
            return []

        now = time.monotonic()
        result: list[AudioFeatures | None] = [None] * len(track_ids)
        missing_indices: list[int] = []
        missing_ids: list[str] = []

        with FocusService._cache_lock:
            for i, tid in enumerate(track_ids):
                entry = FocusService._cache.get(tid)
                if entry and entry[1] > now:
                    result[i] = entry[0]
                else:
                    missing_indices.append(i)
                    missing_ids.append(tid)

        if missing_ids:
            # Spotify allows max 100 per request
            for chunk_start in range(0, len(missing_ids), 100):
                chunk_ids = missing_ids[chunk_start:chunk_start + 100]
                chunk_indices = missing_indices[chunk_start:chunk_start + 100]

                try:
                    payload = await SpotifyImportService._spotify_get(
                        access_token,
                        "/audio-features",
                        {"ids": ",".join(chunk_ids)},
                    )
                except SpotifyImportError as exc:
                    if _is_audio_features_unavailable_error(exc):
                        raise AudioFeaturesUnavailableError() from exc
                    raise
                features_list = payload.get("audio_features") or []

                with FocusService._cache_lock:
                    for idx, raw in zip(chunk_indices, features_list):
                        if not raw:
                            continue
                        af = AudioFeatures(raw)
                        FocusService._cache[af.track_id] = (af, now + FocusService._CACHE_TTL)
                        result[idx] = af

        return [af for af in result if af is not None]

    @staticmethod
    async def get_track_features(
        access_token: str,
        track_id: str,
    ) -> AudioFeatures | None:
        try:
            results = await FocusService._get_audio_features_batch(access_token, [track_id])
        except AudioFeaturesUnavailableError:
            return None
        return results[0] if results else None

    # ---------------------------------------------------------------------------
    # Core: analyse a playlist for focus suitability
    # ---------------------------------------------------------------------------

    @staticmethod
    async def analyse_playlist(
        access_token: str,
        track_ids: list[str],
        profile: dict | None = None,
    ) -> list[dict]:
        """
        Given a list of Spotify track IDs, return each track's audio features
        and focus score, sorted best-first.
        """
        if profile is None:
            profile = FocusProfile.load()

        try:
            features = await FocusService._get_audio_features_batch(access_token, track_ids)
        except AudioFeaturesUnavailableError:
            return []

        results = []
        for af in features:
            results.append({
                **af.to_dict(),
                "matches_profile": af.matches_profile(profile),
                "focus_score": af.focus_score(profile),
            })

        results.sort(key=lambda x: x["focus_score"], reverse=True)
        return results

    # ---------------------------------------------------------------------------
    # Focus-filtered playlist preview
    # Enriches the existing ImportedPlaylistPreview tracks with audio features
    # and filters to only tracks that match the focus profile.
    # ---------------------------------------------------------------------------

    @staticmethod
    async def focus_filter_playlist(
        access_token: str,
        playlist_id: str,
        limit: int = 50,
        profile: dict | None = None,
    ) -> dict:
        """
        Fetches up to `limit` tracks from a playlist, enriches with audio
        features, and returns only those matching the focus profile, ranked
        by focus score.
        """
        if profile is None:
            profile = FocusProfile.load()

        # Fetch playlist tracks from Spotify
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

        # Batch fetch audio features
        features_map: dict[str, AudioFeatures] = {}
        try:
            features_list = await FocusService._get_audio_features_batch(access_token, track_ids)
        except AudioFeaturesUnavailableError:
            return {
                "profile": profile,
                "total_tracks": len(tracks_meta),
                "focus_tracks": 0,
                "rejected_tracks": 0,
                "tracks": [],
                "rejected": [],
                "audio_features_available": False,
                "warning": _AUDIO_FEATURES_UNAVAILABLE_MESSAGE,
            }
        for af in features_list:
            features_map[af.track_id] = af

        # Build enriched, filtered results
        matched: list[dict] = []
        rejected: list[dict] = []

        for meta in tracks_meta:
            af = features_map.get(meta["id"])
            if af is None:
                continue
            entry = {
                **meta,
                **af.to_dict(),
                "focus_score": af.focus_score(profile),
                "matches_profile": af.matches_profile(profile),
            }
            if af.matches_profile(profile):
                matched.append(entry)
            else:
                rejected.append(entry)

        matched.sort(key=lambda x: x["focus_score"], reverse=True)

        return {
            "profile": profile,
            "total_tracks": len(tracks_meta),
            "focus_tracks": len(matched),
            "rejected_tracks": len(rejected),
            "tracks": matched,
            "rejected": rejected[:10],  # first 10 rejected so UI can explain why
            "audio_features_available": True,
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
    ) -> dict:
        """
        Fetch user's top tracks and analyse which ones match their focus profile.
        Useful for building a personal understanding of what works for them.
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

        try:
            features_list = await FocusService._get_audio_features_batch(access_token, track_ids)
        except AudioFeaturesUnavailableError:
            return {
                "profile": profile,
                "time_range": time_range,
                "total_top_tracks": len(track_ids),
                "focus_tracks_count": 0,
                "focus_tracks": [],
                "top_tracks": [meta_map[tid] for tid in track_ids if tid in meta_map],
                "bpm_insight": None,
                "audio_features_available": False,
                "warning": _AUDIO_FEATURES_UNAVAILABLE_MESSAGE,
            }
        features_map = {af.track_id: af for af in features_list}

        focus_tracks = []
        non_focus = []
        bpm_distribution: list[float] = []

        for tid in track_ids:
            meta = meta_map.get(tid, {})
            af = features_map.get(tid)
            if af is None:
                continue
            bpm_distribution.append(af.tempo)
            entry = {**meta, **af.to_dict(), "focus_score": af.focus_score(profile), "matches_profile": af.matches_profile(profile)}
            if af.matches_profile(profile):
                focus_tracks.append(entry)
            else:
                non_focus.append(entry)

        focus_tracks.sort(key=lambda x: x["focus_score"], reverse=True)

        # Simple insight: what BPM range are most of their top tracks in?
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
            "focus_tracks_count": len(focus_tracks),
            "focus_tracks": focus_tracks[:20],
            "bpm_insight": bpm_insight,
            "audio_features_available": True,
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


def _is_audio_features_unavailable_error(exc: SpotifyImportError) -> bool:
    message = str(exc)
    return "/audio-features" in message and "failed with 403" in message
