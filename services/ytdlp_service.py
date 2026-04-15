import yt_dlp
import subprocess
import signal
import time
from urllib.parse import urlencode


class YTDLPService:
    _active_process = None
    _last_played = None

    @staticmethod
    def _search_entries(query: str):
        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "noplaylist": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch5:{query}", download=False)
            entries = [e for e in (info.get("entries") or []) if e]

        return entries

    @staticmethod
    def _first_search_result(query: str):
        entries = YTDLPService._search_entries(query)
        if not entries:
            return None

        return entries[0]

    @staticmethod
    def _extract_audio_source(webpage_url: str):
        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "noplaylist": True,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android"],
                }
            },
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(webpage_url, download=False)
            direct_url = info.get("url")
            if not direct_url:
                raise Exception("Failed to extract audio URL")

            headers = info.get("http_headers") or {}

        return direct_url, headers

    @staticmethod
    def _http_args(headers: dict, referer: str):
        args = []

        user_agent = headers.get("User-Agent")
        if user_agent:
            args.extend(["-user_agent", user_agent])

        if referer:
            args.extend(["-referer", referer])

        custom_headers = []
        for key, value in headers.items():
            if key.lower() in {"user-agent", "referer"}:
                continue
            custom_headers.append(f"{key}: {value}")

        if custom_headers:
            args.extend(["-headers", "\r\n".join(custom_headers) + "\r\n"])

        return args

    @staticmethod
    def _start_playback(webpage_url: str, metadata: dict | None = None):
        direct_url, headers = YTDLPService._extract_audio_source(webpage_url)

        process = subprocess.Popen(
            [
                "ffplay",
                "-nodisp",
                "-autoexit",
                "-loglevel",
                "error",
                *YTDLPService._http_args(headers, webpage_url),
                direct_url,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        YTDLPService._active_process = process
        YTDLPService._last_played = {
            **(metadata or {}),
            "webpage_url": webpage_url,
            "pid": process.pid,
        }

        return process

    @staticmethod
    def _stop_active_process():
        process = YTDLPService._active_process
        if not process:
            return None

        if process.poll() is None:
            try:
                process.send_signal(signal.SIGTERM)
                process.wait(timeout=2)
            except Exception:
                try:
                    process.kill()
                except Exception:
                    pass

        YTDLPService._active_process = None
        return process

    @staticmethod
    def search(query: str):
        try:
            entries = YTDLPService._search_entries(query)
            if not entries:
                return []
        except Exception:
            return []

        results = []
        for entry in entries:
            webpage_url = entry.get("webpage_url")
            if webpage_url:
                results.append({
                    "title": entry.get("title", "Unknown Title"),
                    "url": f"/stream?{urlencode({'url': webpage_url})}",
                    "duration": entry.get("duration") or 0,
                })

        return results

    @staticmethod
    def play(query: str):
        entry = YTDLPService._first_search_result(query)
        if not entry:
            raise Exception("No search results found")

        webpage_url = entry.get("webpage_url")
        if not webpage_url:
            raise Exception("Failed to resolve track URL")

        YTDLPService._stop_active_process()
        process = YTDLPService._start_playback(
            webpage_url,
            {
                "title": entry.get("title", "Unknown Title"),
                "duration": entry.get("duration") or 0,
                "query": query,
            },
        )

        return {
            "title": entry.get("title", "Unknown Title"),
            "duration": entry.get("duration") or 0,
            "webpage_url": webpage_url,
            "pid": process.pid,
        }

    @staticmethod
    def stop():
        process = YTDLPService._active_process
        if not process:
            return {"playing": False, "message": "No active playback"}

        pid = process.pid
        YTDLPService._stop_active_process()
        return {"playing": False, "stopped_pid": pid}

    @staticmethod
    def resume():
        last = YTDLPService._last_played
        if not last:
            raise Exception("Nothing to resume")

        YTDLPService._stop_active_process()
        webpage_url = last.get("webpage_url")
        if not webpage_url:
            raise Exception("Missing playback URL")

        process = YTDLPService._start_playback(webpage_url, last)
        return {
            "title": last.get("title", "Unknown Title"),
            "duration": last.get("duration") or 0,
            "webpage_url": webpage_url,
            "pid": process.pid,
        }

    @staticmethod
    def stream_audio(youtube_url: str):
        direct_url, headers = YTDLPService._extract_audio_source(youtube_url)

        process = subprocess.Popen(
            [
                "ffmpeg",
                "-loglevel", "error",
                *YTDLPService._http_args(headers, youtube_url),
                "-i", direct_url,
                "-f", "mp3",
                "-vn",
                "pipe:1"
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )

        return process.stdout
