from __future__ import annotations

import sys

import yt_dlp


def main() -> int:
    version = getattr(yt_dlp.version, "__version__", "unknown")
    extractors = yt_dlp.extractor.gen_extractors()
    youtube_ok = any(extractor.IE_NAME == "youtube" for extractor in extractors)
    if not youtube_ok:
        print(f"yt-dlp {version}: youtube extractor missing", file=sys.stderr)
        return 1
    print(f"yt-dlp {version}: youtube extractor available")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
