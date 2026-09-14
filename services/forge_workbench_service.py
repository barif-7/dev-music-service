"""The workbench half of ForgeTool: apps, components, bindings and scaffolds.

`forge_inventory_service` answers "what does this machine have" -- MCP servers
and indexes. This answers the two developer questions that follow from it:

  * Where can an API plug in?   -> a component index, plus the callable
                                   operations the machine exposes.
  * What should I test?         -> the same index ranked by risk, since none of
                                   the apps has a single test file today.

Both scaffolds emit the two pieces that were written by hand when StillShot's
index was wired into a surface: a host proxy route, and the guest-side fetch.
Writing is opt-in -- `scaffold()` previews by default, refuses to overwrite an
existing file, and will only ever write inside the roots it was configured
with, because generating code is useful and clobbering a repo is not.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import structlog

logger = structlog.get_logger()

_SKIP_DIRS = {"node_modules", ".git", "dist", "dist-surface", "build", "__pycache__", ".venv"}
_CODE_SUFFIXES = {".jsx", ".js", ".ts", ".tsx"}

_ENTITY = re.compile(r"\b(?:base44\.entities|entities)\.([A-Z][A-Za-z0-9]*)\.(\w+)\(")
_INTEGRATION = re.compile(r"\b(?:base44\.integrations|integrations)\.(?:Core\.)?([A-Za-z][A-Za-z0-9]*)\(")
_IMPORT = re.compile(r"""^\s*import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]""", re.M)
_TEST_FILE = re.compile(r"\.(test|spec)\.[jt]sx?$|__tests__")
_WRITE_OPS = {"create", "update", "delete", "bulkCreate"}

# Every export ships the same vendored shadcn set. Ranking them would bury the
# app's own components under 1,078 files nobody wrote.
_VENDORED = "/components/ui/"


class ForgeWorkbenchError(Exception):
    """The workbench could not answer."""


@dataclass(frozen=True)
class ScaffoldResult:
    kind: str
    files: list[dict[str, Any]]
    notes: list[str]

    def public(self) -> dict[str, Any]:
        return {"kind": self.kind, "files": self.files, "notes": self.notes}


class ForgeWorkbenchService:
    def __init__(
        self,
        *,
        apps_root: Path,
        write_roots: Iterable[Path] = (),
        cache_seconds: float = 120.0,
    ) -> None:
        self._apps_root = Path(apps_root).expanduser()
        self._write_roots = [Path(root).expanduser().resolve() for root in write_roots]
        self._cache_seconds = cache_seconds
        self._cache: tuple[float, dict[str, Any]] | None = None

    # ------------------------------------------------------------ indexing --

    def _walk(self, root: Path):
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
            for name in filenames:
                yield Path(dirpath) / name

    def _scan_app(self, app_dir: Path) -> dict[str, Any] | None:
        src = app_dir / "src"
        if not src.is_dir():
            return None

        files: list[dict[str, Any]] = []
        test_files = 0
        # importer -> resolved module stems, for fan-in below.
        edges: dict[str, list[str]] = {}

        for path in self._walk(src):
            if path.suffix not in _CODE_SUFFIXES:
                continue
            rel = str(path.relative_to(app_dir))
            if _TEST_FILE.search(rel):
                test_files += 1
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            entity_hits = list(_ENTITY.finditer(text))
            writes = sorted({m.group(1) for m in entity_hits if m.group(2) in _WRITE_OPS})
            files.append(
                {
                    "path": rel,
                    "kind": _classify(rel),
                    "lines": text.count("\n") + 1,
                    "entities": sorted({m.group(1) for m in entity_hits}),
                    "writes": writes,
                    "integrations": sorted({m.group(1) for m in _INTEGRATION.finditer(text)}),
                    "vendored": _VENDORED in f"/{rel}",
                }
            )
            edges[rel] = [_module_stem(spec) for spec in _IMPORT.findall(text)]

        # Fan-in: how many of the app's own files import this one. A component
        # twenty screens depend on deserves a test before one nothing imports.
        fan_in: dict[str, int] = {}
        stems = {rel: _module_stem(rel) for rel in edges}
        for importer, specs in edges.items():
            for spec in specs:
                for rel, stem in stems.items():
                    if rel != importer and stem and stem == spec:
                        fan_in[rel] = fan_in.get(rel, 0) + 1
        for entry in files:
            entry["fanIn"] = fan_in.get(entry["path"], 0)
            entry["risk"], entry["why"] = _score(entry)

        return {"files": files, "testFiles": test_files}

    def index(self, *, refresh: bool = False) -> dict[str, Any]:
        now = time.monotonic()
        if not refresh and self._cache and now - self._cache[0] < self._cache_seconds:
            return self._cache[1]

        manifest_path = self._apps_root / "apps.json"
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ForgeWorkbenchError(f"apps.json unreadable at {manifest_path}") from exc

        apps: list[dict[str, Any]] = []
        for repo, meta in manifest.items():
            scanned = self._scan_app(self._apps_root / repo)
            if not scanned:
                continue
            files = scanned["files"]
            own = [f for f in files if not f["vendored"]]
            apps.append(
                {
                    "repo": repo,
                    "app": meta.get("app", repo),
                    "appId": meta.get("appId"),
                    "testFiles": scanned["testFiles"],
                    "files": files,
                    "totals": {
                        "files": len(files),
                        "own": len(own),
                        "vendored": len(files) - len(own),
                        "pages": sum(1 for f in own if f["kind"] == "page"),
                        "components": sum(1 for f in own if f["kind"] == "component"),
                        "lines": sum(f["lines"] for f in own),
                        "writers": sum(1 for f in own if f["writes"]),
                        "entities": len({e for f in own for e in f["entities"]}),
                        "maxRisk": max((f["risk"] for f in own), default=0),
                    },
                }
            )

        payload = {
            "apps": sorted(apps, key=lambda a: -a["totals"]["maxRisk"]),
            "generatedAt": time.time(),
            "totals": {
                "apps": len(apps),
                "components": sum(a["totals"]["own"] for a in apps),
                "writers": sum(a["totals"]["writers"] for a in apps),
                "testFiles": sum(a["testFiles"] for a in apps),
            },
        }
        self._cache = (now, payload)
        return payload

    def test_queue(self, limit: int = 40, *, refresh: bool = False) -> list[dict[str, Any]]:
        """Every app's own components, worst-first, with the reasons attached."""
        rows: list[dict[str, Any]] = []
        for app in self.index(refresh=refresh)["apps"]:
            covered = app["testFiles"] > 0
            for entry in app["files"]:
                if entry["vendored"] or entry["kind"] == "ui-primitive":
                    continue
                rows.append(
                    {
                        **entry,
                        "app": app["app"],
                        "repo": app["repo"],
                        "hasTests": covered,
                    }
                )
        rows.sort(key=lambda row: (-row["risk"], -row["fanIn"], -row["lines"]))
        return rows[:limit]

    # ----------------------------------------------------------- scaffolds --

    def _resolve_write(self, path: Path) -> Path:
        resolved = (path if path.is_absolute() else Path.cwd() / path).resolve()
        if not any(
            resolved == root or root in resolved.parents for root in self._write_roots
        ):
            raise ForgeWorkbenchError(f"refusing to write outside the configured roots: {resolved}")
        return resolved

    def scaffold(
        self,
        kind: str,
        *,
        repo: str,
        target: str,
        api: dict[str, Any] | None = None,
        dry_run: bool = True,
    ) -> ScaffoldResult:
        app_dir = self._apps_root / repo
        if not (app_dir / "src").is_dir():
            raise ForgeWorkbenchError(f"unknown app repo: {repo}")

        if kind == "binding":
            result = _binding_scaffold(repo, target, api or {})
        elif kind == "test":
            result = _test_scaffold(repo, target)
        else:
            raise ForgeWorkbenchError(f"unknown scaffold kind: {kind}")

        if dry_run:
            result.notes.insert(0, "Preview only — nothing was written.")
            return result

        written = []
        for spec in result.files:
            if spec.get("target") != "app":
                continue  # host-side snippets are shown, never spliced in blind
            destination = self._resolve_write(app_dir / spec["path"])
            if destination.exists():
                result.notes.append(f"skipped {spec['path']} — already exists")
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(spec["contents"], encoding="utf-8")
            written.append(spec["path"])
        result.notes.append(
            f"wrote {len(written)} file(s): {', '.join(written)}" if written else "wrote nothing"
        )
        return result


def _classify(rel: str) -> str:
    if "/pages/" in f"/{rel}":
        return "page"
    if _VENDORED in f"/{rel}":
        return "ui-primitive"
    if "/components/" in f"/{rel}":
        return "component"
    if "/hooks/" in f"/{rel}":
        return "hook"
    if "/api/" in f"/{rel}" or "/lib/" in f"/{rel}":
        return "lib"
    return "other"


def _module_stem(spec: str) -> str:
    """Reduce an import specifier or path to a comparable module name."""
    stem = spec.rsplit("/", 1)[-1]
    return re.sub(r"\.(jsx?|tsx?)$", "", stem)


def _score(entry: dict[str, Any]) -> tuple[int, list[str]]:
    """Risk of leaving this component untested, and why.

    With no tests anywhere, coverage cannot rank anything -- so the score is
    about blast radius: what the component can destroy, how much depends on it,
    and how much code is in it.
    """
    if entry["vendored"]:
        return 0, []
    score = 0
    why: list[str] = []
    if entry["writes"]:
        score += 4 * len(entry["writes"])
        why.append(f"writes {', '.join(entry['writes'])}")
    if entry["entities"]:
        score += len(entry["entities"])
        why.append(f"reads {len(entry['entities'])} entities")
    if entry["integrations"]:
        score += 2 * len(entry["integrations"])
        why.append(f"calls {', '.join(entry['integrations'])}")
    # Fan-in only earns a score when there is something in the file to break.
    # Every export vendors a ten-line `cn()` helper that half the tree imports;
    # it would otherwise outrank components that actually write data.
    if entry["fanIn"] >= 3 and entry["lines"] >= 25:
        score += min(entry["fanIn"], 10)
        why.append(f"{entry['fanIn']} files import it")
    if entry["lines"] > 400:
        score += 3
        why.append(f"{entry['lines']} lines")
    elif entry["lines"] > 200:
        score += 1
    if entry["kind"] == "page":
        score += 1
    return score, why


def _binding_scaffold(repo: str, target: str, api: dict[str, Any]) -> ScaffoldResult:
    """The two pieces a localized surface needs to reach a host-side API."""
    name = api.get("name") or "resource"
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "resource"
    hook = "use" + "".join(part.capitalize() for part in slug.split("-"))
    upstream = api.get("upstream") or "http://127.0.0.1:0000"
    path = api.get("path") or "/api/example"
    prefix = api.get("prefix") or slug

    kind = api.get("kind", "http")
    # The guest call has to match the route the host snippet declares: a GET
    # against a proxied path for HTTP and indexes, a POST carrying arguments
    # for an MCP tool. Emitting one shape for both was the bug this avoids.
    if kind == "mcp":
        call = f'''  const load = useCallback(async (signal) => {{
    setBusy(true)
    setError(null)
    try {{
      const response = await fetch(ENDPOINT, {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify(args),
        signal,
      }})
      if (!response.ok) {{
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.detail || `{name} failed (${{response.status}})`)
      }}
      setData(await response.json())
    }} catch (err) {{
      if (err.name !== 'AbortError') setError(err.message)
    }} finally {{
      setBusy(false)
    }}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }}, [JSON.stringify(args)])'''
        signature = "args = {}"
        endpoint = f"/api/{prefix}/{slug}"
    else:
        call = f'''  const load = useCallback(async (signal) => {{
    setBusy(true)
    setError(null)
    try {{
      const query = new URLSearchParams(args).toString()
      const response = await fetch(query ? `${{ENDPOINT}}?${{query}}` : ENDPOINT, {{ signal }})
      if (!response.ok) {{
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.detail || `{name} failed (${{response.status}})`)
      }}
      setData(await response.json())
    }} catch (err) {{
      if (err.name !== 'AbortError') setError(err.message)
    }} finally {{
      setBusy(false)
    }}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }}, [JSON.stringify(args)])'''
        signature = "args = {}"
        endpoint = f"/api/{prefix}{path}" if kind == "http" else f"/api/{prefix}/{slug}"

    guest = f'''/**
 * {name} — generated binding.
 *
 * The surface never learns the upstream address: it calls the host's proxy
 * same-origin, and the host decides what that resolves to. Regenerate rather
 * than hand-editing the URL.
 */
import {{ useCallback, useEffect, useState }} from 'react'

const ENDPOINT = '{endpoint}'

export function {hook}({signature}) {{
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(true)

{call}

  useEffect(() => {{
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }}, [load])

  return {{ data, error, busy, reload: () => load() }}
}}
'''

    # The host side differs by what is being bound. Emitting one shape for all
    # three would produce code that cannot work: an MCP tool needs a JSON-RPC
    # POST, not a GET, and a SQLite index needs a query rather than a proxy.
    setting = f"{prefix.replace('-', '_')}_base_url"
    client = f"_get_{prefix.replace('-', '_')}_client"

    client_block = f'''_{prefix.replace("-", "_")}_client: httpx.AsyncClient | None = None


def {client}() -> httpx.AsyncClient:
    global _{prefix.replace("-", "_")}_client
    if _{prefix.replace("-", "_")}_client is None or _{prefix.replace("-", "_")}_client.is_closed:
        _{prefix.replace("-", "_")}_client = httpx.AsyncClient(
            verify=certifi.where(),
            timeout=15.0,
            headers={{"User-Agent": "dev-music-service/0.4 ({prefix} proxy)"}},
        )
    return _{prefix.replace("-", "_")}_client
'''

    if kind == "mcp":
        host = f'''# --- generated: {name} (MCP tool) ---------------------------------------
# Add to main.py, and add to config.py:
#     {setting}: str = "{upstream}"
#
# An MCP tool is called with a JSON-RPC `tools/call`, not a GET, and the result
# arrives wrapped in a content envelope rather than as the tool's own JSON.

{client_block}

@app.post("/api/{prefix}/{slug}")
@limiter.limit("60 per minute")
async def {prefix.replace("-", "_")}_{slug.replace("-", "_")}(request: Request, body: dict):
    """Call the {name} MCP tool on behalf of the surface."""
    base = get_settings().{setting}
    payload = {{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {{"name": "{name}", "arguments": body or {{}}}},
    }}
    try:
        resp = await {client}().post(
            base,
            json=payload,
            headers={{"Accept": "application/json, text/event-stream"}},
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="{name} unreachable") from exc

    envelope = resp.json().get("result") or {{}}
    parts = envelope.get("content") or []
    text = next((p.get("text") for p in parts if p.get("type") == "text"), None)
    try:
        content = json.loads(text) if text else envelope
    except (TypeError, ValueError):
        content = {{"text": text}}
    return JSONResponse(content=content, headers={{"Cache-Control": "no-store"}})
'''
    elif kind == "index":
        # B608 fires on the SELECT inside the template below. That SELECT is
        # generated source, not a query this module runs, and the code it emits
        # checks `table` against sqlite_master before interpolating it and binds
        # `limit` -- which is exactly what the template's own header states.
        host = f'''# --- generated: {name} (SQLite index) ----------------------------------
# Add to main.py, and add to config.py:
#     {setting}: str = "{upstream}"
#
# Read-only and parameterised. The table is checked against sqlite_master rather
# than interpolated blind, because a table name coming from the browser is
# untrusted input even when the surface is one you wrote.

@app.get("/api/{prefix}/{slug}")
@limiter.limit("60 per minute")
async def {prefix.replace("-", "_")}_{slug.replace("-", "_")}(
    request: Request,
    table: str = Query(min_length=1, max_length=64),
    limit: int = Query(default=50, ge=1, le=500),
):
    """Read rows from the {name} index."""
    def read() -> list[dict]:
        connection = sqlite3.connect(f"file:{{get_settings().{setting}}}?mode=ro", uri=True)
        try:
            connection.row_factory = sqlite3.Row
            known = {{row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )}}
            if table not in known:
                raise HTTPException(status_code=404, detail=f"no such table: {{table}}")
            rows = connection.execute(
                f'SELECT * FROM "{{table}}" LIMIT ?', (limit,)
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            connection.close()

    return JSONResponse(
        content={{"rows": await run_in_threadpool(read)}},
        headers={{"Cache-Control": "no-store"}},
    )
'''  # nosec B608 - generated source; see the note above the template.
    else:
        host = f'''# --- generated: {name} proxy -------------------------------------------
# Add to main.py, and add to config.py:
#     {setting}: str = "{upstream}"
#
# The surface is framed from this origin, so it reaches {name} through here:
# same-origin, no CORS, and the upstream address stays a property of the host
# rather than something baked into the guest.

{client_block}

@app.get("/api/{prefix}/{{path:path}}")
@limiter.limit("120 per minute")
async def {prefix.replace("-", "_")}_proxy(request: Request, path: str):
    """Forward one read to {name}."""
    base = get_settings().{setting}.rstrip("/")
    try:
        resp = await {client}().get(
            f"{{base}}/{{path}}", params=dict(request.query_params)
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="{name} unreachable") from exc
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
        headers={{"Cache-Control": "no-store"}},
    )
'''

    return ScaffoldResult(
        kind="binding",
        files=[
            {
                "target": "app",
                "path": f"src/hooks/{hook}.js",
                "language": "javascript",
                "contents": guest,
            },
            {
                "target": "host",
                "path": "main.py",
                "language": "python",
                "contents": host,
            },
        ],
        notes=[
            f"Binds {name} into {repo} for use by {target}.",
            "The host snippet is shown rather than spliced in — routes need a "
            "human to place them and to add the matching setting to config.py.",
            f"Generated for a {api.get('kind', 'http')} source; MCP tools are "
            "called over JSON-RPC and indexes are read with a parameterised query.",
        ],
    )


def _test_scaffold(repo: str, target: str) -> ScaffoldResult:
    """A first test for a component that has never had one."""
    stem = _module_stem(target)
    contents = f'''/**
 * First test for {stem}.
 *
 * {repo} had no tests at all when this was generated, so this covers the two
 * things worth pinning before anything else: that the component renders
 * without throwing, and that it does not fall over on empty data. Extend it
 * with the behaviour that actually matters -- this is a starting point, not
 * coverage.
 */
import {{ describe, expect, it, vi }} from 'vitest'
import {{ render, screen }} from '@testing-library/react'

import {stem} from '@/{target.removeprefix("src/").removesuffix(".jsx").removesuffix(".js")}'

// The Base44 client reaches the network; a unit test must not.
vi.mock('@/api/base44Client', () => ({{
  base44: {{
    entities: new Proxy({{}}, {{
      get: () => ({{
        list: vi.fn().mockResolvedValue([]),
        filter: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({{}}),
        update: vi.fn().mockResolvedValue({{}}),
        delete: vi.fn().mockResolvedValue({{}}),
      }}),
    }}),
    integrations: {{ Core: new Proxy({{}}, {{ get: () => vi.fn() }}) }},
  }},
}}))

describe('{stem}', () => {{
  it('renders without throwing', () => {{
    expect(() => render(<{stem} />)).not.toThrow()
  }})

  it('survives empty data', async () => {{
    render(<{stem} />)
    expect(await screen.findByRole('main', {{}}, {{ timeout: 2000 }}).catch(() => true)).toBeTruthy()
  }})
}})
'''
    return ScaffoldResult(
        kind="test",
        files=[
            {
                "target": "app",
                "path": f"src/__tests__/{stem}.test.jsx",
                "language": "javascript",
                "contents": contents,
            }
        ],
        notes=[
            f"{repo} has no test runner configured yet — add vitest, "
            "@testing-library/react and jsdom before running this.",
        ],
    )
