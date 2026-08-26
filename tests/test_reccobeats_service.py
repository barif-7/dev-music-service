"""Tests for services.reccobeats_service — all httpx responses mocked.

The fixtures below are trimmed but real-shape, captured from the live
ReccoBeats API (GET /v1/track?ids=… and GET /v1/track/{id}/audio-features),
so the field mapping is exercised against the authentic JSON structure.
"""

import httpx
import pytest

from services.reccobeats_service import ReccoBeatsProvider, _spotify_id_from_href

# Spotify track ID -> ReccoBeats UUID (as the resolve endpoint would report).
_KNOWN = {
    "0VjIjW4GlUZAMYd2vXMi3b": "25c8ca63-5895-4572-84eb-a7040bc08c4d",  # has features
    "7qiZfU4dY1lWllzX7mPBI3": "ef0e9524-99b3-483c-9690-6abd71e6064d",  # resolves, no features
}

# Real-shape audio-features response (captured from the live API). Note the
# scientific-notation instrumentalness and the ReccoBeats UUID in `id`.
_FEATURES_BY_RID = {
    "25c8ca63-5895-4572-84eb-a7040bc08c4d": {
        "id": "25c8ca63-5895-4572-84eb-a7040bc08c4d",
        "href": "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
        "isrc": "USUG11904206",
        "acousticness": 0.00143,
        "danceability": 0.513,
        "energy": 0.73,
        "instrumentalness": 9.54e-5,
        "key": 1,
        "liveness": 0.0897,
        "loudness": -5.94,
        "mode": 1,
        "speechiness": 0.0598,
        "tempo": 171.001,
        "valence": 0.334,
    },
}


def _make_handler(state: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"].append(str(request.url))
        path = request.url.path
        if path.endswith("/track"):
            ids = [i for i in request.url.params.get("ids", "").split(",") if i]
            content = []
            for sid in ids:
                rid = _KNOWN.get(sid)
                if rid:
                    content.append({
                        "id": rid,
                        "trackTitle": "Track",
                        "artists": [{"id": "a", "name": "Artist",
                                     "href": "https://open.spotify.com/artist/x"}],
                        "durationMs": 200000,
                        "isrc": "X",
                        "href": f"https://open.spotify.com/track/{sid}",
                        "popularity": 50,
                    })
            content.reverse()  # prove callers re-associate by id, not by order
            return httpx.Response(200, json={"content": content})
        if path.endswith("/audio-features"):
            rid = path.split("/")[-2]
            if state.get("rate_limit_once") and not state.get("_rl_done"):
                state["_rl_done"] = True
                return httpx.Response(429, headers={"Retry-After": "0"}, json={})
            feats = _FEATURES_BY_RID.get(rid)
            if feats:
                return httpx.Response(200, json=feats)
            return httpx.Response(404, json={
                "timestamp": "2026-06-14T00:00:00.000+00:00",
                "error": f"Track not found with id : '{rid}' not found",
                "path": f"uri={path}",
                "status": 4041,
            })
        return httpx.Response(404, json={})
    return handler


def _make_provider(state: dict) -> ReccoBeatsProvider:
    provider = ReccoBeatsProvider(base_url="https://api.reccobeats.com/v1")
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(_make_handler(state)))
    return provider


class TestHrefParsing:
    def test_extracts_spotify_id(self):
        assert _spotify_id_from_href(
            "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"
        ) == "0VjIjW4GlUZAMYd2vXMi3b"

    def test_none_for_missing_or_malformed(self):
        assert _spotify_id_from_href(None) is None
        assert _spotify_id_from_href("https://open.spotify.com/artist/x") is None


class TestGetFeatures:
    async def test_single_fetch_maps_fields(self):
        provider = _make_provider({"calls": []})
        af = await provider.get_features("0VjIjW4GlUZAMYd2vXMi3b")
        assert af is not None
        assert af.track_id == "0VjIjW4GlUZAMYd2vXMi3b"   # spotify id, not the UUID
        assert af.source == "reccobeats"
        assert af.tempo == pytest.approx(171.001)
        assert af.energy == pytest.approx(0.73)
        assert af.valence == pytest.approx(0.334)
        assert af.instrumentalness == pytest.approx(9.54e-5)  # sci-notation parsed
        assert af.loudness == pytest.approx(-5.94)

    async def test_bulk_reassociates_by_id_not_order(self):
        # The resolve handler reverses content order; results must still map to
        # the right Spotify IDs.
        provider = _make_provider({"calls": []})
        result = await provider.get_features_bulk(
            ["0VjIjW4GlUZAMYd2vXMi3b", "7qiZfU4dY1lWllzX7mPBI3"]
        )
        assert "0VjIjW4GlUZAMYd2vXMi3b" in result
        assert result["0VjIjW4GlUZAMYd2vXMi3b"].track_id == "0VjIjW4GlUZAMYd2vXMi3b"
        # 7qiZ… resolves but has no audio-features -> absent (no fake data)
        assert "7qiZfU4dY1lWllzX7mPBI3" not in result

    async def test_unresolved_track_returns_none(self):
        provider = _make_provider({"calls": []})
        assert await provider.get_features("unknownTrackId00000000") is None

    async def test_resolved_but_no_features_returns_none(self):
        provider = _make_provider({"calls": []})
        assert await provider.get_features("7qiZfU4dY1lWllzX7mPBI3") is None


class TestNegativeCaching:
    async def test_known_missing_id_not_refetched(self):
        state = {"calls": []}
        provider = _make_provider(state)
        await provider.get_features("unknownTrackId00000000")
        calls_after_first = len(state["calls"])
        await provider.get_features("unknownTrackId00000000")
        assert len(state["calls"]) == calls_after_first  # cache hit, no new request

    async def test_positive_result_cached(self):
        state = {"calls": []}
        provider = _make_provider(state)
        await provider.get_features("0VjIjW4GlUZAMYd2vXMi3b")
        calls_after_first = len(state["calls"])
        af = await provider.get_features("0VjIjW4GlUZAMYd2vXMi3b")
        assert af is not None
        assert len(state["calls"]) == calls_after_first  # served from cache


class TestRateLimit:
    async def test_429_then_success_honors_backoff(self, mocker):
        sleep = mocker.patch("services.reccobeats_service.asyncio.sleep")
        state = {"calls": [], "rate_limit_once": True}
        provider = _make_provider(state)
        af = await provider.get_features("0VjIjW4GlUZAMYd2vXMi3b")
        assert af is not None             # retried past the 429
        sleep.assert_awaited()            # backed off using Retry-After
