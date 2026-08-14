from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from models import LyricVisualAnalysisRequest
from services.lyric_visual_service import LyricVisualService

def test_visual_analysis_contract_matches_embedded_client(client: TestClient):
    response = client.post(
        "/api/visuals/llm-analyze",
        json={
            "songTitle": "Fixture Song",
            "artist": "Fixture Artist",
            "lyricLine": "We burn bright like neon fire",
            "section": "chorus",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "dev-music-service-local"
    assert payload["mood"] == "euphoric"
    assert payload["energy"] > 0.5
    assert payload["colorA"].startswith("#")
    assert payload["visualPrompt"]

def test_visual_service_is_deterministic():
    request = LyricVisualAnalysisRequest(
        songTitle="Fixture Song",
        artist="Fixture Artist",
        lyricLine="quiet snow drifts",
        section="verse",
    )

    assert LyricVisualService.analyze_lyric(request) == LyricVisualService.analyze_lyric(request)

def test_audio_features_returns_explicit_neutral_fallback(client: TestClient):
    response = client.get(
        "/api/audio-features",
        params={"title": "Fixture Song", "artist": "Fixture Artist", "duration_ms": 180000},
    )

    assert response.status_code == 200
    assert response.json() == {
        "available": False,
        "source": "neutral_default",
        "confidence": 0.0,
        "reason": "missing_spotify_id",
        "title": "Fixture Song",
        "artist": "Fixture Artist",
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
        "duration_ms": 180000,
    }

def test_audio_features_uses_authenticated_spotify_priors(client: TestClient):
    feature = MagicMock()
    feature.to_dict.return_value = {
        "track_id": "abc123",
        "tempo": 128.0,
        "energy": 0.82,
        "valence": 0.61,
    }
    with (
        patch("main.SpotifyImportService._access_token", return_value="token"),
        patch("main.FocusService.get_track_features", new=AsyncMock(return_value=feature)),
    ):
        response = client.get(
            "/api/audio-features",
            params={"title": "Fixture Song", "artist": "Fixture Artist", "spotify_id": "abc123"},
        )

    assert response.status_code == 200
    assert response.json()["source"] == "spotify_legacy"
    assert response.json()["providerTrackId"] == "abc123"
    assert response.json()["tempo"] == 128.0