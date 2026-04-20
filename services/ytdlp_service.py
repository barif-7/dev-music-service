from services.local_playback_service import LocalPlaybackService
from services.music_service import MusicService


class YTDLPService:
    @staticmethod
    def search(query: str):
        return [result.model_dump() for result in MusicService.search(query)]

    @staticmethod
    def play(query: str):
        return LocalPlaybackService.play_query(query).model_dump()

    @staticmethod
    def stop():
        return LocalPlaybackService.stop().model_dump()

    @staticmethod
    def resume():
        return LocalPlaybackService.resume().model_dump()

    @staticmethod
    def resolve_stream_url(youtube_url: str):
        return MusicService.resolve_stream_url(youtube_url)

    @staticmethod
    def stream_audio(youtube_url: str):
        return MusicService.resolve_stream_url(youtube_url)
