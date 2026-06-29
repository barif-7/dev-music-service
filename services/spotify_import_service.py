from __future__ import annotations

import asyncio
import base64
import hashlib
import secrets

import certifi
import httpx
from fastapi import Request as FastAPIRequest
from fastapi.responses import HTMLResponse, RedirectResponse
from urllib.parse import urlencode

from config import get_settings
from models import (
    BrowserPlaybackState,
    ImportedPlaylistPreview,
    ImportedPlaylistTrack,
    ImportedTrack,
    ProviderPlaylist,
    SpotifyLikedTracksPreview,
)
from services.import_preview_service import ImportPreviewService


class SpotifyImportError(Exception):
    pass


class SpotifyImportService:
    _ACCOUNTS_URL = "https://accounts.spotify.com"
    _API_URL = "https://api.spotify.com/v1"
    _SCOPE = (
        "playlist-read-private playlist-read-collaborative "
        "user-library-read user-library-modify user-top-read user-read-recently-played"
    )
    _STATE_COOKIE = "spotify_oauth_state"
    _VERIFIER_COOKIE = "spotify_code_verifier"
    _TOKEN_COOKIE = "spotify_access_token"  # nosec B105 - cookie name, not a secret

    _cc_token: str | None = None
    _cc_token_expires_at: float = 0.0
    _cc_lock = asyncio.Lock()
    _http_client: httpx.AsyncClient | None = None

    @classmethod
    def _get_http_client(cls) -> httpx.AsyncClient:
        if cls._http_client is None or cls._http_client.is_closed:
            cls._http_client = httpx.AsyncClient(
                verify=certifi.where(),
                timeout=10.0,
            )
        return cls._http_client

    @staticmethod
    def _client_id() -> str:
        client_id = get_settings().spotify_client_id
        if not client_id:
            raise SpotifyImportError(
                "SPOTIFY_CLIENT_ID environment variable is required. "
                "Create a Spotify app at https://developer.spotify.com/dashboard"
            )
        return client_id

    @staticmethod
    def is_configured() -> bool:
        return bool(get_settings().spotify_client_id)

    @staticmethod
    def _client_credentials_configured() -> bool:
        settings = get_settings()
        return bool(settings.spotify_client_id and settings.spotify_client_secret)

    @classmethod
    async def get_client_credentials_token(cls) -> str | None:
        if not cls._client_credentials_configured():
            return None
        import time
        if cls._cc_token and time.monotonic() < cls._cc_token_expires_at:
            return cls._cc_token
        async with cls._cc_lock:
            if cls._cc_token and time.monotonic() < cls._cc_token_expires_at:
                return cls._cc_token
            settings = get_settings()
            try:
                payload = await cls._form_request(
                    f"{cls._ACCOUNTS_URL}/api/token",
                    {
                        "grant_type": "client_credentials",
                        "client_id": settings.spotify_client_id,
                        "client_secret": settings.spotify_client_secret,
                    },
                )
                cls._cc_token = payload.get("access_token")
                expires_in = int(payload.get("expires_in") or 3600)
                cls._cc_token_expires_at = time.monotonic() + expires_in - 60
                return cls._cc_token
            except Exception:
                return None

    @staticmethod
    def _cookie_secure() -> bool:
        return True

    @staticmethod
    def _redirect_uri(request: FastAPIRequest) -> str:
        configured = get_settings().spotify_redirect_uri
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
    async def _form_request(url: str, data: dict[str, str]) -> dict:
        try:
            client = SpotifyImportService._get_http_client()
            response = await client.post(
                url,
                data=data,
                headers={"Accept": "application/json"},
                timeout=8.0,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            raise SpotifyImportError(
                f"Spotify token request failed with {exc.response.status_code}: {exc.response.text}"
            ) from exc

    @staticmethod
    async def callback(request: FastAPIRequest, code: str | None, state: str | None, error: str | None) -> HTMLResponse:
        if error:
            raise SpotifyImportError(f"Spotify authorization failed: {error}")
        if not code or not state:
            raise SpotifyImportError("Spotify authorization callback is missing code or state")

        cookie_state = request.cookies.get(SpotifyImportService._STATE_COOKIE)
        verifier = request.cookies.get(SpotifyImportService._VERIFIER_COOKIE)
        if not cookie_state or not verifier or cookie_state != state:
            raise SpotifyImportError("Spotify authorization state did not match")

        token_payload = await SpotifyImportService._form_request(
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
    async def _spotify_get(access_token: str, path: str, params: dict[str, str | int] | None = None) -> dict:
        try:
            client = SpotifyImportService._get_http_client()
            response = await client.get(
                f"{SpotifyImportService._API_URL}{path}",
                params=params,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {access_token}",
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 403:
                detail = exc.response.text.lower()
                if "insufficient" in detail or "scope" in detail:
                    raise SpotifyImportError(
                        "Spotify token is missing a required scope. Reconnect Spotify to grant liked songs access."
                    ) from exc
            raise SpotifyImportError(
                f"Spotify API request to {path} failed with {exc.response.status_code}: {exc.response.text}"
            ) from exc

    @staticmethod
    async def _spotify_put(
        access_token: str,
        path: str,
        params: dict[str, str] | None = None,
    ) -> None:
        try:
            client = SpotifyImportService._get_http_client()
            response = await client.put(
                f"{SpotifyImportService._API_URL}{path}",
                params=params,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {access_token}",
                },
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 403:
                detail = exc.response.text.lower()
                if "insufficient" in detail or "scope" in detail:
                    raise SpotifyImportError(
                        "Spotify token is missing user-library-modify. Reconnect Spotify to save Liked Songs."
                    ) from exc
            raise SpotifyImportError(
                f"Spotify API request to {path} failed with {exc.response.status_code}: {exc.response.text}"
            ) from exc

    @staticmethod
    def is_connected(request: FastAPIRequest) -> bool:
        return bool(request.cookies.get(SpotifyImportService._TOKEN_COOKIE))

    @staticmethod
    async def list_playlists(request: FastAPIRequest, limit: int = 20, offset: int = 0) -> list[ProviderPlaylist]:
        payload = await SpotifyImportService._spotify_get(
            SpotifyImportService._access_token(request),
            "/me/playlists",
            {"limit": max(1, min(limit, 50)), "offset": max(0, offset)},
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
    async def _playlist(request: FastAPIRequest, playlist_id: str) -> ProviderPlaylist:
        item = await SpotifyImportService._spotify_get(
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
    async def preview_playlist(
        request: FastAPIRequest,
        playlist_id: str,
        limit: int = 25,
        offset: int = 0,
    ) -> ImportedPlaylistPreview:
        token = SpotifyImportService._access_token(request)

        # Fetch playlist metadata and track items in parallel
        playlist, payload = await asyncio.gather(
            SpotifyImportService._playlist(request, playlist_id),
            SpotifyImportService._spotify_get(
                token,
                f"/playlists/{playlist_id}/items",
                {
                    "limit": max(1, min(limit, 50)),
                    "offset": max(0, offset),
                    "fields": "items(track(type,id,name,duration_ms,external_ids,external_urls,artists(name),album(name,release_date,images)))",
                },
            ),
        )

        imported_tracks = [
            imported
            for item in (payload.get("items") or [])
            if (imported := SpotifyImportService._normalize_track(playlist_id, item)) is not None
        ]
        return await ImportPreviewService.build_preview(
            provider="spotify",
            playlist=playlist,
            imported_tracks=imported_tracks,
        )

    @staticmethod
    async def search_tracks(access_token: str, query: str, limit: int = 5) -> list[dict]:
        """Lightweight Spotify track search for autocomplete. Returns raw items
        from the /v1/search endpoint; caller is responsible for shaping them."""
        payload = await SpotifyImportService._spotify_get(
            access_token,
            "/search",
            {"q": query, "type": "track", "limit": max(1, min(limit, 10))},
        )
        return ((payload.get("tracks") or {}).get("items") or [])

    @staticmethod
    def _normalize_saved_track(item: dict) -> ImportedTrack | None:
        track = item.get("track") or {}
        if track.get("type") != "track" or not track.get("name"):
            return None

        album = track.get("album") or {}
        images = album.get("images") or []
        artists = [artist.get("name") for artist in track.get("artists") or [] if artist.get("name")]
        return ImportedTrack(
            provider="spotify",
            provider_track_id=track.get("id"),
            provider_playlist_id="liked",
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
    async def liked_tracks_preview(
        request: FastAPIRequest,
        limit: int = 50,
        offset: int = 0,
    ) -> SpotifyLikedTracksPreview:
        payload = await SpotifyImportService._spotify_get(
            SpotifyImportService._access_token(request),
            "/me/tracks",
            {
                "limit": max(1, min(limit, 50)),
                "offset": max(0, offset),
                "fields": (
                    "items(added_at,track(type,id,name,duration_ms,external_ids,external_urls,"
                    "artists(name),album(name,release_date,images))),total,limit,offset"
                ),
            },
        )

        imported_tracks = [
            imported
            for item in (payload.get("items") or [])
            if (imported := SpotifyImportService._normalize_saved_track(item)) is not None
        ]
        preview = await ImportPreviewService.build_preview(
            provider="spotify",
            playlist=ProviderPlaylist(
                provider="spotify",
                id="liked",
                name="Liked songs",
                track_count=payload.get("total") or 0,
            ),
            imported_tracks=imported_tracks,
        )

        return SpotifyLikedTracksPreview(
            title="Liked songs",
            total=payload.get("total") or 0,
            limit=payload.get("limit") or limit,
            offset=payload.get("offset") or offset,
            tracks=preview.tracks,
            matched_count=preview.matched_count,
            low_confidence_count=preview.low_confidence_count,
            unmatched_count=preview.unmatched_count,
        )

    @staticmethod
    async def save_track(
        request: FastAPIRequest,
        title: str,
        artist: str | None = None,
        album: str | None = None,
        spotify_id: str | None = None,
    ) -> str:
        token = SpotifyImportService._access_token(request)
        track_id = spotify_id
        if not track_id:
            query_parts = [title, artist, album]
            query = " ".join(part.strip() for part in query_parts if part and part.strip())
            matches = await SpotifyImportService.search_tracks(token, query, limit=1)
            track_id = matches[0].get("id") if matches else None
        if not track_id:
            raise SpotifyImportError(f"Spotify could not find '{title}' to save")

        await SpotifyImportService._spotify_put(
            token,
            "/me/library",
            {"uris": f"spotify:track:{track_id}"},
        )
        return track_id

    @staticmethod
    async def is_track_saved(request: FastAPIRequest, spotify_id: str) -> bool:
        """Whether a track already lives in the user's Liked Songs. Lets the UI
        lock the like button on tracks that are already saved (not just ones saved
        this session). Unknown/blank ids resolve to False rather than erroring."""
        if not spotify_id:
            return False
        payload = await SpotifyImportService._spotify_get(
            SpotifyImportService._access_token(request),
            "/me/tracks/contains",
            {"ids": spotify_id},
        )
        # /me/tracks/contains answers with a bare JSON array, e.g. [true]
        if isinstance(payload, list):
            return bool(payload[0]) if payload else False
        return False

    @staticmethod
    async def resolve_track_playback(item: ImportedPlaylistTrack) -> BrowserPlaybackState:
        return await ImportPreviewService.resolve_track_playback(item)

    @staticmethod
    def clear_connection() -> HTMLResponse:
        response = HTMLResponse('{"status":"disconnected"}', media_type="application/json")
        response.delete_cookie(SpotifyImportService._TOKEN_COOKIE)
        return response
