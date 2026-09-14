import json
from pathlib import Path


def test_pika_voice_profile_is_absent_by_default(client, monkeypatch):
    monkeypatch.setenv("PIKA_VOICE_PROFILE_ENABLED", "false")

    config = client.get("/api/vocals/config")
    surface = client.get("/semi?surface=voice-profile")

    assert config.status_code == 200
    assert config.json()["pika_voice_profile"] == {
        "enabled": False,
        "stage": "under_development",
        "scope": "shared",
    }
    assert surface.status_code == 404
    assert surface.headers["x-frame-options"] == "SAMEORIGIN"
    assert "under development" in surface.json()["detail"].lower()


def test_pika_voice_profile_is_a_lazy_base44_plugin(client, monkeypatch):
    monkeypatch.setenv("PIKA_VOICE_PROFILE_ENABLED", "true")

    surface = client.get("/semi?surface=voice-profile")
    assert surface.status_code == 200
    assert surface.headers["x-frame-options"] == "SAMEORIGIN"

    repo = Path(__file__).resolve().parents[1]
    shell = (repo / "static/index.html").read_text()
    host = (repo / "static/gallery/semi-plugin.js").read_text()

    assert 'id="pikaVoiceProfileBtn"' in shell
    assert 'data-label="Voice profile · under development"' in shell
    assert 'data-src="/semi?surface=voice-profile"' in shell
    assert 'id="pikaVoiceProfilePanel"' in shell
    assert "config?.pika_voice_profile?.enabled" in host
    assert "Base44AppPlugin.create" in host
    assert "PluginDock.register" in host
    assert "frame.setAttribute('src', frame.dataset.src)" in host
    assert not list((repo / "static/semi/assets").glob("App-*.js"))


def test_plugin_scene_is_identity_free_and_host_owned():
    repo = Path(__file__).resolve().parents[1]
    host = (repo / "static/gallery/semi-plugin.js").read_text()
    vocal_client = (repo / "static/gallery/service.js").read_text()

    assert "voice_profile_id" not in host
    assert "voice_consent_token" not in host
    assert "translatedVocalVoiceProfileId" not in vocal_client
    assert "translatedVocalVoiceConsentToken" not in vocal_client
    assert "translatedVocalVoiceMode" not in vocal_client

    semi_repo = repo.parent / "Documents/GitHub/base44-apps/base44-repo-semi"
    if semi_repo.is_dir():
        surface = (semi_repo / "src/pages/VoiceProfileSurface.jsx").read_text()
        bridge = (semi_repo / "src/lib/base44/hostSurface.js").read_text()
        main = (semi_repo / "src/main.jsx").read_text()
        assert "localStorage" not in surface
        assert "@/lib/AuthContext" not in surface
        assert "window.parent.postMessage" in bridge
        assert "localizedVoiceProfileBuild || requestedSurface === 'voice-profile'" in main


def test_production_build_excludes_pre_release_bundle_without_flag():
    repo = Path(__file__).resolve().parents[1]
    build = (repo / "scripts/build-vercel-frontend.mjs").read_text()
    vercel = (repo / "vercel.ts").read_text()

    assert 'process.env.PIKA_VOICE_PROFILE_ENABLED === "true"' in build
    assert 'join(outDir, "static", "semi")' in build
    assert 'process.env.PIKA_VOICE_PROFILE_ENABLED === "true"' in vercel

    # The surface rewrites are generated from the plugin catalogue rather than
    # written out one literal at a time, so the gate that used to be visible as
    # a conditional `routes.rewrite("/semi", ...)` now lives in two places: the
    # filter that drops flagged surfaces, and the catalogue entry that marks
    # Semi as one. Both have to hold for the bundle to stay out of production.
    assert 'plugin.flag === "pika_voice_profile_enabled"' in vercel
    # One catalogue entry may alias another's bundle (canvas-full serves the
    # canvas build), so the destination is the served directory, not the id.
    assert '`/static/${plugin.serves ?? plugin.id}/index.html`' in vercel

    catalog = json.loads((repo / "static/gallery/plugins.json").read_text())
    semi = next(entry for entry in catalog["plugins"] if entry["id"] == "semi")
    assert semi["flag"] == "pika_voice_profile_enabled"
