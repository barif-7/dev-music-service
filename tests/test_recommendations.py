"""Recommendation ranking, bounded inputs, degradation and private preferences."""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from models import RecommendationRequest
from services.focus_service import AudioFeatures, DEFAULT_PROFILE, FocusProfile
from services.recommendation_service import RecommendationService
from services.spotify_import_service import SpotifyImportService


@pytest.fixture(autouse=True)
def isolated_preferences(tmp_path, monkeypatch):
    monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BETA_AUTH_ENABLED", "false")


def track(title, tempo=None, **extra):
    return {"title": title, "artist": "Artist", **({"tempo": tempo} if tempo else {}), **extra}


class FakeProvider:
    def __init__(self, features=None):
        self.features = features or {}
        self.requested = []

    async def get_features_bulk(self, ids):
        self.requested.extend(ids)
        return {key: value for key, value in self.features.items() if key in ids}


async def test_listening_rank_uses_recency_and_counts():
    now = 1800000000000
    payload = RecommendationRequest(
        mode="listening",
        candidates=[track("Slow", 75), track("Fast", 145)],
        history=[track("New favorite", 145, play_count=10, played_at=now),
                 track("Old song", 75, play_count=1, played_at=now - 60 * 86400000)],
        current_track=track("Current", 75),
    )
    result = await RecommendationService.recommend(payload, now_ms=now)
    assert result["target_bpm"] > 140
    ordered = [item["title"] for item in result["tracks"]]
    assert ordered.index("Fast") < ordered.index("Slow")
    assert result["history_count"] == 2
    assert all(0 <= item["score"] <= 100 for item in result["tracks"])


async def test_current_bpm_starts_listening_without_inventing_history():
    result = await RecommendationService.recommend(RecommendationRequest(
        mode="listening", candidates=[track("Match", 110), track("Distant", 70)],
        current_track=track("Playing", 112),
    ))
    assert result["target_bpm"] == 112
    assert result["history_count"] == 0
    assert result["tracks"][0]["title"] == "Match"
    assert "current track" in result["tracks"][0]["reason"]


async def test_focus_history_and_energy_affect_order_without_listening():
    FocusProfile.save({"bpm_min": 60, "bpm_max": 90, "energy_max": 0.3})
    FocusProfile.save({"bpm_min": 130, "bpm_max": 160, "energy_max": 0.3})
    payload = RecommendationRequest(mode="focus", candidates=[
        track("Old profile", 75, energy=0.2),
        track("New profile", 145, energy=0.2),
        track("Too energetic", 145, energy=0.95),
    ])
    result = await RecommendationService.recommend(payload)
    assert result["profile_history_count"] == 2
    assert result["tracks"][0]["title"] == "New profile"
    assert result["target_bpm"] is None
    assert "profile history" in result["tracks"][0]["reason"]
    scores = {row["title"]: row["score"] for row in result["tracks"]}
    assert scores["New profile"] > scores["Too energetic"]


async def test_modes_can_rank_the_same_tracks_differently():
    common = {"candidates": [track("Focus pace", 90), track("Listening pace", 150)],
              "current_track": track("Current", 150)}
    listening = await RecommendationService.recommend(RecommendationRequest(mode="listening", **common))
    focus = await RecommendationService.recommend(RecommendationRequest(mode="focus", **common))
    blend = await RecommendationService.recommend(RecommendationRequest(mode="blend", **common))
    assert listening["tracks"][0]["title"] == "Listening pace"
    assert focus["tracks"][0]["title"] == "Focus pace"
    assert all("listening" in row["reason"] or "current track" in row["reason"] for row in blend["tracks"])
    assert all("focus profile" in row["reason"] for row in blend["tracks"])


async def test_unknown_audio_has_no_score_and_listening_cold_start_is_empty():
    payload = RecommendationRequest(candidates=[track("Unknown")])
    result = await RecommendationService.recommend(payload)
    assert result["tracks"][0]["score"] is None
    assert result["features_covered"] == 0
    assert result["target_bpm"] is None
    assert result["profile_history_count"] == 0
    assert "No audio" in result["message"]
    result = await RecommendationService.recommend(payload.model_copy(update={"mode": "listening"}))
    assert result["tracks"] == []
    assert "measured BPM" in result["message"]


async def test_deduplication_current_exclusion_and_result_limit():
    result = await RecommendationService.recommend(RecommendationRequest(
        candidates=[track("Playing", 90, key="now"), track("Next", key="queue-next"),
                    track("Next", 90, spotify_id="next"), track("Other", 110)],
        history=[track("Next", 90, spotify_id="next")],
        current_track=track("Playing", key="different-key"), limit=1,
    ), provider=FakeProvider())
    assert result["candidates_total"] == 2
    assert len(result["tracks"]) == 1
    assert result["tracks"][0]["title"] == "Next"
    assert result["tracks"][0]["key"] == "queue-next"
    assert result["tracks"][0]["tempo"] == 90


async def test_provider_enrichment_keeps_partial_coverage_honest():
    provider = FakeProvider({"a": AudioFeatures({"id": "a", "tempo": 92, "instrumentalness": 0.8})})
    result = await RecommendationService.recommend(RecommendationRequest(
        candidates=[track("Covered", spotify_id="a"), track("Missing", spotify_id="b")],
    ), provider=provider)
    assert provider.requested == ["a", "b"]
    assert result["features_covered"] == 1
    assert result["tracks"][0]["title"] == "Covered"
    assert result["tracks"][0]["feature_source"] == "reccobeats"
    assert result["tracks"][1]["score"] is None


async def test_provider_timeout_preserves_existing_measurements(monkeypatch):
    provider = FakeProvider()

    async def slow(_):
        await asyncio.sleep(1)

    monkeypatch.setattr(provider, "get_features_bulk", slow)
    monkeypatch.setattr(RecommendationService, "_FEATURE_TIMEOUT", 0.001)
    result = await RecommendationService.recommend(RecommendationRequest(
        candidates=[track("Measured", 90, spotify_id="a"), track("Unknown")],
    ), provider=provider)
    assert result["tracks"][0]["score"] is not None
    assert result["warnings"]
    assert result["tracks"][1]["score"] is None


async def test_connected_spotify_supplies_candidates_and_listening_history(monkeypatch):
    spotify = AsyncMock(return_value={"items": [
        {"id": "top1", "name": "Spotify song", "artists": [{"name": "Artist"}],
         "album": {"name": "Album", "images": []}, "duration_ms": 123000},
    ]})
    monkeypatch.setattr(SpotifyImportService, "_spotify_get", spotify)
    provider = FakeProvider({"top1": AudioFeatures({"id": "top1", "tempo": 106})})
    result = await RecommendationService.recommend(
        RecommendationRequest(mode="listening"), spotify_access_token="test-token", provider=provider,
    )
    assert result["tracks"][0]["title"] == "Spotify song"
    assert result["tracks"][0]["duration"] == 123
    assert result["target_bpm"] == 106
    assert "Spotify listening history" in result["tracks"][0]["reason"]


async def test_disconnected_spotify_degrades_to_browser_candidates(monkeypatch):
    monkeypatch.setattr(SpotifyImportService, "_spotify_get", AsyncMock(side_effect=RuntimeError("expired")))
    result = await RecommendationService.recommend(
        RecommendationRequest(candidates=[track("Browser", 90)]), spotify_access_token="expired",
    )
    assert result["tracks"][0]["title"] == "Browser"
    assert len(result["warnings"]) == 1


def test_saved_profile_history_is_bounded_private_and_resettable(tmp_path):
    for bpm in range(60, 90):
        FocusProfile.save({"bpm_min": bpm, "bpm_max": bpm + 20}, "one@example.com")
    FocusProfile.save({"bpm_min": 89, "bpm_max": 109}, "one@example.com")
    assert len(FocusProfile.history("one@example.com")) == 20
    assert FocusProfile.history("one@example.com")[0]["bpm_min"] == 70
    assert FocusProfile.history("two@example.com") == []
    assert "_profile_history" not in FocusProfile.load("one@example.com")
    assert FocusProfile.load("two@example.com") == DEFAULT_PROFILE
    assert "@" not in str(next((tmp_path / "users").glob("*/focus_profile.json")))
    FocusProfile.reset("one@example.com")
    assert FocusProfile.history("one@example.com") == []


def test_legacy_profile_becomes_history_and_caller_cannot_inject_it(tmp_path):
    (tmp_path / "focus_profile.json").write_text(json.dumps({**DEFAULT_PROFILE, "bpm_min": 80}))
    assert FocusProfile.history()[0]["bpm_min"] == 80
    FocusProfile.save({"bpm_min": 90, "_profile_history": [{"bpm_min": 1}]})
    assert [profile["bpm_min"] for profile in FocusProfile.history()] == [80, 90]


def test_route_accepts_browser_tracks_without_spotify(client):
    response = client.post("/api/recommendations", json={
        "mode": "listening", "candidates": [track("Next", 100)], "current_track": track("Playing", 100),
    })
    assert response.status_code == 200
    assert response.json()["tracks"][0]["title"] == "Next"


@pytest.mark.parametrize("payload", [
    {"mode": "unknown"}, {"limit": 51}, {"limit": 0},
    {"candidates": [track("Song")] * 301}, {"history": [track("Song")] * 101},
    {"candidates": [{"title": "Song", "tempo": 0}]},
    {"candidates": [track("Song", 401)]},
    {"candidates": [{"title": "   "}]},
    {"candidates": [track("Song", energy=1.1)]},
])
def test_route_rejects_invalid_or_unbounded_inputs(client, payload):
    assert client.post("/api/recommendations", json=payload).status_code == 422


def test_route_uses_authenticated_users_profile_history(client, monkeypatch):
    monkeypatch.setenv("BETA_AUTH_ENABLED", "true")
    monkeypatch.setenv("BETA_AUTH_SECRET", "recommendation-test-signing-secret")
    monkeypatch.setenv("BETA_INVITE_CODE", "invitation")
    monkeypatch.setenv("BETA_ALLOWED_EMAILS", "one@example.com,two@example.com")
    # beta_auth_configured also requires an owner drawn from the allowed list.
    monkeypatch.setenv("BETA_OWNER_EMAIL", "one@example.com")
    monkeypatch.setenv("BETA_COOKIE_SECURE", "false")
    body = {"mode": "focus", "candidates": [track("Slow", 70), track("Fast", 150)]}
    assert client.post("/api/recommendations", json=body).status_code == 401
    for email, lower, upper, expected in [
        ("one@example.com", 60, 80, "Slow"), ("two@example.com", 140, 160, "Fast"),
    ]:
        assert client.post("/api/auth/login", json={"email": email, "invite_code": "invitation"}).status_code == 200
        assert client.post("/api/focus/profile", json={"bpm_min": lower, "bpm_max": upper}).status_code == 200
        response = client.post("/api/recommendations", json=body)
        assert response.status_code == 200
        assert response.json()["tracks"][0]["title"] == expected
        assert response.json()["profile_history_count"] == 1
