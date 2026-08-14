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