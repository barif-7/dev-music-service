# Vercel serverless entry point
# This file is required for Vercel Python runtime

# Initialize Node.js runtime for yt-dlp before importing main
import subprocess  # nosec B404

from config import configure_ytdlp_js_runtime

# Install and setup Node.js for yt-dlp JavaScript extractor
try:
    # Check if Node.js is available (Vercel provides it)
    subprocess.run(['node', '--version'], check=True, capture_output=True)  # nosec B603 B607
    configure_ytdlp_js_runtime("node")
except (subprocess.CalledProcessError, FileNotFoundError):
    pass

# Import FastAPI app from main.py
# Vercel expects a variable named 'app' at the module level
from main import app as app  # noqa: F401
