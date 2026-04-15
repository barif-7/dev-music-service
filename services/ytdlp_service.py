import yt_dlp
import subprocess
from urllib.parse import urlencode


class YTDLPService:

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
        )

        return {
            "title": entry.get("title", "Unknown Title"),
            "duration": entry.get("duration") or 0,
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
