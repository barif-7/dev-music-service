"""End-to-end tests for main API endpoints."""
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_returns_ok(self, client: TestClient):
        """Health endpoint should return status ok."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["mode"] == "browser-first"
        assert data["stream_delivery"] == "proxy"
        assert "local_integration" in data
        assert "spotify_import" in data
        assert "caption_localizer_url" in data
        assert data["chromecast"] == "default-media-receiver"

    def test_health_spotify_not_configured(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Health should show spotify_import as missing-client-id when not configured."""
        monkeypatch.setenv("SPOTIFY_CLIENT_ID", "")
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        # Without SPOTIFY_CLIENT_ID env var, should show missing
        assert data["spotify_import"] == "missing-client-id"

    def test_health_spotify_configured(self, client: TestClient, mock_spotify_env):
        """Health should show spotify_import as configured when env var is set."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["spotify_import"] == "configured"

    def test_health_reports_caption_localizer_url(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Health should expose the configured CaptionLocalizer URL for diagnostics."""
        monkeypatch.setenv("CAPTION_LOCALIZER_URL", "http://127.0.0.1:8001")
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["caption_localizer_url"] == "http://127.0.0.1:8001"


class TestFrontendAssets:
    """Tests for the extracted static frontend."""

    def test_root_serves_static_index(self, client: TestClient):
        """Root should serve the static index with the gallery frontend."""
        response = client.get("/")

        assert response.status_code == 200
        assert "Phase · Field" in response.text
        assert 'src="/static/gallery/app.js' in response.text
        assert 'id="streamEl"' in response.text
        assert 'id="appleMusicPanel"' in response.text
        assert 'id="appleMusicImport"' in response.text
        assert 'id="castLauncher"' in response.text
        assert 'src="/static/gallery/cast.js"' in response.text
        assert "cast_sender.js?loadCastFramework=1" in response.text
        assert 'src="/static/gallery/apple-music.js"' in response.text
        assert 'src="/static/gallery/share.js' in response.text
        assert 'id="omniShare"' in response.text
        assert 'id="nbShare"' in response.text
        assert 'id="shareBanner"' in response.text
        share_response = client.get("/static/gallery/share.js")
        assert share_response.status_code == 200
        assert "packagedLyrics" in share_response.text
        assert "url.searchParams.set('lyrics'" in share_response.text
        assert "packagedStream" in share_response.text
        assert "url.searchParams.set('stream'" in share_response.text

    def test_share_entry_serves_static_frontend(self, client: TestClient):
        response = client.get("/share?share=song&title=Fixture%20Song&artist=Fixture%20Artist")

        assert response.status_code == 200
        assert "Phase · Field" in response.text
        assert 'id="shareBanner"' in response.text

    def test_live_translation_language_modal_is_served(self, client: TestClient):
        page = client.get("/")
        gallery = client.get("/static/gallery/app.js")

        assert page.status_code == 200
        assert gallery.status_code == 200
        assert 'id="translationSettingsBtn"' in page.text
        assert 'id="translationSettingsPanel"' in page.text
        assert 'id="translationTargetLocale"' in page.text
        for locale in ("es-MX", "ar", "ur", "hi", "zh-CN", "sw"):
            assert f'value="{locale}"' in page.text
        assert "applyLyricLocaleChoice" in gallery.text
        assert "translationLocaleSel.innerHTML = lyricLocaleSel.innerHTML" in gallery.text
        assert "Current and upcoming lyrics will refresh automatically" in gallery.text

    def test_shader_gallery_exposes_live_api_and_visual_fallback(self, client: TestClient):
        page = client.get("/")
        gallery = client.get("/static/gallery/app.js")
        engine = client.get("/static/gallery/engine.js")
        shaders = client.get("/static/gallery/shaders.js")

        assert page.status_code == gallery.status_code == engine.status_code == shaders.status_code == 200
        assert 'id="shaderApiStatus"' in page.text
        assert 'data-label="Shaders"' in page.text
        assert "live from API" in gallery.text
        assert "ensureApiShader" in gallery.text
        assert "One shared live canvas" in gallery.text
        assert "get('view') === 'shaders'" in gallery.text
        assert "dataset.shaderState = 'fallback'" in engine.text
        assert "standalone ? fragSrc" in engine.text
        assert "const API_FRAGS" in shaders.text
        assert "30 living shaders" in page.text
        assert "uniform float iFlux" in shaders.text
        assert "uniform float iCentroid" in shaders.text
        for shader_id in ("codex", "qwen", "grok", "base44", "replit"):
            assert f"{shader_id}: `" in shaders.text
            assert f"id:'{shader_id}'" in client.get("/static/gallery/data.js").text
        assert "mat2 rotG" in shaders.text
        assert "float sdSegR" in shaders.text
        assert "event horizon" in shaders.text
        assert "scrolling buffer" in client.get("/static/gallery/data.js").text

    def test_static_assets_served(self, client: TestClient):
        """Static CSS and JS assets should be mounted."""
        css_response = client.get("/static/styles.css")
        js_response = client.get("/static/app.js")

        assert css_response.status_code == 200
        assert js_response.status_code == 200
        assert ".themeModal" in css_response.text
        assert "initThemePicker" in js_response.text

    def test_spectrum_view_controls_and_preferences_are_served(self, client: TestClient):
        """The gallery should expose the expanded, persistent spectrum controls."""
        page = client.get("/")
        spectrum = client.get("/static/gallery/eq.js")

        assert page.status_code == 200
        assert spectrum.status_code == 200
        for key in ("frequency", "direction", "spacing", "opacity"):
            assert f'data-key="{key}"' in page.text
        assert 'id="eqReset"' in page.text
        assert "phase-field-spectrum-view-v1" in spectrum.text
        assert "localStorage.setItem" in spectrum.text
        assert "this.opts.frequency==='linear'" in spectrum.text
        for view in ("skyline", "needles", "prism", "halo"):
            assert f'data-v="{view}"' in page.text
            assert f"style==='{view}'" in spectrum.text


class TestPersonalizationEndpoints:
    def test_apple_music_xml_import(self, client: TestClient):
        import plistlib

        payload = plistlib.dumps(
            {
                "Tracks": {
                    "1": {
                        "Name": "Fixture Song",
                        "Artist": "Fixture Artist",
                        "Album": "Fixture Album",
                        "Play Count": 9,
                    }
                }
            }
        )

        response = client.post(
            "/api/import/apple-music/xml",
            content=payload,
            headers={"Content-Type": "application/xml"},
        )

        assert response.status_code == 200
        assert response.json()["library"]["track_count"] == 1
        assert response.json()["albums"][0]["tracks"][0]["plays"] == 9

    def test_apple_music_xml_import_rejects_invalid_file(self, client: TestClient):
        response = client.post(
            "/api/import/apple-music/xml",
            content=b"not xml",
            headers={"Content-Type": "application/xml"},
        )

        assert response.status_code == 400

    def test_apple_music_config_is_safe_when_unconfigured(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setenv("APPLE_MUSIC_DEVELOPER_TOKEN", "")

        response = client.get("/api/apple-music/config")

        assert response.status_code == 200
        assert response.json()["configured"] is False
        assert "developerToken" not in response.json()
        assert response.headers["cache-control"] == "no-store"

    def test_apple_music_config_exposes_origin_bound_client_token(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setenv("APPLE_MUSIC_DEVELOPER_TOKEN", "test-origin-bound-token")
        monkeypatch.setenv("APPLE_MUSIC_STOREFRONT", "ca")

        response = client.get("/api/apple-music/config")

        assert response.status_code == 200
        assert response.json()["configured"] is True
        assert response.json()["developerToken"] == "test-origin-bound-token"
        assert response.json()["storefront"] == "ca"

    def test_persistent_apple_music_library(self, client: TestClient, tmp_path, monkeypatch):
        import json

        path = tmp_path / "apple_music_import.json"
        path.write_text(json.dumps({
            "provider": "apple_music",
            "albums": [{
                "id": "album-1", "name": "Fixture Album", "artist": "Fixture Artist",
                "tracks": [{
                    "provider": "apple_music", "provider_track_id": "TRACK1",
                    "title": "Fixture Song", "artist_names": ["Fixture Artist"],
                }],
            }],
        }))
        monkeypatch.setenv("APPLE_MUSIC_IMPORT_PATH", str(path))

        config = client.get("/api/apple-music/config")
        library = client.get("/api/import/apple-music/library")

        assert config.json()["importAvailable"] is True
        assert library.status_code == 200
        assert library.json()["library"]["track_count"] == 1
        assert library.headers["cache-control"] == "no-store"


class TestSearchEndpoint:
    """Tests for /api/search and /search endpoints."""

    def test_search_requires_query(self, client: TestClient):
        """Search should require query parameter."""
        response = client.get("/api/search")
        
        assert response.status_code == 422  # Validation error

    def test_search_query_min_length(self, client: TestClient):
        """Search should validate minimum query length."""
        response = client.get("/api/search", params={"query": ""})
        
        assert response.status_code == 422

    def test_search_query_max_length(self, client: TestClient):
        """Search should validate maximum query length."""
        long_query = "a" * 501
        response = client.get("/api/search", params={"query": long_query})
        
        assert response.status_code == 422

    def test_search_limit_validation(self, client: TestClient):
        """Search should validate limit parameter."""
        response = client.get("/api/search", params={"query": "test", "limit": 0})
        
        assert response.status_code == 422
        
        response = client.get("/api/search", params={"query": "test", "limit": 10})
        
        assert response.status_code == 422

    @pytest.mark.skip(reason="Requires actual YouTube API access")
    def test_search_returns_results(self, client: TestClient, sample_search_query):
        """Search should return results for valid query."""
        response = client.get(
            "/api/search",
            params={"query": sample_search_query, "limit": 1}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            result = data[0]
            assert "title" in result
            assert "webpage_url" in result
            assert "stream_url" in result
            assert "duration" in result

    def test_search_cache_headers(self, client: TestClient):
        """Search responses should include cache headers."""
        response = client.get("/api/search", params={"query": "test", "limit": 1})
        
        # Even if search fails, should have tried to set headers
        if response.status_code == 200:
            assert "Cache-Control" in response.headers

    def test_search_accepts_album_and_year_hints(self, client: TestClient):
        """Search should forward album and release year hints to the matcher."""
        mock_payload = {
            "title": "Test Song",
            "webpage_url": "https://youtube.com/watch?v=test",
            "stream_url": "/stream?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dtest",
            "duration": 123,
            "album": "Test Album",
            "artist": "Test Artist",
            "thumbnail": "https://example.com/thumb.jpg",
            "artwork_source": "youtube",
            "artwork_confidence": "video",
            "release_year": 2024,
        }

        with patch("main.MusicService.search") as mock_search:
            mock_search.return_value = [MagicMock(model_dump=lambda: mock_payload)]
            response = client.get(
                "/api/search",
                params={
                    "query": "test song",
                    "limit": 1,
                    "expected_title": "Test Song",
                    "expected_artist": "Test Artist",
                    "expected_album": "Test Album",
                    "expected_year": 2024,
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data[0]["title"] == "Test Song"
        _, kwargs = mock_search.call_args
        assert kwargs["expected_album"] == "Test Album"
        assert kwargs["expected_year"] == 2024


class TestAutocompleteEndpoint:
    """Tests for /api/autocomplete endpoint."""

    def test_autocomplete_requires_query(self, client: TestClient):
        """Autocomplete should require query parameter."""
        response = client.get("/api/autocomplete")
        
        assert response.status_code == 422

    def test_autocomplete_query_validation(self, client: TestClient):
        """Autocomplete should validate query parameters."""
        response = client.get("/api/autocomplete", params={"query": ""})
        
        assert response.status_code == 422

    def test_autocomplete_limit_validation(self, client: TestClient):
        """Autocomplete should validate limit parameter."""
        response = client.get("/api/autocomplete", params={"query": "test", "limit": 0})
        
        assert response.status_code == 422
        
        response = client.get("/api/autocomplete", params={"query": "test", "limit": 15})
        
        assert response.status_code == 422

    @pytest.mark.skip(reason="Requires actual MusicBrainz API access")
    def test_autocomplete_returns_suggestions(self, client: TestClient):
        """Autocomplete should return suggestions for valid query."""
        response = client.get(
            "/api/autocomplete",
            params={"query": "blinding lights", "limit": 3}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            suggestion = data[0]
            assert "title" in suggestion
            assert "query" in suggestion
            assert "confidence" in suggestion

    def test_autocomplete_fields_filter(self, client: TestClient):
        """Autocomplete should support fields filtering."""
        response = client.get(
            "/api/autocomplete",
            params={"query": "test", "fields": "title,artist"}
        )
        
        # Should not error even if no results
        assert response.status_code in [200, 502]


class TestStreamEndpoint:
    """Tests for /api/stream endpoint."""

    def test_stream_requires_url(self, client: TestClient):
        """Stream should require url parameter."""
        response = client.get("/stream")
        
        assert response.status_code == 422

    @pytest.mark.skip(reason="Requires actual YouTube video access")
    def test_stream_returns_audio(self, client: TestClient, sample_youtube_url):
        """Stream should return audio content for valid YouTube URL."""
        from urllib.parse import urlencode
        
        params = urlencode({"url": sample_youtube_url})
        response = client.get(f"/stream?{params}")
        
        assert response.status_code == 200
        assert "audio" in response.headers.get("content-type", "")

    def test_stream_cors_headers(self, client: TestClient):
        """Stream should include CORS headers."""
        # Test with invalid URL to get error but check headers are set
        response = client.get("/stream?url=invalid")
        
        if response.status_code == 200:
            assert response.headers.get("Access-Control-Allow-Origin") == "*"
            assert "Accept-Ranges" in response.headers

    def test_stream_blocks_private_direct_target(self, client: TestClient):
        """Stream proxy should reject private resolved media URLs."""
        with patch("main.MusicService.get_stream_source") as mock_source:
            mock_source.return_value = ("http://127.0.0.1/audio", {})
            response = client.get("/stream", params={"url": "https://youtube.com/watch?v=test"})

        assert response.status_code == 403

    def test_stream_allows_expected_media_target(self, client: TestClient):
        """Stream proxy should allow expected media hosts."""

        class FakeStream:
            status_code = 200
            headers = {"content-type": "audio/mpeg"}

            async def aiter_bytes(self, chunk_size=8192):
                yield b"audio"

            async def aclose(self):
                return None

        async def fake_open_stream(client, url, headers):
            return FakeStream()

        with patch("main.MusicService.get_stream_source") as mock_source:
            with patch("main.open_validated_stream", side_effect=fake_open_stream):
                mock_source.return_value = (
                    "https://rr1---sn.googlevideo.com/videoplayback",
                    {},
                )
                response = client.get(
                    "/stream",
                    params={"url": "https://youtube.com/watch?v=test"},
                )

        assert response.status_code == 200
        assert response.content == b"audio"

    def test_stream_retries_rejected_audio_source_with_progressive_fallback(
        self,
        client: TestClient,
    ):
        """A rejected audio-only CDN URL should fall back to a playable MP4."""

        class FakeStream:
            def __init__(self, status_code, content_type, body=b""):
                self.status_code = status_code
                self.headers = {
                    "content-type": content_type,
                    "accept-ranges": "bytes",
                    "content-length": str(len(body)),
                }
                self.body = body

            async def aiter_bytes(self, chunk_size=8192):
                yield self.body

            async def aclose(self):
                return None

        attempts = [
            FakeStream(403, "text/plain", b"rejected"),
            FakeStream(206, "video/mp4", b"playable"),
        ]

        async def fake_open_stream(client, url, headers):
            return attempts.pop(0)

        with patch("main.MusicService.get_stream_source") as audio_source:
            with patch("main.VideoService.get_video_stream_source") as fallback_source:
                with patch("main.MusicService.remember_stream_source") as remember_source:
                    with patch("main.open_validated_stream", side_effect=fake_open_stream):
                        audio_source.return_value = (
                            "https://rr1---sn.googlevideo.com/videoplayback",
                            {},
                        )
                        fallback_source.return_value = (
                            "https://rr2---sn.googlevideo.com/videoplayback",
                            {"User-Agent": "fixture"},
                        )
                        response = client.get(
                            "/stream",
                            params={"url": "https://youtube.com/watch?v=test"},
                            headers={"Range": "bytes=0-7"},
                        )

        assert response.status_code == 206
        assert response.content == b"playable"
        assert response.headers["content-type"].startswith("audio/mp4")
        fallback_source.assert_called_once_with("https://youtube.com/watch?v=test")
        remember_source.assert_called_once()

    def test_stream_redirect_mode_returns_validated_location(self, client: TestClient, monkeypatch):
        """Redirect mode should 302 to an allowed resolved media URL."""
        monkeypatch.setenv("STREAM_DELIVERY_MODE", "redirect")

        with patch("main.MusicService.get_stream_source") as mock_source:
            mock_source.return_value = (
                "https://rr1---sn.googlevideo.com/videoplayback",
                {},
            )
            response = client.get(
                "/stream",
                params={"url": "https://youtube.com/watch?v=test"},
                follow_redirects=False,
            )

        assert response.status_code == 302
        assert response.headers["location"] == "https://rr1---sn.googlevideo.com/videoplayback"
        assert response.headers["Access-Control-Allow-Origin"] == "*"


class TestVideoEndpoints:
    def test_video_search_requires_title(self, client: TestClient):
        response = client.get("/api/video/search")
        assert response.status_code == 422

    def test_video_search_returns_payload(self, client: TestClient):
        payload = {
            "title": "Artist - Song (Official Music Video)",
            "webpage_url": "https://youtube.com/watch?v=video",
            "video_stream_url": (
                "/api/video/stream?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dvideo"
            ),
            "duration": 210,
            "thumbnail": "https://img.example/video.jpg",
            "channel": "Artist VEVO",
            "kind": "music_video",
            "width": 854,
            "height": 480,
        }

        with patch("main.VideoService.search") as mock_search:
            mock_search.return_value = [MagicMock(model_dump=lambda: payload)]
            response = client.get(
                "/api/video/search",
                params={
                    "title": "Song",
                    "artist": "Artist",
                    "kind": "music_video",
                    "limit": 1,
                },
            )

        assert response.status_code == 200
        assert response.json() == [payload]
        mock_search.assert_called_once_with("Song", "Artist", "music_video", 1)

    def test_video_search_validates_kind(self, client: TestClient):
        response = client.get(
            "/api/video/search",
            params={"title": "Song", "kind": "unsupported"},
        )
        assert response.status_code == 422

    def test_video_stream_preserves_range_response(self, client: TestClient):
        class FakeStream:
            status_code = 206
            headers = {
                "content-type": "video/mp4",
                "accept-ranges": "bytes",
                "content-length": "5",
                "content-range": "bytes 10-14/100",
            }

            async def aiter_bytes(self, chunk_size=8192):
                yield b"video"

            async def aclose(self):
                return None

        captured = {}

        async def fake_open_stream(client, url, headers):
            captured["headers"] = headers
            return FakeStream()

        with patch("main.VideoService.get_video_stream_source") as mock_source:
            with patch("main.open_validated_stream", side_effect=fake_open_stream):
                mock_source.return_value = (
                    "https://rr1---sn.googlevideo.com/videoplayback",
                    {"User-Agent": "fixture"},
                )
                response = client.get(
                    "/api/video/stream",
                    params={"url": "https://youtube.com/watch?v=video"},
                    headers={"Range": "bytes=10-14"},
                )

        assert response.status_code == 206
        assert response.content == b"video"
        assert response.headers["content-type"].startswith("video/mp4")
        assert response.headers["content-range"] == "bytes 10-14/100"
        assert captured["headers"]["Range"] == "bytes=10-14"

    def test_video_stream_blocks_private_direct_target(self, client: TestClient):
        with patch("main.VideoService.get_video_stream_source") as mock_source:
            mock_source.return_value = ("http://127.0.0.1/video", {})
            response = client.get(
                "/api/video/stream",
                params={"url": "https://youtube.com/watch?v=video"},
            )

        assert response.status_code == 403

    def test_video_stream_blocks_private_source_before_extraction(self, client: TestClient):
        with patch("main.VideoService.get_video_stream_source") as mock_source:
            response = client.get(
                "/api/video/stream",
                params={"url": "http://127.0.0.1/video"},
            )

        assert response.status_code == 403
        mock_source.assert_not_called()


class TestLocalPlaybackEndpoints:
    """Tests for local playback integration endpoints."""

    def test_play_requires_query(self, client: TestClient):
        """Play endpoint should require query parameter."""
        response = client.get("/play")
        
        assert response.status_code == 422

    def test_play_query_validation(self, client: TestClient):
        """Play endpoint should validate query parameters."""
        response = client.get("/play", params={"query": ""})
        
        assert response.status_code == 422
        
        long_query = "a" * 501
        response = client.get("/play", params={"query": long_query})
        
        assert response.status_code == 422

    def test_stop_no_active_playback(self, client: TestClient):
        """Stop should handle no active playback gracefully."""
        response = client.get("/stop")
        
        assert response.status_code == 200
        data = response.json()
        assert "mode" in data
        assert "message" in data

    def test_resume_no_previous_playback(self, client: TestClient):
        """Resume should handle no previous playback gracefully."""
        response = client.get("/resume")
        
        # Should return error since nothing to resume
        assert response.status_code == 502

    def test_control_auth_required_when_configured(self, client: TestClient, monkeypatch):
        """Control routes should require a token when configured."""
        monkeypatch.setenv("DMS_CONTROL_AUTH_TOKEN", "secret-token")

        response = client.get("/stop")
        assert response.status_code == 401

        response = client.get("/stop", headers={"X-Dev-Music-Token": "secret-token"})
        assert response.status_code == 200

    def test_control_routes_disabled_on_serverless_without_token(self, client: TestClient, monkeypatch):
        """Serverless control routes should be disabled by default."""
        monkeypatch.setenv("VERCEL", "true")
        monkeypatch.delenv("DMS_CONTROL_AUTH_TOKEN", raising=False)

        response = client.get("/stop")
        assert response.status_code == 403


class TestBrowserPlaybackEndpoint:
    """Tests for /api/browser/playback endpoint."""

    def test_browser_playback_requires_url(self, client: TestClient):
        """Browser playback should require url in request body."""
        response = client.post("/api/browser/playback", json={})
        
        assert response.status_code == 422

    def test_browser_playback_minimal_request(self, client: TestClient):
        """Browser playback should work with minimal request."""
        response = client.post(
            "/api/browser/playback",
            json={"url": "https://youtube.com/watch?v=test"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "stream_url" in data
        assert "webpage_url" in data
        assert data["mode"] == "browser"

    def test_browser_playback_full_request(self, client: TestClient):
        """Browser playback should handle full metadata."""
        payload = {
            "url": "https://youtube.com/watch?v=test",
            "title": "Test Song",
            "duration": 180,
            "album": "Test Album",
            "artist": "Test Artist",
            "thumbnail": "https://example.com/thumb.jpg",
            "release_year": 2024,
        }
        
        response = client.post("/api/browser/playback", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Test Song"
        assert data["duration"] == 180
        assert data["album"] == "Test Album"
        assert data["artist"] == "Test Artist"


class TestMetadataEndpoint:
    """Tests for /api/metadata and /metadata endpoints."""

    def test_metadata_requires_url(self, client: TestClient):
        """Metadata should require url parameter."""
        response = client.get("/api/metadata")

        assert response.status_code == 422

    def test_metadata_returns_payload(self, client: TestClient):
        """Metadata should serialize the backend result."""
        url = "https://youtube.com/watch?v=test"
        mock_payload = {
            "title": "Track title",
            "webpage_url": url,
            "stream_url": "/stream?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dtest",
            "duration": 123,
            "album": "Album",
            "artist": "Artist",
            "thumbnail": "https://img.example/cover.jpg",
            "artwork_source": "youtube",
            "artwork_confidence": "video",
            "release_year": 2024,
            "source": "youtube",
        }

        with patch("main.MusicService.get_metadata") as mock_get_metadata:
            mock_get_metadata.return_value = MagicMock(model_dump=lambda: mock_payload)
            response = client.get("/api/metadata", params={"url": url})

        assert response.status_code == 200
        assert response.json() == mock_payload


class TestSpotifyImportEndpoints:
    """Tests for Spotify import endpoints."""

    def test_spotify_start_without_config(self, client: TestClient, no_spotify_env):
        """Spotify start should error when not configured."""
        response = client.get("/api/import/spotify/start")

        assert response.status_code == 502

    def test_spotify_start_with_config(self, client: TestClient, mock_spotify_env):
        """Spotify start should redirect when configured."""
        # The actual redirect happens in the response
        response = client.get("/api/import/spotify/start", follow_redirects=False)
        
        # Should be a redirect (307 Temporary Redirect)
        # Note: May return 200 if popup HTML is returned
        assert response.status_code in [200, 307]
        set_cookie = response.headers.get("set-cookie", "")
        assert "HttpOnly" in set_cookie
        assert "Secure" in set_cookie
        assert "SameSite=lax" in set_cookie

    def test_spotify_status(self, client: TestClient):
        """Spotify status should return configuration state."""
        response = client.get("/api/import/spotify/status")
        
        assert response.status_code == 200
        data = response.json()
        assert "configured" in data
        assert "connected" in data

    def test_spotify_disconnect(self, client: TestClient):
        """Spotify disconnect should clear connection."""
        response = client.post("/api/import/spotify/disconnect")
        
        assert response.status_code == 200

    def test_spotify_liked_tracks(self, client: TestClient, mock_spotify_env):
        """Liked tracks endpoint should return saved tracks when connected."""
        client.cookies.set("spotify_access_token", "test_access_token")

        mock_payload = {
            "provider": "spotify",
            "title": "Liked songs",
            "total": 1,
            "limit": 50,
            "offset": 0,
            "tracks": [
                {
                    "source": {
                        "provider": "spotify",
                        "provider_track_id": "track_1",
                        "provider_playlist_id": "liked",
                        "title": "Test Song",
                        "artist_names": ["Test Artist"],
                        "album": "Test Album",
                        "duration_ms": 180000,
                        "isrc": "USRC17607839",
                        "release_date": "2024-01-01",
                        "artwork_url": "https://example.com/art.jpg",
                        "provider_url": "https://open.spotify.com/track/test",
                    },
                    "musicbrainz": {
                        "title": "Test Song",
                        "artist": "Test Artist",
                        "album": "Test Album",
                        "release_year": 2024,
                        "confidence": 93,
                        "match_reason": "isrc",
                    },
                }
            ],
            "matched_count": 1,
            "low_confidence_count": 0,
            "unmatched_count": 0,
        }

        with patch("main.SpotifyImportService.liked_tracks_preview") as mock_liked_tracks:
            mock_liked_tracks.return_value = MagicMock(model_dump=lambda: mock_payload)
            response = client.get("/api/import/spotify/liked-tracks")

        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "spotify"
        assert data["total"] == 1
        assert data["tracks"][0]["source"]["title"] == "Test Song"
        assert data["tracks"][0]["musicbrainz"]["confidence"] == 93

    def test_spotify_liked_tracks_paginates(self, client: TestClient, mock_spotify_env):
        """Liked tracks endpoint should pass limit and offset through to the service."""
        client.cookies.set("spotify_access_token", "test_access_token")

        mock_payload = {
            "provider": "spotify",
            "title": "Liked songs",
            "total": 10,
            "limit": 5,
            "offset": 5,
            "tracks": [],
            "matched_count": 0,
            "low_confidence_count": 0,
            "unmatched_count": 0,
        }

        with patch("main.SpotifyImportService.liked_tracks_preview") as mock_liked_tracks:
            mock_liked_tracks.return_value = MagicMock(model_dump=lambda: mock_payload)
            response = client.get("/api/import/spotify/liked-tracks", params={"limit": 5, "offset": 5})

        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 5
        assert data["offset"] == 5
        mock_liked_tracks.assert_called_once()
        _, kwargs = mock_liked_tracks.call_args
        assert kwargs["limit"] == 5
        assert kwargs["offset"] == 5

    def test_spotify_save_liked_track(self, client: TestClient, mock_spotify_env):
        """Saving a track should pass its Spotify identity and metadata to the service."""
        client.cookies.set("spotify_access_token", "test_access_token")

        with patch("main.SpotifyImportService.save_track") as mock_save:
            mock_save.return_value = "track_1"
            response = client.post(
                "/api/import/spotify/liked-tracks",
                json={
                    "spotify_id": "4iV5W9uYEdYUVa79Axb7Rh",
                    "title": "Test Song",
                    "artist": "Test Artist",
                    "album": "Test Album",
                },
            )

        assert response.status_code == 200
        assert response.json() == {"saved": True, "spotify_id": "track_1"}
        mock_save.assert_awaited_once()
        _, kwargs = mock_save.call_args
        assert kwargs == {
            "title": "Test Song",
            "artist": "Test Artist",
            "album": "Test Album",
            "spotify_id": "4iV5W9uYEdYUVa79Axb7Rh",
        }

    def test_spotify_liked_track_contains(self, client: TestClient, mock_spotify_env):
        """Contains endpoint should report whether a track is already saved."""
        client.cookies.set("spotify_access_token", "test_access_token")

        with patch("main.SpotifyImportService.is_track_saved") as mock_contains:
            mock_contains.return_value = True
            response = client.get(
                "/api/import/spotify/liked-tracks/contains",
                params={"spotify_id": "4iV5W9uYEdYUVa79Axb7Rh"},
            )

        assert response.status_code == 200
        assert response.json() == {"saved": True}
        mock_contains.assert_awaited_once()
        args, _ = mock_contains.call_args
        assert args[1] == "4iV5W9uYEdYUVa79Axb7Rh"

    def test_spotify_liked_track_contains_requires_id(self, client: TestClient, mock_spotify_env):
        response = client.get("/api/import/spotify/liked-tracks/contains")
        assert response.status_code == 422

    def test_spotify_save_liked_track_requires_title(self, client: TestClient, mock_spotify_env):
        response = client.post(
            "/api/import/spotify/liked-tracks",
            json={"spotify_id": "4iV5W9uYEdYUVa79Axb7Rh"},
        )

        assert response.status_code == 422

    def test_spotify_playlists_paginates(self, client: TestClient, mock_spotify_env):
        """Playlist endpoint should pass limit and offset through to the service."""
        client.cookies.set("spotify_access_token", "test_access_token")

        mock_playlist = MagicMock(
            model_dump=lambda: {
                "provider": "spotify",
                "id": "playlist_2",
                "name": "Second Page",
                "track_count": 12,
                "owner": "Test Owner",
                "thumbnail": None,
                "provider_url": "https://open.spotify.com/playlist/playlist_2",
            }
        )

        with patch("main.SpotifyImportService.list_playlists") as mock_playlists:
            mock_playlists.return_value = [mock_playlist]
            response = client.get("/api/import/spotify/playlists", params={"limit": 10, "offset": 10})

        assert response.status_code == 200
        data = response.json()
        assert data[0]["id"] == "playlist_2"
        _, kwargs = mock_playlists.call_args
        assert kwargs["limit"] == 10
        assert kwargs["offset"] == 10

    def test_spotify_playlist_preview(self, client: TestClient, mock_spotify_env):
        """Playlist preview should return matched tracks when connected."""
        client.cookies.set("spotify_access_token", "test_access_token")

        mock_payload = {
            "provider": "spotify",
            "playlist": {
                "provider": "spotify",
                "id": "playlist_1",
                "name": "Test Playlist",
                "track_count": 1,
                "owner": "Test Owner",
            },
            "tracks": [
                {
                    "source": {
                        "provider": "spotify",
                        "provider_track_id": "track_1",
                        "provider_playlist_id": "playlist_1",
                        "title": "Test Song",
                        "artist_names": ["Test Artist"],
                        "album": "Test Album",
                        "duration_ms": 180000,
                        "isrc": "USRC17607839",
                        "release_date": "2024-01-01",
                        "artwork_url": "https://example.com/art.jpg",
                        "provider_url": "https://open.spotify.com/track/test",
                    },
                    "musicbrainz": {
                        "title": "Test Song",
                        "artist": "Test Artist",
                        "album": "Test Album",
                        "release_year": 2024,
                        "confidence": 93,
                        "match_reason": "isrc",
                    },
                }
            ],
            "matched_count": 1,
            "low_confidence_count": 0,
            "unmatched_count": 0,
        }

        with patch("main.SpotifyImportService.preview_playlist") as mock_preview:
            mock_preview.return_value = MagicMock(model_dump=lambda: mock_payload)
            response = client.get("/api/import/spotify/playlists/playlist_1/preview")

        assert response.status_code == 200
        data = response.json()
        assert data["playlist"]["name"] == "Test Playlist"
        assert data["tracks"][0]["source"]["title"] == "Test Song"
        assert data["tracks"][0]["musicbrainz"]["confidence"] == 93

    def test_spotify_track_playback(self, client: TestClient, mock_spotify_env):
        """Resolved Spotify track playback should return a browser playback payload."""
        client.cookies.set("spotify_access_token", "test_access_token")

        mock_payload = {
            "mode": "browser",
            "title": "Test Song",
            "duration": 180,
            "webpage_url": "https://youtube.com/watch?v=test",
            "stream_url": "/stream?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dtest",
            "album": "Test Album",
            "artist": "Test Artist",
            "thumbnail": "https://example.com/art.jpg",
            "artwork_source": "musicbrainz",
            "artwork_confidence": "release",
            "release_year": 2024,
        }

        item = {
            "source": {
                "provider": "spotify",
                "provider_track_id": "track_1",
                "provider_playlist_id": "playlist_1",
                "title": "Test Song",
                "artist_names": ["Test Artist"],
                "album": "Test Album",
                "duration_ms": 180000,
                "isrc": "USRC17607839",
                "release_date": "2024-01-01",
                "artwork_url": "https://example.com/art.jpg",
                "provider_url": "https://open.spotify.com/track/test",
            },
            "musicbrainz": {
                "title": "Test Song",
                "artist": "Test Artist",
                "album": "Test Album",
                "release_year": 2024,
                "confidence": 93,
                "match_reason": "isrc",
                "artwork_url": "https://example.com/art.jpg",
            },
        }

        with patch("main.SpotifyImportService.resolve_track_playback") as mock_resolve:
            mock_resolve.return_value = MagicMock(model_dump=lambda: mock_payload)
            response = client.post("/api/import/spotify/playback", json=item)

        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "browser"
        assert data["title"] == "Test Song"
        assert data["stream_url"].startswith("/stream?")


class TestOpenAPIDocumentation:
    """Tests for API documentation endpoints."""

    def test_swagger_ui_available(self, client: TestClient):
        """Swagger UI should be available at /docs."""
        response = client.get("/docs")
        
        assert response.status_code == 200
        assert "swagger" in response.text.lower() or "Swagger" in response.text

    def test_redoc_available(self, client: TestClient):
        """ReDoc should be available at /redoc."""
        response = client.get("/redoc")
        
        assert response.status_code == 200
        assert "redoc" in response.text.lower() or "ReDoc" in response.text

    def test_openapi_schema(self, client: TestClient):
        """OpenAPI schema should be available at /openapi.json."""
        response = client.get("/openapi.json")
        
        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data
        assert "info" in data
        assert data["info"]["title"] == "Dev Music Service"
        assert data["info"]["version"] == "0.4.0"


class TestErrorHandling:
    """Tests for error handling across endpoints."""

    def test_404_for_unknown_routes(self, client: TestClient):
        """Unknown routes should return 404."""
        response = client.get("/nonexistent-route")
        
        assert response.status_code == 404

    def test_method_not_allowed(self, client: TestClient):
        """Wrong HTTP method should return 405."""
        response = client.post("/health")
        
        assert response.status_code == 405

    def test_error_response_format(self, client: TestClient):
        """Error responses should include detail."""
        response = client.get("/api/search")  # Missing required param
        
        assert response.status_code == 422


class TestLiveLyricsEndpoints:
    """Tests for the live localization + transcription endpoints."""

    def test_localize_window_returns_mapping(self, client: TestClient):
        with patch(
            "main.LyricsService.localize_window", return_value={0: "hola", 2: "mundo"}
        ) as mocked:
            response = client.post(
                "/api/lyrics/localize-window",
                json={
                    "title": "Song",
                    "artist": "Artist",
                    "locale": "es",
                    "bpm": 92,
                    "mood": ["sad"],
                    "lines": [
                        {"index": 0, "text": "hello", "start_time_ms": 0, "end_time_ms": 1000},
                        {"index": 2, "text": "world", "start_time_ms": 2000, "end_time_ms": 3000},
                    ],
                },
            )

        assert response.status_code == 200
        assert response.json() == {"localized": {"0": "hola", "2": "mundo"}}
        _, kwargs = mocked.call_args
        assert kwargs["items"] == [(0, "hello", 0, 1000), (2, "world", 2000, 3000)]
        assert kwargs["bpm"] == 92
        assert kwargs["mood"] == ["sad"]

    def test_localize_window_requires_locale(self, client: TestClient):
        response = client.post(
            "/api/lyrics/localize-window",
            json={"title": "S", "artist": "A", "lines": [{"index": 0, "text": "hi"}]},
        )
        assert response.status_code == 422

    def test_transcribe_reports_job_status(self, client: TestClient):
        job = {"status": "pending", "lines": [], "error": None}
        with patch("main.LiveTranscriptionService.get_or_start", return_value=job):
            response = client.get(
                "/api/lyrics/transcribe",
                params={"title": "S", "artist": "A", "url": "https://www.youtube.com/watch?v=1"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"
        assert data["lines"] == []

    def test_transcribe_stream_proxies_caption_events(self, client: TestClient):
        async def events(session_id: str, after: int = 0):
            assert session_id == "session-1"
            assert after == 0
            yield (
                b'id: 1\nevent: final\ndata: '
                b'{"type":"final","segment_id":0,"start_ms":0,'
                b'"end_ms":1000,"text":"hello"}\n\n'
            )
            yield b'id: 2\nevent: complete\ndata: {"type":"complete"}\n\n'

        session = {"session_id": "session-1", "cached": False}
        with (
            patch(
                "main.LiveTranscriptionService.start_session",
                new=AsyncMock(return_value=session),
            ) as start,
            patch("main.LiveTranscriptionService.stream_events", side_effect=events),
        ):
            response = client.get(
                "/api/lyrics/transcribe/events",
                params={
                    "title": "S",
                    "artist": "A",
                    "url": "https://www.youtube.com/watch?v=1",
                    "locale": "fr-CA",
                },
            )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "event: final" in response.text
        assert "event: complete" in response.text
        assert start.await_args.kwargs["target_locale"] == "fr-CA"


class TestTranslatedVocalEndpoints:
    """Tests for permitted translated-vocal segment generation."""

    def test_translated_vocals_returns_segment_plan(self, client: TestClient, monkeypatch):
        monkeypatch.setenv("TRANSLATED_VOCALS_LOCAL_SAY_FALLBACK", "false")
        monkeypatch.setenv("PIKAPROJBACKEND_URL", "")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_MODE", "neutral")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_PROFILE_ID", "")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_CONSENT_TOKEN", "")

        response = client.post(
            "/api/vocals/translated",
            json={
                "title": "Headlines",
                "artist": "Drake",
                "locale": "es-MX",
                "voice_mode": "neutral",
                "lines": [
                    {
                        "index": 0,
                        "text": "Tengo dinero en mente",
                        "start_time_ms": 0,
                        "end_time_ms": 2000,
                    }
                ],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_configured"
        assert data["voice_mode"] == "neutral"
        assert data["segments"][0]["audio_url"] is None

    def test_translated_vocals_local_say_fallback_serves_audio(
        self,
        client: TestClient,
        monkeypatch,
        tmp_path,
    ):
        from services import translated_vocals_service as vocals_module

        monkeypatch.setenv("PIKAPROJBACKEND_URL", "")
        monkeypatch.setenv("TRANSLATED_VOCALS_LOCAL_SAY_FALLBACK", "true")
        monkeypatch.setenv("TRANSLATED_VOCALS_SAY_COMMAND", "/usr/bin/say")
        monkeypatch.setenv("TRANSLATED_VOCALS_FFMPEG_COMMAND", "/opt/homebrew/bin/ffmpeg")
        monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))

        def fake_run(args, **kwargs):
            output_path = args[-1]
            if output_path.endswith(".aiff"):
                Path(output_path).write_bytes(b"AIFF")
            elif output_path.endswith(".wav"):
                Path(output_path).write_bytes(b"RIFFWAVE")

        monkeypatch.setattr(vocals_module.subprocess, "run", fake_run)

        response = client.post(
            "/api/vocals/translated",
            json={
                "title": "Song",
                "artist": "Artist",
                "locale": "en-US",
                "voice_mode": "neutral",
                "lines": [{"index": 0, "text": "hello"}],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        audio_url = data["segments"][0]["audio_url"]
        assert audio_url.startswith("/api/vocals/audio/")

        audio_response = client.get(audio_url)
        assert audio_response.status_code == 200
        assert audio_response.content == b"RIFFWAVE"

    def test_translated_vocals_user_consent_falls_back_when_pika_has_no_tts(
        self,
        client: TestClient,
        monkeypatch,
        tmp_path,
    ):
        from services import translated_vocals_service as vocals_module

        monkeypatch.setenv("PIKAPROJBACKEND_URL", "http://pika.local")
        monkeypatch.setenv("PIKAPROJBACKEND_TTS_PATH", "/tts")
        monkeypatch.setenv("TRANSLATED_VOCALS_LOCAL_SAY_FALLBACK", "true")
        monkeypatch.setenv("TRANSLATED_VOCALS_SAY_COMMAND", "/usr/bin/say")
        monkeypatch.setenv("TRANSLATED_VOCALS_FFMPEG_COMMAND", "/opt/homebrew/bin/ffmpeg")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_MODE", "user_consent")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_PROFILE_ID", "voice-profile-local")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_CONSENT_TOKEN", "consent")
        monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))

        class FakeResponse:
            status_code = 503

            def raise_for_status(self):
                raise AssertionError("503 should be handled before raise_for_status")

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def post(self, *args, **kwargs):
                return FakeResponse()

        def fake_run(args, **kwargs):
            output_path = args[-1]
            if output_path.endswith(".aiff"):
                Path(output_path).write_bytes(b"AIFF")
            elif output_path.endswith(".wav"):
                Path(output_path).write_bytes(b"RIFFWAVE")

        monkeypatch.setattr(vocals_module.httpx, "Client", FakeClient)
        monkeypatch.setattr(vocals_module.subprocess, "run", fake_run)

        response = client.post(
            "/api/vocals/translated",
            json={
                "title": "Song",
                "artist": "Artist",
                "locale": "en-US",
                "lines": [{"index": 0, "text": "hello"}],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["voice_mode"] == "user_consent"
        assert data["voice_profile_id"] == "voice-profile-local"
        assert data["segments"][0]["audio_url"].startswith("/api/vocals/audio/")

    def test_translated_vocals_rejects_artist_clone(self, client: TestClient):
        response = client.post(
            "/api/vocals/translated",
            json={
                "title": "Headlines",
                "artist": "Drake",
                "locale": "es-MX",
                "voice_mode": "artist_clone",
                "lines": [{"index": 0, "text": "hola"}],
            },
        )

        assert response.status_code == 403
        assert "Artist voice cloning is not supported" in response.json()["detail"]

    def test_translated_vocals_requires_consent_for_profile_voice(self, client: TestClient, monkeypatch):
        monkeypatch.setenv("PIKAPROJBACKEND_URL", "")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_MODE", "neutral")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_PROFILE_ID", "")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_CONSENT_TOKEN", "")

        response = client.post(
            "/api/vocals/translated",
            json={
                "title": "Song",
                "artist": "Artist",
                "locale": "fr-CA",
                "voice_mode": "licensed",
                "voice_profile_id": "licensed-voice-1",
                "lines": [{"index": 0, "text": "bonjour"}],
            },
        )

        assert response.status_code == 403
        assert "voice_profile_id and voice_consent_token" in response.json()["detail"]

    def test_translated_vocals_uses_configured_permitted_voice(
        self,
        client: TestClient,
        monkeypatch,
    ):
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_MODE", "licensed")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_PROFILE_ID", "licensed-voice-1")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_CONSENT_TOKEN", "consent-ok")

        response = client.post(
            "/api/vocals/translated",
            json={
                "title": "Song",
                "artist": "Artist",
                "locale": "fr-CA",
                "voice_mode": "neutral",
                "lines": [{"index": 0, "text": "bonjour"}],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["voice_mode"] == "licensed"
        assert data["voice_profile_id"] == "licensed-voice-1"

    def test_translated_vocals_config_status(self, client: TestClient, monkeypatch):
        monkeypatch.setenv("PIKAPROJBACKEND_URL", "http://voice.example")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_MODE", "licensed")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_PROFILE_ID", "licensed-voice-1")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_CONSENT_TOKEN", "consent-ok")
        monkeypatch.setenv("TRANSLATED_VOCALS_VOICE_LABEL", "Licensed demo voice")

        response = client.get("/api/vocals/config")

        assert response.status_code == 200
        data = response.json()
        assert data["backend_configured"] is True
        assert data["voice_mode"] == "licensed"
        assert data["voice_label"] == "Licensed demo voice"
        assert data["profile_configured"] is True


class TestLogRedaction:
    """Tests for structured-log sensitive value redaction."""

    def test_redacts_sensitive_keys(self):
        from security import redact_sensitive_data

        payload = redact_sensitive_data(
            None,
            None,
            {
                "authorization": "Bearer abc",
                "nested": {"spotify_access_token": "abc", "safe": "ok"},
            },
        )

        assert payload["authorization"] == "[redacted]"
        assert payload["nested"]["spotify_access_token"] == "[redacted]"
        assert payload["nested"]["safe"] == "ok"
