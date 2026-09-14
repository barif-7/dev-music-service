"""Localized Base44 plugin catalogue.

`static/gallery/plugins.json` is the single source of truth for which surfaces
exist, what each is called and where its checkout lives. The shell's apps
launcher reads it over HTTP and `scripts/build-surface.mjs` reads it from disk;
this module is the Python view of the same file, so a new plugin needs a
catalogue entry rather than another hand-written route.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

CATALOG_PATH = Path(__file__).parent / "static" / "gallery" / "plugins.json"


@dataclass(frozen=True)
class Plugin:
    id: str
    name: str
    surface: str
    state: str
    blurb: str = ""
    repo: Optional[str] = None
    # The app's bucket in the Base44 export index. Distinct from `repo`, which
    # says where the surface is *built* from: Canvas builds from its own
    # checkout and Lyric Shader Lab from in-tree source, while both were still
    # exported from Base44 under a base44-repo-* name.
    base44_repo: Optional[str] = None
    host: str = "generic"
    flag: Optional[str] = None
    # Directory under static/ holding the build. Defaults to the id; set it when
    # two entries share one bundle that resolves the surface from the query.
    serves: Optional[str] = None

    @property
    def route(self) -> str:
        """The path the shell frames this surface at."""
        return f"/{self.id}"

    @property
    def index_name(self) -> str:
        """Directory under static/ holding the vendored build."""
        return self.serves or self.id

    @property
    def build_command(self) -> str:
        """What to tell the operator when the build is missing.

        The three original surfaces keep their dedicated npm scripts; anything
        added through the catalogue is built by the generic script.
        """
        if self.host == "bespoke":
            return f"npm run build:{self.id}"
        return f"node scripts/build-surface.mjs {self.id}"


@lru_cache(maxsize=1)
def load_catalog() -> tuple[Plugin, ...]:
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return tuple(
        Plugin(
            id=entry["id"],
            name=entry["name"],
            surface=entry["surface"],
            state=entry.get("state", "planned"),
            blurb=entry.get("blurb", ""),
            repo=entry.get("repo"),
            base44_repo=entry.get("base44Repo") or entry.get("repo"),
            host=entry.get("host", "generic"),
            flag=entry.get("flag"),
            serves=entry.get("serves"),
        )
        for entry in raw["plugins"]
    )


@lru_cache(maxsize=1)
def export_root() -> Optional[Path]:
    """Where the Base44 exports live, per the catalogue's own `repoRoot`.

    A developer-machine path. Absent on a hosted deploy, where every surface is
    simply a bundle with no export index behind it.
    """
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    root = raw.get("repoRoot")
    return Path(root).expanduser() if isinstance(root, str) else None


def is_frameable(path: str) -> bool:
    """Whether the shell may frame this path.

    A surface that runs a router is framed at paths beneath its own -- the
    Canvas graph is /canvas-full/graph -- and those have to be allowed too. An
    exact-match set silently DENYs them, and the panel comes up as a broken
    document with no error anywhere, which is how the solar clock once shipped.
    """
    if path in frameable_paths():
        return True
    return any(path.startswith(f"{plugin.route}/") for plugin in load_catalog())


def frameable_paths() -> set[str]:
    """Paths the shell is allowed to frame, as X-Frame-Options: SAMEORIGIN.

    A surface missing from this set comes up empty in Chrome and as a security
    interstitial in Firefox, which is how the solar clock was once broken.
    """
    paths = {plugin.route for plugin in load_catalog()}
    paths.add("/static/clock/index.html")
    return paths
