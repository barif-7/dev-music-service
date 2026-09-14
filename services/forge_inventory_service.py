"""Inventory of the MCP servers and database indexes on this machine.

ForgeTool's standalone pages keep MCPTool and DataSource rows in Base44. That
makes the catalogue a second, hand-maintained copy of something the machine
already knows: the MCP servers are declared in Claude's own config files, and
the indexes are SQLite files on disk. This service reads those directly, so the
ForgeTool surface describes what is actually installed rather than what someone
remembered to register.

Nothing here writes. Probing an MCP server means asking it to list its tools --
the same read every MCP client performs at startup.

Credentials never leave this module. A server declared with an Authorization
header or an env var holding a token is reported with the *shape* of that
config and the secret replaced by a marker, because the whole inventory is
rendered inside an embedded surface.
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import httpx
import structlog

logger = structlog.get_logger()

# Config keys whose values are secrets rather than settings.
_SECRET_HINTS = ("token", "secret", "key", "password", "authorization", "auth", "bearer")
_REDACTED = "· redacted ·"

# Directories that hold caches shaped like indexes but aren't ones.
_SKIP_DIRS = {
    ".mypy_cache", ".pytest_cache", "node_modules", "__pycache__", ".git",
    # An Electron app's support directory is a Chrome profile, and Chrome keeps
    # a dozen SQLite files of its own in it. They are not anybody's index.
    "Cache", "Code Cache", "GPUCache", "blob_storage", "chrome-debug",
    "DawnGraphiteCache", "DawnWebGPUCache", "Local Storage", "Session Storage",
}

# A COUNT(*) over a multi-gigabyte table can take seconds. Rows are the
# interesting number for an index, so they are counted -- but under a budget,
# and a table that blows it is reported without a count rather than stalling
# the whole request.
_COUNT_STEP_BUDGET = 2_000


class ForgeInventoryError(Exception):
    """The inventory could not be assembled."""


def _looks_secret(key: str) -> bool:
    lowered = key.lower()
    return any(hint in lowered for hint in _SECRET_HINTS)


def _redact(mapping: dict[str, Any] | None) -> dict[str, str]:
    """Keep the keys, drop the values that are credentials."""
    if not isinstance(mapping, dict):
        return {}
    return {
        key: (_REDACTED if _looks_secret(key) or _looks_secret(str(value)) else str(value))
        for key, value in mapping.items()
    }


@dataclass
class McpServer:
    name: str
    scope: str                     # where it is declared
    transport: str                 # "stdio" | "http"
    command: str | None = None
    args: list[str] = field(default_factory=list)
    url: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    tools: list[dict[str, str]] = field(default_factory=list)
    status: str = "unprobed"
    detail: str | None = None

    def public(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "scope": self.scope,
            "transport": self.transport,
            "command": self.command,
            "args": self.args,
            "url": self.url,
            "env": self.env,
            "headers": self.headers,
            "tools": self.tools,
            "toolCount": len(self.tools),
            "status": self.status,
            "detail": self.detail,
        }


class ForgeInventoryService:
    def __init__(
        self,
        *,
        claude_config: Path | None = None,
        project_mcp_config: Path | None = None,
        index_roots: Iterable[Path] = (),
        extra_http_servers: dict[str, str] | None = None,
        probe_stdio: bool = True,
        cache_seconds: float = 60.0,
    ) -> None:
        self._claude_config = claude_config
        self._project_mcp_config = project_mcp_config
        self._index_roots = [Path(root).expanduser() for root in index_roots]
        self._extra_http_servers = extra_http_servers or {}
        self._stdio_probing_enabled = probe_stdio
        self._cache_seconds = cache_seconds
        self._cache: tuple[float, dict[str, Any]] | None = None

    # ---------------------------------------------------------------- MCP --

    def discover_servers(self) -> list[McpServer]:
        """Every MCP server this machine declares, from every config that has one."""
        servers: list[McpServer] = []
        seen: set[tuple[str, str]] = set()

        def add(name: str, scope: str, config: dict[str, Any]) -> None:
            key = (name, scope)
            if key in seen or not isinstance(config, dict):
                return
            seen.add(key)
            url = config.get("url")
            transport = config.get("type") or ("http" if url else "stdio")
            servers.append(
                McpServer(
                    name=name,
                    scope=scope,
                    transport="http" if url else transport,
                    command=config.get("command"),
                    args=[str(arg) for arg in config.get("args", [])],
                    url=url,
                    env=_redact(config.get("env")),
                    headers=_redact(config.get("headers")),
                )
            )

        if self._claude_config and self._claude_config.is_file():
            try:
                data = json.loads(self._claude_config.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("forge_claude_config_unreadable", error=str(exc))
                data = {}
            for name, config in (data.get("mcpServers") or {}).items():
                add(name, "user", config)
            for project, entry in (data.get("projects") or {}).items():
                for name, config in ((entry or {}).get("mcpServers") or {}).items():
                    add(name, Path(project).name or project, config)

        if self._project_mcp_config and self._project_mcp_config.is_file():
            try:
                data = json.loads(self._project_mcp_config.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                data = {}
            for name, config in (data.get("mcpServers") or {}).items():
                add(name, "this repo", config)

        for name, url in self._extra_http_servers.items():
            add(name, "this service", {"url": url, "type": "http"})

        return sorted(servers, key=lambda server: (server.name, server.scope))

    async def _probe_http(self, server: McpServer) -> None:
        payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(server.url, json=payload, headers=headers)
        response.raise_for_status()
        body = response.text.strip()
        # A streamable-HTTP server may answer as SSE even for a single result.
        if body.startswith(("event:", "data:")):
            for line in body.splitlines():
                if line.startswith("data:"):
                    body = line[5:].strip()
                    break
        server.tools = _tool_summaries(json.loads(body))

    async def _probe_stdio(self, server: McpServer) -> None:
        """Run the documented stdio handshake and read the tool list back.

        This starts the same process an MCP client starts. Only servers already
        declared in the machine's own config files are ever launched -- a caller
        cannot name one -- and the exchange is bounded by a timeout, so a server
        that never answers cannot hold the request open. It is still the one
        part of this service that runs another program, which is why
        FORGE_PROBE_STDIO exists to turn it off on a shared host.
        """
        if not server.command:
            raise ForgeInventoryError("no command declared")
        env = dict(os.environ)
        # Redacted values must never be handed back as if they were real.
        env.update({k: v for k, v in (server.env or {}).items() if v != _REDACTED})

        process = await asyncio.create_subprocess_exec(
            server.command,
            *server.args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=env,
        )
        try:
            requests = (
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "dev-music-service-forge", "version": "1"},
                    },
                },
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
                {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            )
            process.stdin.write(b"".join(json.dumps(r).encode() + b"\n" for r in requests))
            await process.stdin.drain()

            async def read_tools() -> list[dict[str, str]]:
                while True:
                    line = await process.stdout.readline()
                    if not line:
                        raise ForgeInventoryError("server closed without listing tools")
                    try:
                        message = json.loads(line)
                    except json.JSONDecodeError:
                        continue  # servers sometimes log to stdout
                    if message.get("id") == 2:
                        return _tool_summaries(message)

            server.tools = await asyncio.wait_for(read_tools(), timeout=12.0)
        finally:
            if process.returncode is None:
                process.kill()
            await process.wait()

    async def probe(self, server: McpServer) -> McpServer:
        try:
            if server.transport == "http":
                await self._probe_http(server)
            elif self._stdio_probing_enabled:
                await self._probe_stdio(server)
            else:
                server.status = "declared"
                server.detail = "stdio probing is disabled"
                return server
            server.status = "ok"
        except asyncio.TimeoutError:
            server.status = "timeout"
            server.detail = "no tool list within the timeout"
        except Exception as exc:  # noqa: BLE001 - reported to the surface, not raised
            server.status = "error"
            server.detail = str(exc)[:200]
        return server

    # ------------------------------------------------------------ indexes --

    def _describe_index(self, path: Path) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "name": path.stem,
            "path": str(path),
            "sizeBytes": path.stat().st_size,
            "tables": [],
            "status": "ok",
        }
        try:
            # Read-only, so a live indexer's database is never touched.
            connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2.0)
        except sqlite3.Error as exc:
            entry["status"] = "unreadable"
            entry["detail"] = str(exc)[:120]
            entry["tableCount"] = 0
            entry["rowTotal"] = 0
            return entry

        try:
            names = [
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
            ]
            for name in names:
                steps = {"n": 0}

                def guard() -> int:
                    steps["n"] += 1
                    return 1 if steps["n"] > _COUNT_STEP_BUDGET else 0

                connection.set_progress_handler(guard, 1000)
                try:
                    # `name` comes from this database's own sqlite_master, not
                    # from a request, and the connection is mode=ro. Double the
                    # embedded quotes anyway so a table named with one cannot
                    # end the identifier early.
                    quoted = name.replace('"', '""')
                    rows = connection.execute(f'SELECT COUNT(*) FROM "{quoted}"').fetchone()[0]  # nosec B608
                except sqlite3.Error:
                    rows = None  # too big to count inside the budget
                finally:
                    connection.set_progress_handler(None, 0)
                entry["tables"].append({"name": name, "rows": rows})
        except sqlite3.Error as exc:
            entry["status"] = "partial"
            entry["detail"] = str(exc)[:120]
        finally:
            connection.close()

        entry["tableCount"] = len(entry["tables"])
        entry["rowTotal"] = sum(table["rows"] or 0 for table in entry["tables"])
        return entry

    def discover_indexes(self) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        for root in self._index_roots:
            if not root.exists():
                continue
            candidates = [root] if root.is_file() else sorted(root.rglob("*.db"))
            for path in candidates:
                if any(part in _SKIP_DIRS for part in path.parts) or not path.is_file():
                    continue
                try:
                    found.append({**self._describe_index(path), "root": str(root)})
                except OSError as exc:
                    logger.warning("forge_index_unreadable", path=str(path), error=str(exc))
        return sorted(found, key=lambda item: -item["sizeBytes"])

    # -------------------------------------------------------------- public --

    async def inventory(self, *, refresh: bool = False) -> dict[str, Any]:
        now = time.monotonic()
        if not refresh and self._cache and now - self._cache[0] < self._cache_seconds:
            return self._cache[1]

        servers = self.discover_servers()
        probed = await asyncio.gather(*(self.probe(server) for server in servers))
        payload: dict[str, Any] = {
            "servers": [server.public() for server in probed],
            "indexes": self.discover_indexes(),
            "generatedAt": time.time(),
        }
        payload["toolTotal"] = sum(server["toolCount"] for server in payload["servers"])
        payload["indexRowTotal"] = sum(index.get("rowTotal", 0) for index in payload["indexes"])
        self._cache = (now, payload)
        return payload


def _tool_summaries(message: dict[str, Any]) -> list[dict[str, str]]:
    """Pull `[{name, description}]` out of an MCP tools/list result."""
    if "error" in message:
        detail = message["error"]
        raise ForgeInventoryError(
            detail.get("message", "tools/list failed")
            if isinstance(detail, dict)
            else "tools/list failed"
        )
    tools = (message.get("result") or {}).get("tools")
    if not isinstance(tools, list):
        raise ForgeInventoryError("no tool list in response")
    return [
        {
            "name": str(tool.get("name", "")),
            "description": str(tool.get("description", "") or "").split("\n")[0][:180],
        }
        for tool in tools
        if isinstance(tool, dict)
    ]
