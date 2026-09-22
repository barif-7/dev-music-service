"""Personal recommendations from measured listening and saved focus preferences.

Candidate metadata comes from the browser and, when connected, Spotify top
tracks. Audio measurements come from the existing provider or browser analyser.
No stream URL is fetched and missing measurements never become made-up scores.
"""
from __future__ import annotations

import asyncio
import math
import time
from typing import TYPE_CHECKING

import structlog

from models import RecommendationRequest
from services.focus_service import FocusProfile, _resolve_provider
from services.spotify_import_service import SpotifyImportService

if TYPE_CHECKING:
    from services.audio_feature_provider import AudioFeatureProvider

logger = structlog.get_logger()
_FEATURES = ("tempo", "energy", "instrumentalness", "valence", "speechiness", "liveness")


def _identities(track: dict) -> set[str]:
    keys = set()
    if track.get("spotify_id"):
        keys.add(f"spotify:{track['spotify_id']}")
    if track.get("provider") and track.get("provider_track_id"):
        keys.add(f"{track['provider']}:{track['provider_track_id']}")
    if track.get("key"):
        keys.add(f"key:{track['key']}")
    title = " ".join((track.get("title") or "").lower().split())
    artist = " ".join((track.get("artist") or "").lower().split())
    if title:
        keys.add(f"song:{title}|{artist}")
    return keys


def _unique_tracks(tracks: list[dict]) -> list[dict]:
    result: list[dict] = []
    indices: dict[str, int] = {}
    for track in tracks:
        identities = _identities(track)
        index = next((indices[key] for key in sorted(identities) if key in indices), None)
        if index is None:
            index = len(result)
            result.append(dict(track))
        else:
            # Preserve queue identity; fill missing measurements from history.
            result[index] = {**track, **{key: value for key, value in result[index].items()
                                        if value is not None}}
        for key in identities:
            indices[key] = index
    return result


def _measured(track: dict, name: str) -> float | None:
    value = track.get(name)
    if value is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    if name == "tempo":
        return float(value) if 0 < value <= 400 else None
    return float(value) if 0 <= value <= 1 else None


def _listening_target(history: list[dict], current: dict, now_ms: float) -> tuple[float | None, str]:
    weighted = []
    for index, track in enumerate(history):
        tempo = _measured(track, "tempo")
        if tempo is None:
            continue
        played_at = track.get("played_at")
        recency = (math.exp(-max(0, now_ms - played_at) / (14 * 86400000))
                   if played_at is not None else 0.95 ** index)
        weight = max(0.01, recency) * (1 + math.log1p(min(20, track.get("play_count") or 1)))
        weighted.append((tempo, weight))
    if weighted:
        return sum(tempo * weight for tempo, weight in weighted) / sum(w for _, w in weighted), "history"
    return _measured(current, "tempo"), "current track"


def _range_affinity(value: float, lower: float, upper: float) -> float:
    if lower <= value <= upper:
        return 1.0
    distance = lower - value if value < lower else value - upper
    return max(0.0, 1.0 - distance / max(upper - lower, 0.15))


def _focus_score(track: dict, profile: dict) -> float | None:
    components: list[tuple[float, float]] = []
    tempo = _measured(track, "tempo")
    if tempo is not None:
        midpoint = (profile["bpm_min"] + profile["bpm_max"]) / 2
        width = max(15, (profile["bpm_max"] - profile["bpm_min"]) / 2)
        components.append((0.40, max(0, 1 - abs(tempo - midpoint) / (width * 2))))
    instrumentalness = _measured(track, "instrumentalness")
    if instrumentalness is not None:
        floor = profile["instrumentalness_min"]
        components.append((0.30, min(1, instrumentalness / floor) if floor > 0 else 1))
    for name, weight in (("energy", 0.12), ("valence", 0.08)):
        value = _measured(track, name)
        if value is not None:
            components.append((weight, _range_affinity(value, profile[f"{name}_min"], profile[f"{name}_max"])))
    for name, weight, penalty in (("speechiness", 0.06, 3), ("liveness", 0.04, 2)):
        value = _measured(track, name)
        if value is not None:
            components.append((weight, 1 - min(1, value * penalty)))
    if not components:
        return None
    coverage = sum(weight for weight, _ in components)
    # Partial measurements remain useful, with lower confidence than full data.
    return sum(weight * score for weight, score in components) / coverage * (0.6 + 0.4 * coverage)


class RecommendationService:
    _MAX_ENRICHMENT = 100
    _FEATURE_TIMEOUT = 8.0
    _SPOTIFY_TIMEOUT = 4.0

    @staticmethod
    async def _spotify_candidates(access_token: str) -> list[dict]:
        payload = await SpotifyImportService._spotify_get(
            access_token, "/me/top/tracks", {"time_range": "short_term", "limit": 40},
        )
        result = []
        for item in payload.get("items") or []:
            if not item.get("id") or not item.get("name"):
                continue
            album = item.get("album") or {}
            images = album.get("images") or []
            result.append({
                "key": f"spotify:{item['id']}", "spotify_id": item["id"],
                "provider": "spotify", "provider_track_id": item["id"],
                "title": item["name"],
                "artist": ", ".join(a["name"] for a in item.get("artists") or [] if a.get("name")),
                "album": album.get("name"), "thumbnail": images[0].get("url") if images else None,
                "duration": (item.get("duration_ms") or 0) / 1000,
            })
        return result

    @classmethod
    async def recommend(
        cls, payload: RecommendationRequest, *, user_id: str | None = None,
        spotify_access_token: str | None = None, provider: "AudioFeatureProvider | None" = None,
        now_ms: float | None = None,
    ) -> dict:
        warnings: list[str] = []
        candidates = [track.model_dump(exclude_none=True) for track in payload.candidates]
        history = _unique_tracks([track.model_dump(exclude_none=True) for track in payload.history])
        current = payload.current_track.model_dump(exclude_none=True) if payload.current_track else {}
        spotify_candidates = []
        if spotify_access_token:
            try:
                spotify_candidates = await asyncio.wait_for(
                    cls._spotify_candidates(spotify_access_token), timeout=cls._SPOTIFY_TIMEOUT,
                )
            except Exception as exc:
                logger.info("recommendation_spotify_unavailable", error_type=type(exc).__name__)
                warnings.append("Spotify listening history is unavailable; using this browser's tracks.")
        # Spotify top tracks are actual listening history, usable for a new browser.
        history_source = "browser"
        if not history and spotify_candidates:
            history = [dict(track) for track in spotify_candidates]
            history_source = "Spotify"
        candidates = _unique_tracks([*candidates, *history, *spotify_candidates])
        current_ids = _identities(current)
        candidates = [track for track in candidates if not current_ids.intersection(_identities(track))]

        enrichment_ids = list(dict.fromkeys(
            track["spotify_id"] for track in [*history, current, *candidates]
            if track.get("spotify_id") and any(_measured(track, name) is None for name in _FEATURES)
        ))
        if enrichment_ids:
            try:
                features = await asyncio.wait_for(
                    _resolve_provider(provider).get_features_bulk(enrichment_ids[:cls._MAX_ENRICHMENT]),
                    timeout=cls._FEATURE_TIMEOUT,
                )
                for track in [*history, current, *candidates]:
                    feature = features.get(track.get("spotify_id"))
                    if feature is not None:
                        values = feature.to_dict()
                        for name in _FEATURES:
                            if _measured(values, name) is not None:
                                track[name] = values[name]
                        track["feature_source"] = feature.source
            except Exception as exc:
                logger.info("recommendation_features_unavailable", error_type=type(exc).__name__)
                warnings.append("Audio feature lookup is unavailable; using measurements already collected.")
            if len(enrichment_ids) > cls._MAX_ENRICHMENT:
                warnings.append("Audio lookup was limited to the first 100 tracks for this request.")

        target_bpm, target_source = _listening_target(history, current, now_ms or time.time() * 1000)
        profile = FocusProfile.load(user_id)
        profile_history = FocusProfile.history(user_id)
        scoring_profiles = list(profile_history)
        if not scoring_profiles or scoring_profiles[-1] != profile:
            scoring_profiles.append(profile)
        profile_weights = [0.72 ** age for age in range(len(scoring_profiles))]
        scored: list[dict] = []
        features_covered = 0
        for track in candidates:
            tempo = _measured(track, "tempo")
            listening_score = (max(0, 1 - abs(tempo - target_bpm) / max(20, target_bpm * 0.3))
                               if tempo is not None and target_bpm is not None else None)
            focus_parts = [_focus_score(track, saved) for saved in reversed(scoring_profiles)]
            focus_score = (sum(score * weight for score, weight in zip(focus_parts, profile_weights))
                           / sum(profile_weights) if focus_parts[0] is not None else None)
            if any(_measured(track, name) is not None for name in _FEATURES):
                features_covered += 1
            parts = []
            reasons = []
            if payload.mode in ("blend", "listening") and listening_score is not None:
                parts.append(listening_score)
                origin = ("Spotify listening history" if target_source == "history" and history_source == "Spotify"
                          else "listening history" if target_source == "history" else "current track")
                reasons.append(f"{tempo:g} BPM · {origin} averages {target_bpm:.0f} BPM")
            if payload.mode in ("blend", "focus") and focus_score is not None:
                parts.append(focus_score)
                reasons.append("Ranked against your focus profile history" if len(profile_history) > 1
                               else "Ranked against your focus profile")
            score = round(sum(parts) / len(parts) * 100, 1) if parts else None
            scored.append({**track, "score": score,
                           "reason": "; ".join(reasons) if reasons else "No audio data for this recommendation mode"})
        scored.sort(key=lambda track: (track["score"] is not None, track["score"] or 0), reverse=True)
        message = ""
        if payload.mode == "listening" and target_bpm is None:
            scored = []
            message = "Listen to a song with a measured BPM to start listening recommendations."
        elif not candidates:
            message = "Add songs to your playing set or listen to more tracks to get recommendations."
        elif not any(track["score"] is not None for track in scored):
            message = "No audio measurements are available for these tracks yet."
        elif payload.mode == "blend" and target_bpm is None:
            message = "Using your focus profile until listening BPM is available."
        return {
            "tracks": scored[:payload.limit], "mode": payload.mode,
            "target_bpm": round(target_bpm, 1) if target_bpm is not None else None,
            "history_count": len(history), "profile_history_count": len(profile_history),
            "features_covered": features_covered, "candidates_total": len(candidates),
            "message": message, "warnings": warnings,
        }
