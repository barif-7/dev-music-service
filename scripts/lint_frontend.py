"""Lightweight lint checks for framework-free frontend assets."""
from pathlib import Path
import sys


STATIC_DIR = Path("static")
INDEX = STATIC_DIR / "index.html"
STYLES = STATIC_DIR / "styles.css"
APP = STATIC_DIR / "app.js"


def fail(message: str) -> None:
    print(f"frontend lint: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (INDEX, STYLES, APP):
        if not path.is_file():
            fail(f"missing {path}")
        if not path.read_text(encoding="utf-8").strip():
            fail(f"{path} is empty")

    index_html = INDEX.read_text(encoding="utf-8")
    if 'href="/static/styles.css"' not in index_html:
        fail("index.html does not reference /static/styles.css")
    if 'src="/static/app.js"' not in index_html:
        fail("index.html does not reference /static/app.js")
    if "<style" in index_html.lower():
        fail("index.html still contains inline style blocks")

    js = APP.read_text(encoding="utf-8")
    if "document.write" in js:
        fail("app.js uses document.write")
    if "eval(" in js:
        fail("app.js uses eval")

    css = STYLES.read_text(encoding="utf-8")
    if ":root" not in css:
        fail("styles.css is missing root design tokens")


if __name__ == "__main__":
    main()
