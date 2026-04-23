# Vercel Deployment Guide

## Quick Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

## Configuration

### requirements.txt
Contains **production dependencies only**. Vercel runs:
```bash
pip install -r requirements.txt
```

Test dependencies (pytest, etc.) are in `pyproject.toml` under `[project.optional-dependencies]`.

### vercel.json
```json
{
  "installCommand": "apt-get update && apt-get install -y ffmpeg && pip install -r requirements.txt",
  "functions": {
    "api/index.py": {
      "maxDuration": 60,
      "runtime": "python3.12"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}
```

**Why ffmpeg?** yt-dlp requires ffmpeg for audio extraction and format conversion.

### api/index.py
Vercel's entry point. Must exist and import your FastAPI app:
```python
from main import app
```

## Troubleshooting

### ModuleNotFoundError
**Error:** `No module named 'structlog'`

**Cause:** Dependencies not installed during build.

**Fix:** 
1. Ensure `requirements.txt` has all dependencies
2. Check `installCommand` in vercel.json
3. Clear build cache in Vercel dashboard

### FUNCTION_INVOCATION_FAILED
**Error:** `could not import "api/index.py"`

**Cause:** Entry point doesn't exist or import fails.

**Fix:**
1. Ensure `api/index.py` exists
2. Check that `main.py` can be imported
3. Verify all dependencies in requirements.txt

### Timeout Errors
**Error:** `Function invocation timed out`

**Cause:** Streaming endpoints exceed default 10s timeout.

**Fix:** Set `maxDuration: 60` in vercel.json functions config.

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

- `SPOTIFY_CLIENT_ID` - Spotify API client ID
- `SPOTIFY_REDIRECT_URI` - OAuth callback URL (optional)

## Build Process

1. **Install** - `pip install -r requirements.txt`
2. **Build** - Python functions compiled
3. **Deploy** - Uploaded to edge network

## Local Testing

```bash
# Test Vercel build locally
vercel dev

# Test production build
vercel --prod
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Module not found | Check requirements.txt |
| Import error | Verify api/index.py exists |
| Timeout | Increase maxDuration |
| CORS error | Check middleware config |
| Cold start | Use maxDuration wisely |

## Resources

- [Vercel Python Runtime](https://vercel.com/docs/runtimes/python)
- [Function Configuration](https://vercel.com/docs/functions/serverless-functions/function-config)
- [Environment Variables](https://vercel.com/docs/projects/environment-variables)
