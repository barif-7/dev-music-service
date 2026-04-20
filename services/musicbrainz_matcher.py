from __future__ import annotations

from models import ImportedTrack, MusicBrainzTrackMatch
from services.metadata_service import MetadataService


class MusicBrainzMatcher:
    @staticmethod
    def _normalize(value: str | None) -> str:
        if not value:
            return ""
        return " ".join(value.lower().replace("’", "'").split())

    @staticmethod
    def _duration_confidence(track_ms: int, recording_seconds: int) -> int:
        if not track_ms or not recording_seconds:
            return 0
        delta = abs(round(track_ms / 1000) - recording_seconds)
        if delta <= 2:
            return 12
        if delta <= 5:
            return 8
        if delta <= 10:
            return 4
        return -10

    @staticmethod
    def _title_artist_confidence(track: ImportedTrack, title: str | None, artist: str | None) -> int:
        score = 0
        if MusicBrainzMatcher._normalize(track.title) == MusicBrainzMatcher._normalize(title):
            score += 18
        elif MusicBrainzMatcher._normalize(track.title) in MusicBrainzMatcher._normalize(title):
            score += 8

        source_artists = {MusicBrainzMatcher._normalize(name) for name in track.artist_names}
        if MusicBrainzMatcher._normalize(artist) in source_artists:
            score += 18
        return score

    @staticmethod
    def _album_confidence(track: ImportedTrack, album: str | None) -> int:
        if not track.album or not album:
            return 0
        return 8 if MusicBrainzMatcher._normalize(track.album) == MusicBrainzMatcher._normalize(album) else 0

    @staticmethod
    def _match_from_recording(track: ImportedTrack, recording: dict, reason: str) -> MusicBrainzTrackMatch:
        artist = MetadataService._artist_credit_name(recording.get("artist-credit"))
        release = MetadataService._best_release(recording.get("releases"), artist)
        release_group = release.get("release-group") or {}
        album = release_group.get("title") or release.get("title")
        duration = MetadataService._duration_seconds(recording.get("length"))
        base = int(recording.get("score") or 80)
        confidence = base
        confidence += MusicBrainzMatcher._title_artist_confidence(track, recording.get("title"), artist)
        confidence += MusicBrainzMatcher._duration_confidence(track.duration_ms, duration)
        confidence += MusicBrainzMatcher._album_confidence(track, album)
        if reason == "isrc":
            confidence += 18
        if not release:
            confidence -= 8

        return MusicBrainzTrackMatch(
            recording_mbid=recording.get("id"),
            release_mbid=release.get("id"),
            release_group_mbid=release_group.get("id"),
            title=recording.get("title"),
            artist=artist,
            album=album,
            release_year=MetadataService._release_year(release.get("date")),
            confidence=max(0, min(100, confidence)),
            match_reason=reason,
            artwork_url=MetadataService._cover_art_url(release),
        )

    @staticmethod
    def _recordings_by_isrc(isrc: str) -> list[dict]:
        return MetadataService._recording_search(f'isrc:"{MetadataService._safe_musicbrainz_phrase(isrc)}"', limit=5)

    @staticmethod
    def _recordings_by_text(track: ImportedTrack) -> list[dict]:
        artist = track.artist_names[0] if track.artist_names else ""
        if artist:
            query = f'artist:"{MetadataService._safe_musicbrainz_phrase(artist)}" AND recording:"{MetadataService._safe_musicbrainz_phrase(track.title)}"'
        else:
            query = MetadataService._safe_musicbrainz_phrase(track.title)
        return MetadataService._recording_search(query, limit=5)

    @staticmethod
    def match_track(track: ImportedTrack) -> MusicBrainzTrackMatch:
        candidates: list[MusicBrainzTrackMatch] = []

        if track.isrc:
            for recording in MusicBrainzMatcher._recordings_by_isrc(track.isrc):
                candidates.append(MusicBrainzMatcher._match_from_recording(track, recording, "isrc"))

        if not candidates:
            for recording in MusicBrainzMatcher._recordings_by_text(track):
                candidates.append(MusicBrainzMatcher._match_from_recording(track, recording, "artist_title_duration"))

        if not candidates:
            return MusicBrainzTrackMatch(match_reason="unmatched")

        return max(candidates, key=lambda match: match.confidence)
