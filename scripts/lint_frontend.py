"""Lightweight lint checks for framework-free frontend assets.

The shell loads its scripts with plain tags and a `?v=` cache-busting stamp, so
a renamed or mistyped asset fails silently in the browser rather than at build
time. These checks resolve every local reference in index.html against the
files on disk to catch that before it ships.
"""
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"
INDEX = STATIC_DIR / "index.html"
GALLERY_DIR = STATIC_DIR / "gallery"

# src="..." / href="..." pointing at our own /static tree.
LOCAL_REF = re.compile(r'(?:src|href)="(/static/[^"]+)"')

# Any same-origin src the shell frames, including routes outside /static.
FRAMED_REF = re.compile(r'<iframe[^>]*\ssrc="(/[^"]*)"')


def fail(message: str) -> None:
    print(f"frontend lint: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not INDEX.is_file():
        fail(f"missing {INDEX.relative_to(ROOT)}")
    index_html = INDEX.read_text(encoding="utf-8")
    if not index_html.strip():
        fail(f"{INDEX.relative_to(ROOT)} is empty")

    references = LOCAL_REF.findall(index_html)
    if not references:
        fail("index.html references no local /static assets")

    for reference in references:
        # Strip the cache-busting stamp before resolving to a path.
        path = ROOT / reference.split("?", 1)[0].lstrip("/")
        if not path.is_file():
            fail(f"index.html references {reference}, which does not exist")

    gallery_scripts = sorted(GALLERY_DIR.glob("*.js"))
    if not gallery_scripts:
        fail("no gallery scripts found under static/gallery/")

    for script in gallery_scripts:
        source = script.read_text(encoding="utf-8")
        name = script.relative_to(ROOT)
        if "document.write" in source:
            fail(f"{name} uses document.write")
        if "eval(" in source:
            fail(f"{name} uses eval")

    check_framed_routes(index_html)
    check_plugin_surfaces()


def check_framed_routes(index_html: str) -> None:
    """Every route the shell frames must be served once deployed.

    The plugin surfaces are framed by route rather than by file --
    `/canvas?surface=editor` -- because the surface name has to survive in the
    query string. FastAPI serves those paths directly, so they resolve in local
    development whether or not the CDN knows about them; the mismatch only
    appears in production. Requiring a matching rewrite here keeps a route the
    shell depends on from 404ing after deploy.
    """
    vercel_config = ROOT / "vercel.ts"
    if not vercel_config.is_file():
        return

    declared = set(re.findall(r'routes\.rewrite\(\s*"([^"]+)"', vercel_config.read_text(encoding="utf-8")))

    for reference in set(FRAMED_REF.findall(index_html)):
        route = reference.split("?", 1)[0]
        if route.startswith("/static/"):
            continue
        if (ROOT / route.lstrip("/")).is_file():
            continue
        if route not in declared:
            fail(
                f"index.html frames {reference}, but vercel.ts declares no rewrite for {route} "
                f"— it will 404 once deployed"
            )


def check_plugin_surfaces() -> None:
    """Vendored Base44 surfaces must not carry their standalone scaffolding.

    An export is built to be hosted on its own, so its index.html pulls a
    favicon from base44.com and links a manifest at the origin root that 404s
    here. `npm run sanitize:plugins` strips both; this keeps a re-vendored
    surface from quietly putting them back.
    """
    for index in sorted(STATIC_DIR.glob("*/index.html")):
        surface = index.parent.name
        html = index.read_text(encoding="utf-8")
        if "base44.com" in html:
            fail(f"{surface}/index.html still loads from base44.com — run npm run sanitize:plugins")
        if 'rel="manifest"' in html:
            fail(f"{surface}/index.html links a manifest that 404s — run npm run sanitize:plugins")
        if "app-logs" in html:
            fail(f"{surface}/index.html still carries the Base44 beacon — run npm run sanitize:plugins")


if __name__ == "__main__":
    main()
