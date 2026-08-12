from __future__ import annotations

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


def test_host_controls_fail_closed_during_beta(monkeypatch, tmp_path):
    _enable_beta(monkeypatch, tmp_path)
    monkeypatch.delenv("DMS_CONTROL_AUTH_TOKEN", raising=False)
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as client:
        _login(client)
        assert client.get("/stop").status_code == 403
