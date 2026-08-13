from __future__ import annotations

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app


def _enable_beta(monkeypatch, tmp_path, *, allowed="owner@example.com,friend@example.com"):
    monkeypatch.setenv("BETA_AUTH_ENABLED", "true")
    monkeypatch.setenv("BETA_AUTH_SECRET", "test-signing-secret-with-enough-entropy")
    monkeypatch.setenv("BETA_INVITE_CODE", "friends-only-code")
    monkeypatch.setenv("BETA_ALLOWED_EMAILS", allowed)
    monkeypatch.setenv("BETA_OWNER_EMAIL", "owner@example.com")
    monkeypatch.setenv("BETA_COOKIE_SECURE", "false")
    monkeypatch.setenv("DMS_DATA_DIR", str(tmp_path))


def _login(client: TestClient, email: str = "owner@example.com"):
    return client.post(
        "/api/auth/login",
        json={"email": email, "invite_code": "friends-only-code"},
    )


def test_beta_gate_and_signed_session(monkeypatch, tmp_path):
    _enable_beta(monkeypatch, tmp_path)
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/health").json() == {"status": "ok", "auth": "required"}
        assert client.get("/api/search", params={"query": "test"}).status_code == 401
        redirect = client.get("/", follow_redirects=False)
        assert redirect.status_code == 303
        assert redirect.headers["location"].startswith("/login")

        rejected = client.post(
            "/api/auth/login",
            json={"email": "owner@example.com", "invite_code": "wrong"},
        )
        assert rejected.status_code == 401

        accepted = _login(client)
        assert accepted.status_code == 200
        cookie = accepted.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie
        status = client.get("/api/auth/status").json()
        assert status == {
            "enabled": True,
            "configured": True,
            "authenticated": True,
            "email": "owner@example.com",
            "owner": True,
        }
        assert client.get("/").status_code == 200


def test_apple_music_export_is_owner_only(monkeypatch, tmp_path):
    _enable_beta(monkeypatch, tmp_path)
    export = tmp_path / "library.json"
    export.write_text(json.dumps({"provider": "apple_music", "albums": []}))
    monkeypatch.setenv("APPLE_MUSIC_IMPORT_PATH", str(export))
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as client:
        assert _login(client, "friend@example.com").status_code == 200
        assert client.get("/api/apple-music/config").json()["importAvailable"] is False
        assert client.get("/api/import/apple-music/library").status_code == 403

        assert _login(client, "owner@example.com").status_code == 200
        assert client.get("/api/apple-music/config").json()["importAvailable"] is True
        assert client.get("/api/import/apple-music/library").status_code == 200


def test_focus_profiles_are_separate_per_beta_user(monkeypatch, tmp_path):
    _enable_beta(monkeypatch, tmp_path)
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as client:
        _login(client, "owner@example.com")
        assert client.post("/api/focus/profile", json={"bpm_min": 72}).status_code == 200

        _login(client, "friend@example.com")
        assert client.get("/api/focus/profile").json()["bpm_min"] == 60
        assert client.post("/api/focus/profile", json={"bpm_min": 88}).status_code == 200

        _login(client, "owner@example.com")
        assert client.get("/api/focus/profile").json()["bpm_min"] == 72
        user_files = list((tmp_path / "users").glob("*/focus_profile.json"))
        assert len(user_files) == 2
        assert all("@" not in str(path) for path in user_files)


def test_host_controls_fail_closed_during_beta(monkeypatch, tmp_path):
    _enable_beta(monkeypatch, tmp_path)
    monkeypatch.delenv("DMS_CONTROL_AUTH_TOKEN", raising=False)
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as client:
        _login(client)
        assert client.get("/stop").status_code == 403


def test_user_supplied_private_urls_are_rejected_before_services(client):
    private_url = "http://127.0.0.1:8766/private"
    with patch("main.MusicService.get_metadata") as metadata:
        response = client.get("/api/metadata", params={"url": private_url})
    assert response.status_code == 403
    metadata.assert_not_called()

    with patch("main.MusicService.build_browser_state") as playback:
        response = client.post("/api/browser/playback", json={"url": private_url})
    assert response.status_code == 403
    playback.assert_not_called()

    with patch("main.MusicService.get_stream_source") as stream:
        response = client.get("/api/stream", params={"url": private_url})
    assert response.status_code == 403
    stream.assert_not_called()
