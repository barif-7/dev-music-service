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
    @staticmethod
    async def build_preview(
        provider: str,
        playlist: ProviderPlaylist,
        imported_tracks: list[ImportedTrack],
    ) -> ImportedPlaylistPreview:
        match_results = await asyncio.gather(
            *[MusicBrainzMatcher.match_track(track) for track in imported_tracks]
        )
        tracks = [
            ImportedPlaylistTrack(source=source, musicbrainz=match)
            for source, match in zip(imported_tracks, match_results)
        ]
        matched = sum(1 for item in tracks if item.musicbrainz.confidence >= 80)
        low = sum(1 for item in tracks if 0 < item.musicbrainz.confidence < 80)
        unmatched = sum(1 for item in tracks if item.musicbrainz.confidence == 0)
        return ImportedPlaylistPreview(
            provider=provider,
            playlist=playlist,
            tracks=tracks,
            matched_count=matched,
            low_confidence_count=low,
            unmatched_count=unmatched,
        )

    @staticmethod
    async def _search_playback_candidate(
        query: str,
        duration: int,
        artist: str | None,
        title: str | None,
    ) -> list[dict]:
        return await asyncio.to_thread(
            MusicService.search,
            query,
            1,
            duration or None,
            artist,
            title,
        )

    @staticmethod
    async def resolve_track_playback(item: ImportedPlaylistTrack) -> BrowserPlaybackState:
        source = item.source
        match = item.musicbrainz

        title = match.title or source.title
        artist = match.artist or (source.artist_names[0] if source.artist_names else None)
        album = match.album or source.album
        duration = round(source.duration_ms / 1000) if source.duration_ms else 0
        query_variants = []
        if artist and title:
            query_variants.extend(
                [
                    f"{artist} {title}",
                    f"{title} {artist}",
                    f"{artist} - {title}",
                    f"{artist} {title} official audio",
                    f"{artist} {title} audio",
                ]
            )
        if title:
            query_variants.append(title)
            query_variants.append(f"{title} official audio")
            query_variants.append(f"{title} audio")
            query_variants.append(f"{title} topic")
        if artist:
            query_variants.append(artist)
            if title:
                query_variants.append(f"{artist} - {title} official audio")
        if source.title and source.title not in query_variants:
            query_variants.append(source.title)
        if source.artist_names:
            query_variants.append(" ".join(source.artist_names + [source.title]))

        query_variants = [query.strip() for query in query_variants if query and query.strip()]
        if not query_variants:
            raise ImportPreviewError("Imported track is missing a searchable title and artist")

        search_tasks = [
            asyncio.create_task(
                ImportPreviewService._search_playback_candidate(
                    query,
                    duration,
                    artist,
                    title,
                )
            )
            for query in query_variants[:5]
        ]
        results = []
        last_error: str | None = None
        try:
            for completed in asyncio.as_completed(search_tasks, timeout=8.0):
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
            for task in search_tasks:
                if not task.done():
                    task.cancel()

        if not results:
            raise ImportPreviewError(
                f"No playback result found for '{query_variants[0]}'"
                + (f" ({last_error})" if last_error else "")
            )

        result = results[0]
        result_webpage_url = (
            getattr(result, "webpage_url", None)
            if not isinstance(result, dict)
            else result.get("webpage_url")
        )
        result_duration = (
            getattr(result, "duration", None)
            if not isinstance(result, dict)
            else result.get("duration")
        )
        result_thumbnail = (
            getattr(result, "thumbnail", None)
            if not isinstance(result, dict)
            else result.get("thumbnail")
        )
        result_artwork_source = (
            getattr(result, "artwork_source", None)
            if not isinstance(result, dict)
            else result.get("artwork_source")
        )
        result_artwork_confidence = (
            getattr(result, "artwork_confidence", None)
            if not isinstance(result, dict)
            else result.get("artwork_confidence")
        )
        provider_artwork_source = source.provider or "import"
        return MusicService.build_browser_state(
            result_webpage_url,
            title=title,
            duration=duration or result_duration or 0,
            album=album,
            artist=artist,
            thumbnail=match.artwork_url or source.artwork_url or result_thumbnail,
            artwork_source=(
                "musicbrainz"
                if match.artwork_url
                else (provider_artwork_source if source.artwork_url else result_artwork_source)
            ),
            artwork_confidence=(
                match.match_reason
                if match.match_reason != "unmatched"
                else result_artwork_confidence
            ),
            release_year=(
                match.release_year
                or source.release_year
                or MusicService._extract_year(
                    {
                        "release_year": source.release_year,
                        "release_date": source.release_date,
                    }
                )
            ),
        )
