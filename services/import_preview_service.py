from __future__ import annotations

import asyncio

from models import (
    BrowserPlaybackState,
    ImportedPlaylistPreview,
    ImportedPlaylistTrack,
    ImportedTrack,
    ProviderPlaylist,
)
from services.music_service import MusicService
from services.musicbrainz_matcher import MusicBrainzMatcher


class ImportPreviewError(Exception):
    pass


class ImportPreviewService:
    """Provider-neutral matching and browser playback for offline imports."""

    @staticmethod
    async def build_preview(
        provider: str,
        playlist: ProviderPlaylist,
        imported_tracks: list[ImportedTrack],
    ) -> ImportedPlaylistPreview:
        matches = await asyncio.gather(
            *[MusicBrainzMatcher.match_track(track) for track in imported_tracks]
        )
        tracks = [
            ImportedPlaylistTrack(source=source, musicbrainz=match)
            for source, match in zip(imported_tracks, matches)
        ]
        return ImportedPlaylistPreview(
            provider=provider,
            playlist=playlist,
            tracks=tracks,
            matched_count=sum(item.musicbrainz.confidence >= 80 for item in tracks),
            low_confidence_count=sum(
                0 < item.musicbrainz.confidence < 80 for item in tracks
            ),
            unmatched_count=sum(item.musicbrainz.confidence == 0 for item in tracks),
        )

    @staticmethod
    async def _search(
        query: str, duration: int, artist: str | None, title: str | None
    ) -> list[dict]:
        return await asyncio.to_thread(
            MusicService.search, query, 1, duration or None, artist, title
        )

    @staticmethod
    async def resolve_track_playback(item: ImportedPlaylistTrack) -> BrowserPlaybackState:
        source, match = item.source, item.musicbrainz
        title = match.title or source.title
        artist = match.artist or (source.artist_names[0] if source.artist_names else None)
        album = match.album or source.album
        duration = round(source.duration_ms / 1000) if source.duration_ms else 0
        variants = []
        if artist and title:
            variants.extend(
                [f"{artist} {title}", f"{title} {artist}", f"{artist} - {title}"]
            )
        if title:
            variants.extend([title, f"{title} official audio"])
        variants = list(dict.fromkeys(query.strip() for query in variants if query.strip()))
        if not variants:
            raise ImportPreviewError("Imported track is missing a title and artist")

        tasks = [
            asyncio.create_task(ImportPreviewService._search(q, duration, artist, title))
            for q in variants[:5]
        ]
        results = []
        last_error = None
        try:
            for completed in asyncio.as_completed(tasks, timeout=8.0):
                try:
                    results = await completed
                except Exception as exc:
                    last_error = str(exc)
                    continue
                if results:
                    break
        except TimeoutError:
            last_error = "search timed out"
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
        if not results:
            suffix = f" ({last_error})" if last_error else ""
            raise ImportPreviewError(f"No playback result found for '{variants[0]}'{suffix}")

        result = results[0]

        def value(key, default=None):
            if isinstance(result, dict):
                return result.get(key, default)
            return getattr(result, key, default)

        return MusicService.build_browser_state(
            value("webpage_url"),
            title=title,
            duration=duration or value("duration", 0),
            album=album,
            artist=artist,
            thumbnail=match.artwork_url or source.artwork_url or value("thumbnail"),
            artwork_source=(
                "musicbrainz"
                if match.artwork_url
                else (source.provider if source.artwork_url else value("artwork_source"))
            ),
            artwork_confidence=(
                match.match_reason
                if match.match_reason != "unmatched"
                else value("artwork_confidence")
            ),
            release_year=match.release_year or source.release_year,
        )
