"""The Base44 export index: which local surface is which exported app.

The plugin catalogue says what this shell serves; `apps.json` in the export
folder is Base44's own record of what each export is -- its app name and,
importantly, its **app id**. Joining the two ties a running surface to the
components that were exported from it.

The app id is the join key rather than the app name. Sibling copies of one app
carry the same name and different ids, so matching on the name merges their
components into a single list -- exactly the duplication the picker exists to
avoid. OrbitJobs is the case that proves it: two exports, one name.

`apps.json` does not exist on a hosted deploy. Everything here degrades to "no
Base44 identity", which leaves a surface mounted and simply without a store.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

from plugin_catalog import Plugin, export_root, load_catalog


@dataclass(frozen=True)
class Base44App:
    plugin: Plugin
    app_name: str
    app_id: str
    repo: str
    account: str


@lru_cache(maxsize=1)
def _exports() -> dict:
    root = export_root()
    if root is None:
        return {}
    try:
        raw = json.loads((root / "apps.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return raw if isinstance(raw, dict) else {}


@lru_cache(maxsize=1)
def load() -> tuple[Base44App, ...]:
    """Every catalogued surface that resolves to a Base44 export.

    A surface behind an unset feature flag is left out: its route 404s, so
    offering it as somewhere to browse would be offering a dead end.
    """
    exports = _exports()
    found = []
    for plugin in load_catalog():
        if plugin.flag or not plugin.base44_repo:
            continue
        meta = exports.get(plugin.base44_repo)
        if not isinstance(meta, dict) or not isinstance(meta.get("appId"), str):
            continue
        found.append(Base44App(
            plugin=plugin, app_name=meta.get("app") or plugin.name,
            app_id=meta["appId"], repo=plugin.base44_repo,
            account=meta.get("account", "")))
    return tuple(found)


def by_plugin_id(plugin_id: str) -> Base44App | None:
    return next((app for app in load() if app.plugin.id == plugin_id), None)


def buckets_for(repo: str, projects) -> list[str]:
    """The vault projects holding one export's components.

    A single export can have been ingested more than once and each ingest is
    its own project, suffixed with where it came from -- `--apps`, `--github`,
    `--desktop`. They are the same app, so all of them count; a different repo
    that merely starts with the same characters does not, which is why the
    suffix has to be the separator rather than a bare prefix test.
    """
    return sorted(p for p in projects if p == repo or p.startswith(f"{repo}--"))
