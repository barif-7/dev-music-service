from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from models import LyricVisualAnalysisRequest
from services.lyric_visual_service import LyricVisualService

def test_standalone_lab_localizes_the_latest_base44_reader_and_sequencer():
    repo = Path(__file__).resolve().parents[1]
    lab = (repo / "lyrics-shader-lab/src/pages/LyricShaderLab.jsx").read_text()
    language_select = (repo / "lyrics-shader-lab/src/components/bilingual/LanguageSelect.jsx").read_text()
    sequencer = (repo / "lyrics-shader-lab/src/components/shader-lab/LyricSequencer.jsx").read_text()
    panel = (repo / "lyrics-shader-lab/src/components/shader-lab/VisualizerPanel.jsx").read_text()
    reader = (repo / "lyrics-shader-lab/src/components/bilingual/BilingualReader.jsx").read_text()

    assert "LanguageSelect" in lab
    assert "BilingualTimeline" in lab
    assert "LearnControls" in lab
    assert "VocabularyCard" in lab
    assert "LiveAnnouncer" in lab
    assert "createCaptionLocalizerProvider" in lab
    assert "useBilingualReader" in lab
    assert "LyricSequencer" in lab
    assert "activeSequencerOverride" in lab
    assert 'readerMode === "timeline"' in lab
    assert 'readerMode === "learn"' in lab
    assert "Original only" in language_select
    assert "DragDropContext" in sequencer
    assert "onLyricsReorder" in sequencer
    assert "sequencerOverride={sequencerOverride}" in panel
    assert "enterMotion" in reader
    assert "exitMotion" in reader
    assert "positionClass" in reader

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
