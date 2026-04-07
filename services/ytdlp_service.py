import yt_dlp
import subprocess


class YTDLPService:

    @staticmethod
    def search(query: str):
        ydl_opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "noplaylist": True
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch5:{query}", download=False)
                entries = info.get("entries") or []
        except Exception:
            return []

        entries = [e for e in entries if e]

        results = []
        for entry in entries:
            webpage_url = entry.get("webpage_url")
            if webpage_url:
                results.append({
                    "title": entry.get("title", "Unknown Title"),
                    "url": f"/stream?url={webpage_url}"
                })

        return results

    @staticmethod
    def stream_audio(youtube_url: str):
        ydl_opts = {
            "format": "bestaudio",
            "quiet": True,
            "noplaylist": True
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            direct_url = info.get("url")
            if not direct_url:
                raise Exception("Failed to extract audio URL")

        process = subprocess.Popen(
            [
                "ffmpeg",
                "-loglevel", "error",
                "-i", direct_url,
                "-f", "mp3",
                "-vn",
                "pipe:1"
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )

        return process.stdout
