"""Resolver integration contracts that mocked stream URLs cannot exercise."""
import pytest
import yt_dlp

from services.music_service import MusicService
from services.video_service import VideoService


@pytest.mark.parametrize("operation", [
    lambda url: MusicService.search("runtime fixture", limit=1),
    MusicService.get_metadata,
    MusicService.get_stream_source,
    lambda url: VideoService.search("runtime fixture", limit=1),
    VideoService.get_video_stream_source,
])
def test_every_extraction_enables_configured_runtime(monkeypatch, operation):
    monkeypatch.setenv("YTDLP_JS_RUNTIME", "node:/configured/node")
    MusicService._search_cache.clear()
    MusicService._stream_cache.clear()
    VideoService._video_search_cache.clear()
    VideoService._video_stream_cache.clear()
    calls = []

    def extract(ydl, query, download=False):
        calls.append(ydl.params)
        entry = {
            "title": "Fixture", "duration": 120,
            "webpage_url": "https://www.youtube.com/watch?v=fixture",
            "url": "https://media.googlevideo.com/videoplayback",
        }
        return {"entries": [entry]} if query.startswith("ytsearch") else entry

    monkeypatch.setattr(yt_dlp.YoutubeDL, "extract_info", extract)
    operation("https://www.youtube.com/watch?v=fixture")
    assert len(calls) == 1
    assert calls[0]["js_runtimes"] == {"node": {"path": "/configured/node"}}
    # yt-dlp maintains its clients; pinning old clients defeats resolver updates.
    assert not calls[0].get("extractor_args", {}).get("youtube", {}).get("player_client")


def test_muted_video_can_use_dash_without_making_audio_fallback_silent():
    formats = [{
        "format_id": "135", "url": "https://media.googlevideo.com/video",
        "ext": "mp4", "height": 480, "protocol": "https",
        "vcodec": "avc1.4d401f", "acodec": "none",
    }]
    with yt_dlp.YoutubeDL({"quiet": True}) as ydl:
        context = {
            "formats": formats, "has_merged_format": False,
            "incomplete_formats": False,
        }
        video = ydl.build_format_selector(VideoService._BROWSER_VIDEO_FORMAT)
        audio_fallback = ydl.build_format_selector(VideoService._BROWSER_AV_FORMAT)
        assert [item["format_id"] for item in video(context)] == ["135"]
        assert list(audio_fallback(context)) == []


def test_audio_fallback_does_not_reuse_muted_video_cache(monkeypatch):
    VideoService._video_stream_cache.clear()
    calls = []

    def extract(ydl, query, download=False):
        calls.append(ydl.params["format"])
        kind = "combined" if ydl.params["format"] == VideoService._BROWSER_AV_FORMAT else "silent"
        return {"url": f"https://media.googlevideo.com/{kind}"}

    monkeypatch.setattr(yt_dlp.YoutubeDL, "extract_info", extract)
    url = "https://www.youtube.com/watch?v=cache-fixture"
    assert VideoService.get_video_stream_source(url)[0].endswith("/silent")
    assert VideoService.get_video_stream_source(url, require_audio=True)[0].endswith("/combined")
    assert VideoService.get_video_stream_source(url)[0].endswith("/silent")
    assert len(calls) == 2
