from __future__ import annotations

import ipaddress
import hmac
from collections.abc import Mapping
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException, Request

from config import get_settings

_REDACTED = "[redacted]"
_SECRET_KEY_PARTS = (
    "authorization",
    "cookie",
    "credential",
    "secret",
    "token",
    "verifier",
)


def redact_sensitive_data(_, __, event_dict):
    return _redact_value(event_dict)


def _redact_value(value):
    if isinstance(value, Mapping):
        return {
            key: (
                _REDACTED
                if any(part in str(key).lower() for part in _SECRET_KEY_PARTS)
                else _redact_value(nested)
            )
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [_redact_value(item) for item in value]
    return value


def validate_control_auth(request: Request) -> None:
    settings = get_settings()
    token = settings.dms_control_auth_token
    if not token:
        if settings.vercel:
            raise HTTPException(
                status_code=403,
                detail="Control routes are disabled in serverless without auth",
            )
        return

    auth_header = request.headers.get("authorization", "")
    bearer = auth_header.removeprefix("Bearer ").strip()
    header_token = request.headers.get("x-dev-music-token")
    bearer_matches = bool(bearer) and hmac.compare_digest(bearer, token)
    header_matches = bool(header_token) and hmac.compare_digest(header_token, token)
    if bearer_matches or header_matches:
        return
    raise HTTPException(status_code=401, detail="Control route auth required")


def validate_stream_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Stream URL scheme is not allowed")
    if not parsed.hostname:
        raise HTTPException(status_code=403, detail="Stream URL host is required")
    host = parsed.hostname.lower().rstrip(".")
    if _is_private_or_local_host(host):
        raise HTTPException(status_code=403, detail="Stream URL host is not allowed")
    if not _host_allowed(host):
        raise HTTPException(status_code=403, detail="Stream URL host is not allowed")
    return url


async def open_validated_stream(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    max_redirects: int = 3,
):
    current_url = validate_stream_url(url)
    for _ in range(max_redirects + 1):
        request = client.build_request("GET", current_url, headers=headers)
        response = await client.send(request, stream=True, follow_redirects=False)
        if response.is_redirect:
            location = response.headers.get("location")
            await response.aclose()
            if not location:
                raise HTTPException(status_code=502, detail="Stream redirect missing location")
            current_url = validate_stream_url(urljoin(current_url, location))
            continue
        return response
    raise HTTPException(status_code=403, detail="Stream redirect chain is not allowed")


def _host_allowed(host: str) -> bool:
    allowed_hosts = tuple(item.lower().lstrip(".") for item in get_settings().stream_allowed_hosts)
    return any(host == allowed or host.endswith(f".{allowed}") for allowed in allowed_hosts)


def _is_private_or_local_host(host: str) -> bool:
    if host == "localhost" or host.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )
