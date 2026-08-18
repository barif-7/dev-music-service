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


if __name__ == "__main__":
    main()
