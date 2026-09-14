# Vercel serverless entry point
# This file is required for Vercel Python runtime

# Import FastAPI app from main.py
# Vercel expects a variable named 'app' at the module level
from main import app as app  # noqa: F401
