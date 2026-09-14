import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "static" / "gallery" / "plugins.json"
REMAINING_SURFACES = {
    "floatdesk": "reactions",
    "tuneshere": "library",
    "flowstate": "today",
    "flowschedule": "agenda",
    "tasks": "board",
    "digma": "components",
    "orbitjobs": "pipeline",
    "passportlog": "map",
    "chronicle": "collection",
    "radiant": "archive",
    "resolutions": "resolutions",
    "seth": "session",
}


def test_every_catalogued_app_is_wired():
    catalog = json.loads(CATALOG_PATH.read_text())

    assert catalog["plugins"]
    assert all(plugin["state"] == "wired" for plugin in catalog["plugins"])
    assert {
        plugin["id"]: plugin["surface"]
        for plugin in catalog["plugins"]
        if plugin["id"] in REMAINING_SURFACES
    } == REMAINING_SURFACES


def test_remaining_surface_routes_serve_sanitized_bundles(client):
    for plugin_id, surface in REMAINING_SURFACES.items():
        response = client.get(f"/{plugin_id}?surface={surface}")

        assert response.status_code == 200, plugin_id
        assert response.headers["x-frame-options"] == "SAMEORIGIN"
        assert f'/static/{plugin_id}/assets/' in response.text
        assert "base44.com" not in response.text
        assert 'rel="manifest"' not in response.text
        assert "app-logs" not in response.text


def test_remaining_bundles_are_surface_only():
    for plugin_id in REMAINING_SURFACES:
        asset_dir = ROOT / "static" / plugin_id / "assets"
        scripts = list(asset_dir.glob("*.js"))

        assert scripts, plugin_id
        assert not any(re.match(r"App-.*\.js$", path.name) for path in scripts)
        source = "\n".join(path.read_text() for path in scripts)
        assert "window.parent.postMessage" in source, plugin_id
        assert "base44.auth" not in source, plugin_id
        assert "localStorage" not in source, plugin_id
