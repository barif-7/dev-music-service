# Vercel serverless entry point
from main import app as app  # noqa: F401

# Vercel expects either:
# 1. A variable named 'app' or 'application' (for ASGI/WSGI)
# 2. A handler function
# FastAPI's 'app' is ASGI-compatible, so Vercel can use it directly
