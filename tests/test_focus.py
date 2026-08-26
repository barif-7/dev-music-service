"""Tests for services.focus_service — pure logic + injected provider, no network."""

import pytest

from services.focus_service import AudioFeatures, DEFAULT_PROFILE, FocusProfile, FocusService


@pytest.fixture(autouse=True)
def _isolate_profile(tmp_path, monkeypatch):
    monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))


def _make_af(overrides=None):
    base = {
        "id": "track123",
        "tempo": 90.0,
        "energy": 0.5,
        "valence": 0.5,
        "instrumentalness": 0.8,
        "acousticness": 0.3,
        "speechiness": 0.05,
        "liveness": 0.1,
        "danceability": 0.6,
        "loudness": -8.0,
    }
    if overrides:
        base.update(overrides)
    return AudioFeatures(base)


class TestFocusProfileSave:
    def test_clamps_bpm_min_below_floor(self):
        result = FocusProfile.save({"bpm_min": 10, "bpm_max": 120})
        assert result["bpm_min"] == 40

    def test_clamps_bpm_max_above_bpm_min(self):
        result = FocusProfile.save({"bpm_min": 100, "bpm_max": 100})
        assert result["bpm_max"] >= result["bpm_min"] + 5

    def test_clamps_instrumentalness(self):
        result = FocusProfile.save({"instrumentalness_min": 2.0})
        assert result["instrumentalness_min"] == 1.0

    def test_clamps_energy_range(self):
        result = FocusProfile.save({"energy_min": -0.5, "energy_max": 1.5})
        assert result["energy_min"] == 0.0
        assert result["energy_max"] == 1.0

    def test_persists_and_reloads(self):
        FocusProfile.save({"bpm_min": 70, "bpm_max": 130})
        loaded = FocusProfile.load()
        assert loaded["bpm_min"] == 70
        assert loaded["bpm_max"] == 130


class TestFocusProfileLoad:
    def test_returns_defaults_when_no_file(self):
        result = FocusProfile.load()
        assert result == DEFAULT_PROFILE

    def test_returns_saved_profile(self):
        FocusProfile.save({"bpm_min": 80, "bpm_max": 140})
        result = FocusProfile.load()
        assert result["bpm_min"] == 80
        assert result["bpm_max"] == 140


class TestFocusProfileReset:
    def test_reset_returns_defaults(self):
        FocusProfile.save({"bpm_min": 80})
        result = FocusProfile.reset()
        assert result == DEFAULT_PROFILE

    def test_load_after_reset_returns_defaults(self):
        FocusProfile.save({"bpm_min": 80})
        FocusProfile.reset()
        result = FocusProfile.load()
        assert result == DEFAULT_PROFILE


class TestAudioFeaturesMatchesProfile:
    def test_matching_track(self):
        af = _make_af({"tempo": 90, "instrumentalness": 0.8, "energy": 0.5, "valence": 0.5})
        assert af.matches_profile(DEFAULT_PROFILE) is True

    def test_bpm_too_low(self):
        af = _make_af({"tempo": 40})
        assert af.matches_profile(DEFAULT_PROFILE) is False

    def test_bpm_too_high(self):
        af = _make_af({"tempo": 200})
        assert af.matches_profile(DEFAULT_PROFILE) is False

    def test_instrumentalness_too_low(self):
        af = _make_af({"instrumentalness": 0.1})
        assert af.matches_profile(DEFAULT_PROFILE) is False

    def test_energy_out_of_range(self):
        profile = {
            "bpm_min": 60, "bpm_max": 120,
            "instrumentalness_min": 0.0,
            "energy_min": 0.3, "energy_max": 0.7,
            "valence_min": 0.0, "valence_max": 1.0,
        }
        af = _make_af({"energy": 0.9})
        assert af.matches_profile(profile) is False


class TestAudioFeaturesFocusScore:
    def test_perfect_match_scores_high(self):
        af = _make_af({"tempo": 90, "instrumentalness": 1.0, "speechiness": 0.0, "liveness": 0.0})
        score = af.focus_score(DEFAULT_PROFILE)
        assert score > 70

    def test_poor_match_scores_low(self):
        af = _make_af({"tempo": 200, "instrumentalness": 0.0, "speechiness": 0.8, "liveness": 0.9})
        score = af.focus_score(DEFAULT_PROFILE)
        assert score < 30

    def test_score_in_range(self):
        af = _make_af()
        score = af.focus_score(DEFAULT_PROFILE)
        assert 0 <= score <= 100

    def test_to_dict_contains_expected_keys(self):
        af = _make_af()
        d = af.to_dict()
        assert "track_id" in d
        assert "tempo" in d
        assert "energy" in d
        assert "instrumentalness" in d
        assert d["source"] == "reccobeats"


class _FakeProvider:
    """In-memory AudioFeatureProvider — proves FocusService is source-agnostic."""

    def __init__(self, features: dict):
        self._features = features  # spotify_id -> AudioFeatures

    async def get_features(self, spotify_track_id):
        return self._features.get(spotify_track_id)

    async def get_features_bulk(self, spotify_track_ids):
        return {sid: self._features[sid] for sid in spotify_track_ids if sid in self._features}


class TestAnalysePlaylistWithInjectedProvider:
    async def test_ranks_covered_tracks_and_skips_no_data(self):
        provider = _FakeProvider({
            "a": AudioFeatures({"id": "a", "tempo": 90, "instrumentalness": 0.9,
                                "energy": 0.5, "valence": 0.5}),
            "b": AudioFeatures({"id": "b", "tempo": 70, "instrumentalness": 0.7,
                                "energy": 0.4, "valence": 0.5}),
        })
        result = await FocusService.analyse_playlist(
            ["a", "b", "c"], profile=DEFAULT_PROFILE, provider=provider
        )
        ids = [r["track_id"] for r in result]
        assert ids[0] == "a"          # best focus score first
        assert "c" not in ids         # no provider data -> not ranked (no fake zero)
        assert len(result) == 2
