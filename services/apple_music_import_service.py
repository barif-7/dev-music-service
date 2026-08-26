from __future__ import annotations

import hashlib
import json
import plistlib
from datetime import date, datetime
from pathlib import Path
from typing import Any

from models import AppleMusicImportAlbum, ImportedTrack


class AppleMusicImportError(Exception):
    pass


class AppleMusicImportService:
    """Parse the XML library export written by Music/iTunes without uploading it elsewhere."""

    MAX_XML_BYTES = 50 * 1024 * 1024
    MAX_JSON_BYTES = 100 * 1024 * 1024

    @staticmethod
    def _integer(value: Any) -> int:
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _iso(value: Any) -> str | None:
        if isinstance(value, (datetime, date)):
            return value.isoformat().replace("+00:00", "Z")
        return str(value) if value else None

    @staticmethod
    def _album_id(artist: str, album: str) -> str:
        digest = hashlib.sha256(f"{artist}\0{album}".encode()).hexdigest()[:20]
        return f"apple-album-{digest}"

    @classmethod
    def parse_xml(cls, payload: bytes) -> dict[str, Any]:
        if not payload:
            raise AppleMusicImportError("Choose an Apple Music library XML file")
        if len(payload) > cls.MAX_XML_BYTES:
            raise AppleMusicImportError("Apple Music XML is larger than the 50 MB import limit")
        try:
            library = plistlib.loads(payload)
        except Exception as exc:
            raise AppleMusicImportError("This is not a valid Apple Music/iTunes XML export") from exc
        if not isinstance(library, dict) or not isinstance(library.get("Tracks"), dict):
            raise AppleMusicImportError("The XML does not contain an Apple Music Tracks library")

        grouped: dict[str, list[ImportedTrack]] = {}
        album_meta: dict[str, tuple[str, str]] = {}
        for raw_id, raw in library["Tracks"].items():
            if not isinstance(raw, dict) or not raw.get("Name"):
                continue
            title = str(raw["Name"]).strip()
            artist = str(raw.get("Album Artist") or raw.get("Artist") or "Unknown Artist").strip()
            album = str(raw.get("Album") or "Unknown Album").strip()
            album_id = cls._album_id(artist, album)
            year = cls._integer(raw.get("Year")) or None
            track = ImportedTrack(
                provider="apple_music",
                provider_track_id=str(raw.get("Persistent ID") or raw_id),
                provider_playlist_id=album_id,
                title=title,
                artist_names=[artist],
                album=album,
                duration_ms=cls._integer(raw.get("Total Time")),
                isrc=raw.get("ISRC"),
                release_date=str(year) if year else None,
                release_year=year,
                provider_url=raw.get("Location"),
                track_number=cls._integer(raw.get("Track Number")) or None,
                disc_number=cls._integer(raw.get("Disc Number")) or None,
                plays=cls._integer(raw.get("Play Count")),
                skips=cls._integer(raw.get("Skip Count")),
                loved=bool(raw.get("Loved")),
                explicit=str(raw.get("Content Rating") or "").lower() == "explicit",
                streaming=bool(raw.get("Apple Music")),
                genre=raw.get("Genre"),
                last_played_at=cls._iso(raw.get("Play Date UTC")),
                date_added_at=cls._iso(raw.get("Date Added")),
            )
            grouped.setdefault(album_id, []).append(track)
            album_meta[album_id] = (album, artist)

        albums = []
        for album_id, tracks in grouped.items():
            tracks.sort(key=lambda t: (t.disc_number or 1, t.track_number or 9999, t.title.lower()))
            album, artist = album_meta[album_id]
            years = [track.release_year for track in tracks if track.release_year]
            genres = [track.genre for track in tracks if track.genre]
            albums.append(
                AppleMusicImportAlbum(
                    id=album_id,
                    name=album,
                    artist=artist,
                    year=min(years) if years else None,
                    genre=max(set(genres), key=genres.count) if genres else None,
                    track_count=len(tracks),
                    duration_ms=sum(track.duration_ms for track in tracks),
                    plays=sum(track.plays for track in tracks),
                    skips=sum(track.skips for track in tracks),
                    loved=any(track.loved for track in tracks),
                    explicit=any(track.explicit for track in tracks),
                    streaming=any(track.streaming for track in tracks),
                    tracks=tracks,
                )
            )
        albums.sort(key=lambda item: (item.artist.lower(), item.year or 0, item.name.lower()))
        track_count = sum(len(album.tracks) for album in albums)
        return {
            "provider": "apple_music",
            "source": "music_library_xml",
            "library": {
                "name": library.get("Library Persistent ID") or "Apple Music Library",
                "album_count": len(albums),
                "track_count": track_count,
                "plays": sum(album.plays for album in albums),
                "skips": sum(album.skips for album in albums),
            },
            "albums": [album.model_dump() for album in albums],
        }

    @classmethod
    def normalize_export(cls, payload: Any) -> dict[str, Any]:
        """Validate a generated JSON export into the shared import model."""
        if not isinstance(payload, dict) or payload.get("provider") != "apple_music":
            raise AppleMusicImportError("Expected an Apple Music export")
        raw_albums = payload.get("albums")
        if not isinstance(raw_albums, list):
            raise AppleMusicImportError("The Apple Music export does not contain albums")
        try:
            prepared_albums = []
            for raw_album in raw_albums:
                album = dict(raw_album)
                album_id = str(album.get("id") or "")
                album["provider"] = "apple_music"
                album["tracks"] = [
                    {
                        **dict(track),
                        "provider": "apple_music",
                        "provider_playlist_id": track.get("provider_playlist_id") or album_id,
                    }
                    for track in album.get("tracks") or []
                ]
                prepared_albums.append(album)
            albums = [AppleMusicImportAlbum.model_validate(album) for album in prepared_albums]
        except Exception as exc:
            raise AppleMusicImportError("The Apple Music export contains invalid track data") from exc

        result = dict(payload)
        result["provider"] = "apple_music"
        result["albums"] = [album.model_dump() for album in albums]
        library = dict(result.get("library") or {})
        library["album_count"] = len(albums)
        library["track_count"] = sum(len(album.tracks) for album in albums)
        result["library"] = library
        return result

    @classmethod
    def load_export(cls, path: Path) -> dict[str, Any]:
        """Load a configured local/iCloud export without exposing its path."""
        source = path.expanduser()
        try:
            size = source.stat().st_size
            payload = source.read_bytes()
        except OSError as exc:
            raise AppleMusicImportError("The configured Apple Music export is unavailable") from exc
        if source.suffix.lower() == ".xml":
            return cls.parse_xml(payload)
        if size > cls.MAX_JSON_BYTES:
            raise AppleMusicImportError("Apple Music JSON is larger than the 100 MB import limit")
        try:
            return cls.normalize_export(json.loads(payload))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AppleMusicImportError("The configured Apple Music JSON is invalid") from exc
