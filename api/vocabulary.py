"""Same-origin adapter to the independently running vocabulary plugin."""
import re
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

from config import get_settings
from api.live_component_bindings import vocabulary_library, vocabulary_workspace
from services.live_components import app_proxy

router = APIRouter(prefix="/api/vocabulary", tags=["vocabulary"])
_ROUTES = {
    "health": {"GET"}, "overview": {"GET"}, "words": {"GET", "POST"},
    "due": {"GET"}, "reviews": {"POST"}, "usages": {"POST"},
    "lookup": {"POST"}, "import": {"POST"}, "export": {"GET"},
}


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT"])
@vocabulary_workspace
@vocabulary_library
async def vocabulary_proxy(path: str, request: Request):
    settings = get_settings()
    if settings.vercel:
        raise HTTPException(503, "Vocabulary storage is available in the local Phase app.")
    allowed = {"GET", "PUT"} if re.fullmatch(r"words/[0-9a-fA-F-]{36}", path) else _ROUTES.get(path, set())
    if request.method not in allowed:
        raise HTTPException(404, "Unknown vocabulary operation")
    origin = request.headers.get("origin")
    if origin and urlsplit(origin).netloc != request.headers.get("host"):
        raise HTTPException(403, "Vocabulary requests must come from this app")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 8 * 1024 * 1024:
            raise HTTPException(413, "Vocabulary request is too large")
    upstream_path = "health" if path == "health" else f"v1/{path}"
    try:
        result = await app_proxy('vocabulary', settings).request(
            request.method,
            upstream_path,
            timeout=100 if path == 'lookup' else 15,
            params=request.query_params,
            content=bytes(body),
            headers={"Content-Type": "application/json"},
        )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Vocabulary service is offline. Start scripts/run-vocabulary.sh on this Mac.") from exc
    headers = {"Cache-Control": "no-store"}
    if "content-disposition" in result.headers:
        headers["Content-Disposition"] = result.headers["content-disposition"]
    return Response(result.content, status_code=result.status_code,
                    media_type="application/json", headers=headers)
