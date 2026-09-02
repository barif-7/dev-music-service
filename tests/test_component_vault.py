"""Tests for the Component Vault boundary — all MCP responses mocked.

The fixtures are real-shape, captured from the local HistoryKit MCP server
(POST /mcp, tools/call search_components), including its habit of reporting
tool-level failures inside a 200 envelope rather than as an HTTP error.
"""

import json

import httpx
import pytest

from services.component_vault_service import ComponentVaultError, ComponentVaultService

_ENTRY = {
    "id": "base44-repo-floatdesk::components-dashboard-apps-FilesApp-jsx",
    "name": "FilesApp",
    "project": "base44-repo-floatdesk",
    "app": "FloatDesk UI (Copy)",
    "account": "someone@example.com",
    "origin": "app",
    "category": "input",
    "description": None,
    "rel_path": "components/dashboard/apps/FilesApp.jsx",
    "language": "jsx",
    "reuse_score": 5,
    "is_ui_primitive": False,
    "is_base44": True,
    "status": "pass",
    "duplicate_of": None,
    "copies": 2,
    # The vault names a preview origin of its own; the service must not trust it.
    "preview_url": "http://evil.example/?id=whatever",
    "score": 33,
    "matched_in_source": True,
}


def _envelope(payload: dict, *, is_error: bool = False) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
            "content": [{"type": "text", "text": json.dumps(payload)}],
            **({"isError": True} if is_error else {}),
        },
    }


def _make_service(handler, **kwargs) -> ComponentVaultService:
    return ComponentVaultService(
        mcp_url="http://127.0.0.1:8766/mcp",
        preview_base_url=kwargs.pop("preview_base_url", "http://127.0.0.1:4174"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        **kwargs,
    )


class TestSearch:
    @pytest.mark.asyncio
    async def test_calls_the_search_tool_and_projects_results(self):
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json=_envelope({
                "query": "files", "result_count": 1, "total_matches": 4, "results": [_ENTRY],
            }))

        payload = await _make_service(handler).search("files", limit=5)

        assert seen["body"]["method"] == "tools/call"
        assert seen["body"]["params"]["name"] == "search_components"
        assert seen["body"]["params"]["arguments"] == {
            "query": "files", "limit": 5, "search_source": True,
        }
        assert payload["total_matches"] == 4
        assert payload["preview_origin"] == "http://127.0.0.1:4174"
        (result,) = payload["results"]
        assert result["name"] == "FilesApp"
        assert result["app"] == "FloatDesk UI (Copy)"
        assert result["rel_path"] == "components/dashboard/apps/FilesApp.jsx"
        assert result["status"] == "pass"

    @pytest.mark.asyncio
    async def test_preview_url_is_rebuilt_from_configuration(self):
        """The browser frames this URL, so its origin must be ours to choose."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_envelope({"results": [_ENTRY]}))

        service = _make_service(handler, preview_base_url="http://127.0.0.1:9999/")
        (result,) = (await service.search("files"))["results"]

        assert result["preview_url"].startswith("http://127.0.0.1:9999/?id=")
        assert "evil.example" not in result["preview_url"]
        # The id contains "::", which has to survive the round trip encoded.
        assert "%3A%3A" in result["preview_url"]
        # The embed wants the component, not the vault's prop workbench.
        assert "embed=1" in result["preview_url"]
        assert "theme=dark" in result["preview_url"]
        assert "dev=1" not in result["preview_url"]

    @pytest.mark.asyncio
    async def test_source_and_audit_detail_are_not_forwarded(self):
        """This feeds a note editor: it should carry nothing it will not show."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_envelope({
                "results": [{**_ENTRY, "source": "export default function …",
                             "imports": ["react"], "audit": {"errors": []}}],
            }))

        (result,) = (await _make_service(handler).search("files"))["results"]

        for leaked in ("source", "imports", "audit", "score", "reuse_score"):
            assert leaked not in result

    @pytest.mark.asyncio
    async def test_entries_without_an_id_are_dropped(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_envelope({
                "results": [{"name": "Nameless"}, _ENTRY],
            }))

        results = (await _make_service(handler).search("files"))["results"]
        assert [r["name"] for r in results] == ["FilesApp"]


class TestFailureModes:
    @pytest.mark.asyncio
    async def test_unreachable_vault_raises(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        with pytest.raises(ComponentVaultError, match="unreachable"):
            await _make_service(handler).search("files")

    @pytest.mark.asyncio
    async def test_tool_error_inside_a_200_envelope_raises(self):
        """MCP reports tool failures with isError, not an HTTP status."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={
                "jsonrpc": "2.0", "id": 1,
                "result": {"content": [{"type": "text", "text": "Component Vault manifest is missing"}],
                           "isError": True},
            })

        with pytest.raises(ComponentVaultError, match="manifest is missing"):
            await _make_service(handler).search("files")

    @pytest.mark.asyncio
    async def test_jsonrpc_error_raises(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={
                "jsonrpc": "2.0", "id": 1,
                "error": {"code": -32602, "message": "Unknown tool"},
            })

        with pytest.raises(ComponentVaultError, match="Unknown tool"):
            await _make_service(handler).search("files")

    @pytest.mark.asyncio
    async def test_non_json_body_raises(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text="<html>proxy error</html>")

        with pytest.raises(ComponentVaultError):
            await _make_service(handler).search("files")


class TestEndpoint:
    def test_search_endpoint_returns_the_projected_payload(self, client, monkeypatch):
        import main

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_envelope({
                "total_matches": 1, "results": [_ENTRY],
            }))

        monkeypatch.setattr(main, "_component_vault", _make_service(handler))
        response = client.get("/api/components/search", params={"q": "files"})

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert body["query"] == "files"
        assert body["results"][0]["id"] == _ENTRY["id"]

    def test_unreachable_vault_is_a_503(self, client, monkeypatch):
        """The vault is a developer-machine service; absent is not broken."""
        import main

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        monkeypatch.setattr(main, "_component_vault", _make_service(handler))
        response = client.get("/api/components/search", params={"q": "files"})

        assert response.status_code == 503

    def test_empty_query_is_rejected(self, client):
        assert client.get("/api/components/search", params={"q": ""}).status_code == 422
