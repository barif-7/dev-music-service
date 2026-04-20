from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from fastapi import Request as FastAPIRequest
from fastapi.responses import HTMLResponse, RedirectResponse

from models import (
    ImportedPlaylistPreview,
    ImportedPlaylistTrack,
    ImportedTrack,
    ProviderPlaylist,
)
from services.musicbrainz_matcher import MusicBrainzMatcher


class SpotifyImportError(Exception):
    pass


class SpotifyImportService:
    _ACCOUNTS_URL = "https://accounts.spotify.com"
    _API_URL = "https://api.spotify.com/v1"
    _DEFAULT_CLIENT_ID = "65f51ed07c8a4338934eccb57f5130eb"
    _SCOPE = "playlist-read-private playlist-read-collaborative"
    _STATE_COOKIE = "spotify_oauth_state"
    _VERIFIER_COOKIE = "spotify_code_verifier"
    _TOKEN_COOKIE = "spotify_access_token"

    @staticmethod
    def _client_id() -> str:
        client_id = os.getenv("SPOTIFY_CLIENT_ID") or SpotifyImportService._DEFAULT_CLIENT_ID
        if not client_id:
            raise SpotifyImportError("SPOTIFY_CLIENT_ID is not configured")
        return client_id

    @staticmethod
    def is_configured() -> bool:
        return bool(os.getenv("SPOTIFY_CLIENT_ID") or SpotifyImportService._DEFAULT_CLIENT_ID)

    @staticmethod
    def _cookie_secure() -> bool:
        return bool(os.getenv("VERCEL"))

    @staticmethod
    def _redirect_uri(request: FastAPIRequest) -> str:
        configured = os.getenv("SPOTIFY_REDIRECT_URI")
        if configured:
            return configured
        return str(request.url_for("spotify_callback"))

    @staticmethod
    def _code_verifier() -> str:
        return secrets.token_urlsafe(64)[:96]

    @staticmethod
    def _code_challenge(verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    @staticmethod
    def _set_cookie(response, key: str, value: str, max_age: int = 600) -> None:
        response.set_cookie(
            key,
            value,
            max_age=max_age,
            httponly=True,
            secure=SpotifyImportService._cookie_secure(),
            samesite="lax",
        )

    @staticmethod
    def start_auth(request: FastAPIRequest) -> RedirectResponse:
        state = secrets.token_urlsafe(32)
        verifier = SpotifyImportService._code_verifier()
        params = urlencode(
            {
                "client_id": SpotifyImportService._client_id(),
                "response_type": "code",
                "redirect_uri": SpotifyImportService._redirect_uri(request),
                "scope": SpotifyImportService._SCOPE,
                "state": state,
                "code_challenge_method": "S256",
                "code_challenge": SpotifyImportService._code_challenge(verifier),
            }
        )
        response = RedirectResponse(f"{SpotifyImportService._ACCOUNTS_URL}/authorize?{params}")
        SpotifyImportService._set_cookie(response, SpotifyImportService._STATE_COOKIE, state)
        SpotifyImportService._set_cookie(response, SpotifyImportService._VERIFIER_COOKIE, verifier)
        return response

    @staticmethod
    def _form_request(url: str, data: dict[str, str]) -> dict:
        encoded = urlencode(data).encode("utf-8")
        request = Request(
            url,
            data=encoded,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=8) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise SpotifyImportError(f"Spotify token request failed with {exc.code}: {body}") from exc

    @staticmethod
    def callback(request: FastAPIRequest, code: str | None, state: str | None, error: str | None) -> HTMLResponse:
        if error:
            raise SpotifyImportError(f"Spotify authorization failed: {error}")
        if not code or not state:
            raise SpotifyImportError("Spotify authorization callback is missing code or state")

        cookie_state = request.cookies.get(SpotifyImportService._STATE_COOKIE)
        verifier = request.cookies.get(SpotifyImportService._VERIFIER_COOKIE)
        if not cookie_state or not verifier or cookie_state != state:
            raise SpotifyImportError("Spotify authorization state did not match")

        token_payload = SpotifyImportService._form_request(
            f"{SpotifyImportService._ACCOUNTS_URL}/api/token",
            {
                "client_id": SpotifyImportService._client_id(),
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": SpotifyImportService._redirect_uri(request),
                "code_verifier": verifier,
            },
        )
        access_token = token_payload.get("access_token")
        if not access_token:
            raise SpotifyImportError("Spotify did not return an access token")

        body = """
<!doctype html>
<html>
  <body>
    <p>Spotify connected. You can close this window.</p>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'spotify-connected' }, window.location.origin);
      }
      window.close();
    </script>
  </body>
</html>
"""
        response = HTMLResponse(body)
        SpotifyImportService._set_cookie(
            response,
            SpotifyImportService._TOKEN_COOKIE,
            access_token,
            max_age=int(token_payload.get("expires_in") or 3600),
        )
        response.delete_cookie(SpotifyImportService._STATE_COOKIE)
        response.delete_cookie(SpotifyImportService._VERIFIER_COOKIE)
        return response

    @staticmethod
    def _access_token(request: FastAPIRequest) -> str:
        token = request.cookies.get(SpotifyImportService._TOKEN_COOKIE)
        if not token:
            raise SpotifyImportError("Spotify is not connected")
        return token

    @staticmethod
    def _spotify_get(access_token: str, path: str, params: dict[str, str | int] | None = None) -> dict:
        query = f"?{urlencode(params)}" if params else ""
        request = Request(
            f"{SpotifyImportService._API_URL}{path}{query}",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {access_token}",
            },
        )
        try:
            with urlopen(request, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise SpotifyImportError(f"Spotify API request to {path} failed with {exc.code}: {body}") from exc

    @staticmethod
    def is_connected(request: FastAPIRequest) -> bool:
        return bool(request.cookies.get(SpotifyImportService._TOKEN_COOKIE))

    @staticmethod
    def list_playlists(request: FastAPIRequest, limit: int = 20) -> list[ProviderPlaylist]:
        payload = SpotifyImportService._spotify_get(
            SpotifyImportService._access_token(request),
            "/me/playlists",
            {"limit": max(1, min(limit, 50))},
        )
        playlists = []
        for item in payload.get("items") or []:
            images = item.get("images") or []
            owner = item.get("owner") or {}
            tracks = item.get("tracks") or {}
            playlists.append(
                ProviderPlaylist(
                    provider="spotify",
                    id=item.get("id"),
                    name=item.get("name") or "Untitled playlist",
                    track_count=tracks.get("total") or 0,
                    owner=owner.get("display_name") or owner.get("id"),
                    thumbnail=images[0].get("url") if images else None,
                    provider_url=(item.get("external_urls") or {}).get("spotify"),
                )
            )
        return playlists

    @staticmethod
    def _playlist(request: FastAPIRequest, playlist_id: str) -> ProviderPlaylist:
        item = SpotifyImportService._spotify_get(
            SpotifyImportService._access_token(request),
            f"/playlists/{playlist_id}",
            {
                "fields": "id,name,images,external_urls,owner(display_name,id),tracks(total)",
            },
        )
        images = item.get("images") or []
        owner = item.get("owner") or {}
        tracks = item.get("tracks") or {}
        return ProviderPlaylist(
            provider="spotify",
            id=item.get("id"),
            name=item.get("name") or "Untitled playlist",
            track_count=tracks.get("total") or 0,
            owner=owner.get("display_name") or owner.get("id"),
            thumbnail=images[0].get("url") if images else None,
            provider_url=(item.get("external_urls") or {}).get("spotify"),
        )

    @staticmethod
    def _normalize_track(playlist_id: str, item: dict) -> ImportedTrack | None:
        track = item.get("track") or {}
        if track.get("type") != "track" or not track.get("name"):
            return None

        album = track.get("album") or {}
        images = album.get("images") or []
        artists = [artist.get("name") for artist in track.get("artists") or [] if artist.get("name")]
        return ImportedTrack(
            provider="spotify",
            provider_track_id=track.get("id"),
            provider_playlist_id=playlist_id,
            title=track.get("name"),
            artist_names=artists,
            album=album.get("name"),
            duration_ms=track.get("duration_ms") or 0,
            isrc=(track.get("external_ids") or {}).get("isrc"),
            release_date=album.get("release_date"),
            artwork_url=images[0].get("url") if images else None,
            provider_url=(track.get("external_urls") or {}).get("spotify"),
        )

    @staticmethod
    def preview_playlist(
        request: FastAPIRequest,
        playlist_id: str,
        limit: int = 25,
    ) -> ImportedPlaylistPreview:
        token = SpotifyImportService._access_token(request)
        playlist = SpotifyImportService._playlist(request, playlist_id)
        payload = SpotifyImportService._spotify_get(
            token,
            f"/playlists/{playlist_id}/items",
            {
                "limit": max(1, min(limit, 50)),
                "fields": "items(track(type,id,name,duration_ms,external_ids,external_urls,artists(name),album(name,release_date,images)))",
            },
        )

        tracks = []
        for item in payload.get("items") or []:
            imported = SpotifyImportService._normalize_track(playlist_id, item)
            if not imported:
                continue
            match = MusicBrainzMatcher.match_track(imported)
            tracks.append(ImportedPlaylistTrack(source=imported, musicbrainz=match))

        matched = sum(1 for item in tracks if item.musicbrainz.confidence >= 80)
        low = sum(1 for item in tracks if 0 < item.musicbrainz.confidence < 80)
        unmatched = sum(1 for item in tracks if item.musicbrainz.confidence == 0)
        return ImportedPlaylistPreview(
            provider="spotify",
            playlist=playlist,
            tracks=tracks,
            matched_count=matched,
            low_confidence_count=low,
            unmatched_count=unmatched,
        )

    @staticmethod
    def clear_connection() -> HTMLResponse:
        response = HTMLResponse('{"status":"disconnected"}', media_type="application/json")
        response.delete_cookie(SpotifyImportService._TOKEN_COOKIE)
        return response
