from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from urllib.parse import quote

from fastapi import HTTPException, Request

from config import Settings, get_settings

SESSION_COOKIE = "phase_beta_session"


def normalize_email(value: str) -> str:
    return value.strip().lower()


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_session(email: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    if not settings.beta_auth_secret:
        raise RuntimeError("Beta authentication is not configured")
    lifetime = max(1, min(settings.beta_session_hours, 24 * 30)) * 3600
    payload = json.dumps(
        {"email": normalize_email(email), "exp": int(time.time()) + lifetime},
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    encoded = _b64encode(payload)
    signature = hmac.new(
        settings.beta_auth_secret.encode(), encoded.encode(), hashlib.sha256
    ).digest()
    return f"{encoded}.{_b64encode(signature)}"


def verify_session(token: str | None, settings: Settings | None = None) -> str | None:
    settings = settings or get_settings()
    if not token or not settings.beta_auth_secret:
        return None
    try:
        encoded, supplied_signature = token.split(".", 1)
        expected = hmac.new(
            settings.beta_auth_secret.encode(), encoded.encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _b64decode(supplied_signature)):
            return None
        payload = json.loads(_b64decode(encoded))
        email = normalize_email(payload["email"])
        if int(payload["exp"]) < int(time.time()):
            return None
        if email not in settings.beta_allowed_emails:
            return None
        return email
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def authenticate_invite(email: str, invite_code: str) -> str:
    settings = get_settings()
    if not settings.beta_auth_enabled or not settings.beta_auth_configured:
        raise HTTPException(status_code=503, detail="Beta authentication is not configured")
    normalized = normalize_email(email)
    code_matches = hmac.compare_digest(
        invite_code.encode(), (settings.beta_invite_code or "").encode()
    )
    if normalized not in settings.beta_allowed_emails or not code_matches:
        raise HTTPException(status_code=401, detail="Invalid beta invitation")
    return normalized


def request_user(request: Request) -> str | None:
    settings = get_settings()
    if not settings.beta_auth_enabled:
        return None
    state_user = getattr(request.state, "beta_user", None)
    if state_user:
        return state_user
    return verify_session(request.cookies.get(SESSION_COOKIE), settings)


def is_owner(request: Request) -> bool:
    settings = get_settings()
    if not settings.beta_auth_enabled:
        return True
    user = request_user(request)
    return bool(user and user == settings.beta_owner_email)


def require_owner(request: Request) -> str | None:
    if not is_owner(request):
        raise HTTPException(status_code=403, detail="Owner access required")
    return request_user(request)


def safe_next_path(value: str | None) -> str:
    if value and re.fullmatch(r"/[A-Za-z0-9_./-]*", value) and not value.startswith("//"):
        return value
    return "/"


def login_redirect(path: str) -> str:
    return f"/login?next={quote(safe_next_path(path), safe='/')}"
