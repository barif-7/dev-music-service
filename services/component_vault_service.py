from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote, urlparse

import httpx
import structlog

logger = structlog.get_logger()


class ComponentVaultError(Exception):
    """The Component Vault could not answer."""


def _decode_tool_result(payload: dict[str, Any]) -> dict[str, Any]:
    """Unwrap one MCP `tools/call` response into the tool's own JSON object.

    MCP returns a result envelope whose `content` is a list of parts; the
    component tools emit a single `text` part holding pretty-printed JSON. A
    tool that fails sets `isError` and puts the message in that same text part,
    so both shapes have to be read out of the envelope rather than the HTTP
    status, which is 200 either way.
    """
    if "error" in payload:
        message = payload["error"].get("message") if isinstance(payload["error"], dict) else None
        raise ComponentVaultError(message or "Component Vault rejected the request")
    result = payload.get("result")
    if not isinstance(result, dict):
        raise ComponentVaultError("Component Vault returned no result")
    parts = result.get("content")
    text = None
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, dict) and part.get("type") == "text":
                text = part.get("text")
                break
    if not isinstance(text, str):
        raise ComponentVaultError("Component Vault returned no text content")
    if result.get("isError"):
        raise ComponentVaultError(text.strip() or "Component Vault reported an error")
    try:
        decoded = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ComponentVaultError("Component Vault returned malformed JSON") from exc
    if not isinstance(decoded, dict):
        raise ComponentVaultError("Component Vault returned an unexpected shape")
    return decoded


class ComponentVaultService:
    """Search the local HistoryKit Component Vault over its MCP HTTP transport.

    The vault is an MCP server, not a REST API, so the only supported way in is
    a `tools/call`. Its Streamable HTTP transport runs stateless — every POST is
    self-contained — which is why there is no `initialize` handshake or session
    id here: adding one would buy nothing and give the endpoint state to lose.

    Preview URLs are rebuilt from configuration rather than passed through from
    the tool response. The response's `preview_url` is an absolute URL chosen by
    another process, and the browser is going to put it in an iframe; deriving
    it from a setting keeps the framed origin something this app decides.
    """

    def __init__(
        self,
        mcp_url: str,
        preview_base_url: str,
        client: httpx.AsyncClient | None = None,
        timeout: float = 8.0,
    ) -> None:
        self._mcp_url = mcp_url
        self._preview_base = preview_base_url.rstrip("/")
        self._client = client
        self._timeout = timeout
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"User-Agent": "dev-music-service/0.4 (component-vault)"},
            )
            self._owns_client = True
        return self._client

    @property
    def preview_origin(self) -> str:
        """The origin the surface is allowed to frame, for the caller's CSP."""
        parsed = urlparse(self._preview_base)
        if not parsed.scheme or not parsed.netloc:
            return ""
        return f"{parsed.scheme}://{parsed.netloc}"

    def _preview_url(self, component_id: str) -> str:
        """The vault's preview page, asked for the mode an embed wants.

        Not `dev=1`, which the MCP server's own preview_url uses: that is the
        workbench — prop editors, a component switcher, links back to the
        gallery — which is right for a developer opening a tab and wrong inside
        a note, where it buries the component under tooling. `embed=1` drops the
        centring box and reports the painted size back, and `theme=dark` matches
        the surface this app frames it in.
        """
        return (
            f"{self._preview_base}/?id={quote(component_id, safe='')}"
            "&embed=1&theme=dark"
        )

    async def _call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        try:
            response = await self._get_client().post(
                self._mcp_url,
                json=request,
                headers={"Accept": "application/json, text/event-stream"},
            )
        except httpx.HTTPError as exc:
            logger.warning("component_vault_unreachable", tool=name, error=str(exc))
            raise ComponentVaultError("Component Vault is unreachable") from exc
        if response.status_code >= 400:
            logger.warning("component_vault_http_error", tool=name, status=response.status_code)
            raise ComponentVaultError(f"Component Vault returned HTTP {response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise ComponentVaultError("Component Vault returned a non-JSON body") from exc
        if not isinstance(payload, dict):
            raise ComponentVaultError("Component Vault returned an unexpected envelope")
        return _decode_tool_result(payload)

    def _project(self, entry: dict[str, Any]) -> dict[str, Any] | None:
        """Reduce a vault entry to what a picker row and a preview card need.

        Source, imports, audit measurements and package lists are all deliberately
        dropped: this endpoint feeds a note editor, not a code generator, and
        every field it forwards is one the browser will render.
        """
        component_id = entry.get("id")
        if not isinstance(component_id, str) or not component_id:
            return None
        return {
            "id": component_id,
            "name": entry.get("name") or component_id,
            "app": entry.get("app"),
            "project": entry.get("project"),
            "account": entry.get("account"),
            "category": entry.get("category") or "unknown",
            "description": entry.get("description"),
            "rel_path": entry.get("rel_path"),
            "language": entry.get("language"),
            "status": entry.get("status") or "unknown",
            "is_ui_primitive": bool(entry.get("is_ui_primitive")),
            "preview_url": self._preview_url(component_id),
        }

    async def search(self, query: str, limit: int = 8) -> dict[str, Any]:
        payload = await self._call_tool(
            "search_components",
            {"query": query, "limit": limit, "search_source": True},
        )
        raw = payload.get("results")
        results = []
        if isinstance(raw, list):
            for entry in raw:
                if not isinstance(entry, dict):
                    continue
                projected = self._project(entry)
                if projected is not None:
                    results.append(projected)
        total = payload.get("total_matches")
        return {
            "query": query,
            "total_matches": total if isinstance(total, int) else len(results),
            "preview_origin": self.preview_origin,
            "results": results,
        }
