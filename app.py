# Vercel serverless entry point
# This file imports the FastAPI app from main.py

from main import app

# Vercel expects either:
# 1. A variable named 'app' or 'application' (for ASGI/WSGI)
# 2. A handler function
# FastAPI's 'app' is ASGI-compatible, so Vercel can use it directly
