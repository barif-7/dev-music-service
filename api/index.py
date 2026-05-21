# Vercel serverless entry point
# Initialize Node.js runtime for yt-dlp before importing main

import subprocess  # nosec B404

from config import configure_ytdlp_js_runtime

# Install and setup Node.js for yt-dlp JavaScript runtime
try:
    # Check if deno or node is available (Vercel provides Node.js)
    subprocess.run(['node', '--version'], check=True, capture_output=True)  # nosec B603 B607
    configure_ytdlp_js_runtime("node")
except (subprocess.CalledProcessError, FileNotFoundError):
    pass

from main import app as app  # noqa: F401

# Vercel expects either:
# 1. A variable named 'app' or 'application' (for ASGI/WSGI)
# 2. A handler function
# FastAPI's 'app' is ASGI-compatible, so Vercel can use it directly
