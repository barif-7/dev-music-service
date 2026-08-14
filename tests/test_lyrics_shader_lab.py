import re
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from models import LyricVisualAnalysisRequest
from services.lyric_visual_service import LyricVisualService


def test_embedded_lab_entrypoint_is_served(client: TestClient):
    response = client.get("/lyrics-shader-lab")

    assert response.status_code == 200
    assert "Lyrics Shader Lab · Phase" in response.text
    assert "/static/lyrics-shader-lab/assets/" in response.text
    assert response.headers["x-frame-options"] == "SAMEORIGIN"


def test_phase_shell_uses_lab_as_the_primary_center_lyrics_reader(client: TestClient):
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["x-frame-options"] == "DENY"
    assert 'id="lyricsShaderReaderFrame"' in response.text
    assert 'src="/lyrics-shader-lab?surface=reader"' in response.text
    assert 'allowtransparency="true"' in response.text
    assert 'style="background:transparent"' in response.text
    assert 'id="lyricLanguageBar"' in response.text
    assert response.text.index('id="lyricLanguageBar"') < response.text.index('id="lyricReader"')
    assert '/static/gallery/lyrics-shader-reader.js' in response.text
    assert 'id="lyricsShaderLabModal"' not in response.text
    assert 'id="lyricsShaderLabLink"' not in response.text

    assert "/static/gallery/base44-plugin.js" in response.text
    assert "/static/gallery/reader-preferences.js" in response.text

    bridge = client.get("/static/gallery/lyrics-shader-reader.js")
    assert bridge.status_code == 200
    assert "Base44AppPlugin.create" in bridge.text
    assert "Wallpaper.subscribe" in bridge.text
    assert "const paper = wallpaper();" in bridge.text
    assert "wallpaper:paper," in bridge.text
    assert "translationLocale" in bridge.text
    # The reader reports requests as named intents; the shell decides.
    for handler in ("seek(", "rate(", "translate(", "view(", "background(", "preference("):
        assert handler in bridge.text

    # Shell-owned styling that the surface used to drive from inside the frame.
    prefs = client.get("/static/gallery/reader-preferences.js")
    assert prefs.status_code == 200
    assert "phaseField.lyricReaderPreferences" in prefs.text
    assert "phaseField.lyricReaderBackground" in prefs.text
    assert "background-hidden" in prefs.text
    assert "reader-text-only" in prefs.text
    assert "reader-share-sheet" in prefs.text
    assert "lyrics-share-sheet" in prefs.text
    assert "lyrics-spectrum-hidden" in prefs.text
    assert "layout:'stacked'" in prefs.text

    # Palette maths has exactly one implementation, shared by both sides.
    palette = client.get("/static/gallery/wallpaper-palette.js")
    assert palette.status_code == 200
    assert "soften(" in palette.text
    assert "gradient(" in palette.text


def test_reader_composites_the_animated_shader_over_the_wallpaper():
    repo = Path(__file__).resolve().parents[1]
    shell = (repo / "static/index.html").read_text()
    reader = (repo / "lyrics-shader-lab/src/pages/LyricsReaderSurface.jsx").read_text()
    panel = (repo / "lyrics-shader-lab/src/components/shader-lab/VisualizerPanel.jsx").read_text()
    bilingual_reader = (repo / "lyrics-shader-lab/src/components/bilingual/BilingualReader.jsx").read_text()
    bilingual_timeline = (repo / "lyrics-shader-lab/src/components/bilingual/BilingualTimeline.jsx").read_text()
    localizer_provider = (repo / "lyrics-shader-lab/src/lib/bilingual/captionLocalizerProvider.js").read_text()
    options = (repo / "lyrics-shader-lab/src/components/shader-lab/ReaderOptions.jsx").read_text()
    word_timing = (repo / "lyrics-shader-lab/src/lib/bilingual/wordTiming.js").read_text()
    styles = (repo / "lyrics-shader-lab/src/index.css").read_text()
    preferences = (repo / "static/gallery/reader-preferences.js").read_text()

    assert 'backgroundMode="wallpaper"' in reader
    assert 'backgroundMode="passthrough"' not in reader
    assert "reader-wallpaper-canvas" in panel
    assert "reader-visualizer-window" in panel
    assert 'data-reader-view={wallpaperComposite ? "visual" : undefined}' in panel
    assert "BilingualTimeline" in reader
    assert 'data-reader-view="timeline"' in bilingual_timeline
    assert "reader-timeline-window" in bilingual_timeline
    assert "reader-glass-surface relative h-screen overflow-visible text-white" in reader
    assert "reader-shape-${prefs.windowShape}" in reader
    assert "ReaderOptions" in reader
    assert "LearnControls" in reader
    assert '{ id: "learn"' in reader
    assert 'intent("view", { view: id })' in reader
    assert "VocabularyCard" in reader
    assert "LiveAnnouncer" in reader
    assert "min-h-11" in reader
    assert 'aria-haspopup="dialog"' in reader
    assert 'style={{ "--reader-soft-gradient": scene.gradient }}' in reader
    assert "Hide lyric window background" in reader
    assert "Show lyric window background" in reader
    assert 'backgroundVisible={prefs.windowAppearance === "textOnly" ? false : backgroundVisible}' in reader

    # The surface is a view: it derives nothing and owns no persistence.
    assert "localStorage" not in reader
    assert "phaseField." not in reader
    assert "getActiveLyricIndex" not in reader
    assert "analyzeLyricLocal" not in reader
    assert "shaderRecordToPreset" not in reader
    assert "getDefaultUniforms" not in reader
    assert "data-reader-chrome" in reader
    assert 'reader-timeline-window flex h-full flex-col border border-white/10 bg-black/35' not in bilingual_timeline
    assert ".reader-timeline-window" in styles
    assert "--reader-soft-gradient" in styles
    assert ".reader-timeline-window.reader-background-hidden" in styles
    assert ".reader-glass-surface.reader-shape-circle" in styles
    assert ".reader-glass-surface.reader-shape-square" in styles
    assert ".reader-reduced-motion" in styles
    assert ".reader-glass-surface.reader-background-hidden [data-reader-chrome]" in styles
    assert "linear-gradient(145deg, #101a1b, #11100f)" in styles
    assert "opacity: 1" in styles
    assert ".reader-glass-surface" in styles
    assert "background: transparent" in styles
    assert "border-radius: 28px" in styles
    assert "padding:0;overflow:visible" in shell
    assert "padding:0;overflow:visible;border:0" in shell
    assert "border-radius:28px" in shell
    assert "box-shadow:inset 0 1px 0 rgba(255,255,255,.1)" not in shell
    assert "corner-shape:squircle;\n    background:transparent;" in shell
    assert "background-hidden{background:transparent!important;box-shadow:none}" in shell
    assert "border-radius:inherit" in shell
    assert "background-hidden #lyricsShaderReaderFrame" in shell
    assert "--lyrics-reader-soft-gradient" in shell
    assert "reader-shape-circle" in shell
    assert "reader-shape-square" in shell
    assert "#lyricReader.lab-ready.reader-text-only" in shell
    assert "#lyricReader.lab-ready.reader-share-sheet" in shell
    assert "@keyframes lyrics-share-sheet-in" in shell
    assert "BilingualReader" in panel
    assert "TRANSLATION_STATES.LOADING" in bilingual_reader
    assert "learnMode" in bilingual_reader
    assert "wordJitter" in bilingual_reader
    assert 'aria-label="Original lyric"' in bilingual_reader
    assert 'fetch("/api/lyrics/localize-window"' in localizer_provider
    assert 'name: "caption-localizer"' in localizer_provider
    assert 'role="switch"' in options
    assert "min-h-12" in options
    assert "High contrast" in options
    assert "Reduce motion" in options
    assert "Dyslexia-friendly text" in options
    assert "Screen-reader updates" in options
    assert "Focus" in options
    assert "Spectrum bars" in options
    assert 'onChange("spectrumVisible", value)' in options
    assert "Word-by-word glow" in options
    assert 'onChange("wordGlow", value)' in options
    assert "Pin behind shader" in options
    assert 'onChange("lyricsBehindShader", value)' in options
    assert "Window appearance" in options
    assert "Text only" in options
    assert "Share sheet" in options
    assert 'onChange("windowAppearance", value)' in options
    assert "brighter text with stronger edge shadows" in options
    assert "language" in options.lower()
    # Preference defaults and the DOM they drive are shell-owned now.
    assert "spectrumVisible:true" in preferences
    assert "wordGlow:false" in preferences
    assert "lyricsBehindShader:false" in preferences
    assert "windowAppearance:'window'" in preferences
    assert "lyrics-spectrum-hidden" in preferences
    assert "reader-share-sheet" in preferences
    assert "data-window-appearance={prefs.windowAppearance}" in reader
    assert 'prefs.windowAppearance === "shareSheet"' in reader
    assert "lyricsBehindShader={prefs.lyricsBehindShader}" in reader
    assert 'data-lyrics-layer={pinnedLyrics ? "underlay" : "overlay"}' in panel
    assert "reader-shader-foreground" in panel
    assert "reader-lyrics-underlay" in bilingual_reader
    assert '[data-lyrics-layer="underlay"] .reader-shader-foreground' in styles
    assert ".reader-glass-surface.reader-text-only" in styles
    assert ".reader-glass-surface.reader-share-sheet" in styles
    assert 'prefs.textPlate && prefs.windowAppearance !== "textOnly"' in bilingual_reader
    assert "prefs.textPlate || prefs.highContrast" not in bilingual_reader
    assert ".reader-high-contrast .reader-plate" not in styles
    assert "getActiveLyricWordIndex" in bilingual_reader
    assert "wordGlowState" in bilingual_timeline
    assert "lyricWordMetrics" in word_timing
    assert ".reader-word-active" in styles
    assert "body.lyrics-spectrum-hidden #eqCanvas" in shell
    app = (repo / "static/gallery/app.js").read_text()
    assert "!document.body.classList.contains('lyrics-spectrum-hidden')" in app


def test_standalone_lab_localizes_the_latest_base44_reader_and_sequencer():
    repo = Path(__file__).resolve().parents[1]
    lab = (repo / "lyrics-shader-lab/src/pages/LyricShaderLab.jsx").read_text()
    language_select = (repo / "lyrics-shader-lab/src/components/bilingual/LanguageSelect.jsx").read_text()
    sequencer = (repo / "lyrics-shader-lab/src/components/shader-lab/LyricSequencer.jsx").read_text()
    panel = (repo / "lyrics-shader-lab/src/components/shader-lab/VisualizerPanel.jsx").read_text()
    reader = (repo / "lyrics-shader-lab/src/components/bilingual/BilingualReader.jsx").read_text()

    assert "LanguageSelect" in lab
    assert "BilingualTimeline" in lab
    assert "LearnControls" in lab
    assert "VocabularyCard" in lab
    assert "LiveAnnouncer" in lab
    assert "createCaptionLocalizerProvider" in lab
    assert "useBilingualReader" in lab
    assert "LyricSequencer" in lab
    assert "activeSequencerOverride" in lab
    assert 'readerMode === "timeline"' in lab
    assert 'readerMode === "learn"' in lab
    assert "Original only" in language_select
    assert "DragDropContext" in sequencer
    assert "onLyricsReorder" in sequencer
    assert "sequencerOverride={sequencerOverride}" in panel
    assert "enterMotion" in reader
    assert "exitMotion" in reader
    assert "positionClass" in reader


def test_audio_features_returns_explicit_neutral_fallback(client: TestClient):
    response = client.get(
        "/api/audio-features",
        params={"title": "Fixture Song", "artist": "Fixture Artist", "duration_ms": 180000},
    )

    assert response.status_code == 200
    assert response.json() == {
        "available": False,
        "source": "neutral_default",
        "confidence": 0.0,
        "reason": "missing_spotify_id",
        "title": "Fixture Song",
        "artist": "Fixture Artist",
        "danceability": 0.5,
        "energy": 0.5,
        "loudness": -14.0,
        "speechiness": 0.1,
        "acousticness": 0.3,
        "instrumentalness": 0.2,
        "liveness": 0.1,
        "valence": 0.5,
        "tempo": 120.0,
        "key": -1,
        "mode": 1,
        "time_signature": 4,
        "duration_ms": 180000,
    }


def test_audio_features_uses_authenticated_spotify_priors(client: TestClient):
    feature = MagicMock()
    feature.to_dict.return_value = {
        "track_id": "abc123",
        "tempo": 128.0,
        "energy": 0.82,
        "valence": 0.61,
    }
    with (
        patch("main.SpotifyImportService._access_token", return_value="token"),
        patch("main.FocusService.get_track_features", new=AsyncMock(return_value=feature)),
    ):
        response = client.get(
            "/api/audio-features",
            params={"title": "Fixture Song", "artist": "Fixture Artist", "spotify_id": "abc123"},
        )

    assert response.status_code == 200
    assert response.json()["source"] == "spotify_legacy"
    assert response.json()["providerTrackId"] == "abc123"
    assert response.json()["tempo"] == 128.0


def test_visual_analysis_contract_matches_embedded_client(client: TestClient):
    response = client.post(
        "/api/visuals/llm-analyze",
        json={
            "songTitle": "Fixture Song",
            "artist": "Fixture Artist",
            "lyricLine": "We burn bright like neon fire",
            "section": "chorus",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "dev-music-service-local"
    assert payload["mood"] == "euphoric"
    assert payload["energy"] > 0.5
    assert payload["colorA"].startswith("#")
    assert payload["visualPrompt"]


def test_visual_service_is_deterministic():
    request = LyricVisualAnalysisRequest(
        songTitle="Fixture Song",
        artist="Fixture Artist",
        lyricLine="quiet snow drifts",
        section="verse",
    )

    assert LyricVisualService.analyze_lyric(request) == LyricVisualService.analyze_lyric(request)


def test_wallpapers_carry_motion_risk_and_the_engine_honours_it(client: TestClient):
    """Every wallpaper declares a motion risk, and reduced motion damps the clock.

    Risk metadata on its own is only advice. The engine has to act on it, or a
    reduced-motion user still gets the same strobing backdrop.
    """
    repo = Path(__file__).resolve().parents[1]
    data = (repo / "static/gallery/data.js").read_text()
    safety = (repo / "static/gallery/motion-safety.js").read_text()
    engine = (repo / "static/gallery/engine.js").read_text()
    shell = (repo / "static/index.html").read_text()

    # Every wallpaper is classified, with no unknown values.
    ids = re.findall(r"id:'([a-z0-9-]+)', name:", data)
    risks = re.findall(r"a11y:'([a-z]+)'", data)
    assert len(risks) == len(ids), "every wallpaper needs an a11y risk"
    assert set(risks) <= {"none", "low", "medium", "high"}
    assert "high" in risks and "low" in risks

    # The risk is turned into a shader-clock rate, not just a label.
    assert "rates: { none: 1, low: 1, medium: .6, high: .35 }" in safety
    assert "prefers-reduced-motion: reduce" in safety
    assert "rateFor(id)" in safety

    # The engine accumulates time at that rate instead of reading the wall clock,
    # so toggling reduced motion cannot make the visual jump.
    assert "MotionSafety.rateFor(this.fragId)" in engine
    assert "this.tSec +=" in engine
    assert "Math.min(0.1," in engine, "dt must be clamped for backgrounded tiles"
    assert "(performance.now() - this.start)/1000" not in engine

    assert "/static/gallery/motion-safety.js" in shell
    assert shell.index("motion-safety.js") < shell.index("engine.js")

    served = client.get("/static/gallery/motion-safety.js")
    assert served.status_code == 200


def test_canvas_editor_is_embedded_as_a_plugin(client: TestClient):
    """The Canvas editor mounts on the same plugin contract as the reader.

    The shell owns the note; the surface is a view that emits save intents.
    """
    repo = Path(__file__).resolve().parents[1]
    shell = (repo / "static/index.html").read_text()
    host = (repo / "static/gallery/canvas-plugin.js").read_text()

    surface = client.get("/canvas")
    assert surface.status_code == 200
    # Embeddable, but only this path and the lab may be framed.
    assert surface.headers["x-frame-options"] == "SAMEORIGIN"
    assert client.get("/").headers["x-frame-options"] == "DENY"

    assert 'id="canvasEditorFrame"' in shell
    assert 'src="/canvas?surface=editor"' in shell
    assert 'id="canvasToggle"' in shell
    assert 'aria-controls="canvasEditor"' in shell
    assert "/static/gallery/canvas-plugin.js" in shell
    # The panel is deferred: it must not cost anything until opened.
    assert 'loading="lazy"' in shell

    assert "Base44AppPlugin.create" in host
    assert "surface:'editor'" in host
    # A text editor has no per-frame channel; it must not be given one.
    assert "frameFloats:0" in host
    assert "uniformKeys:[]" in host
    # The shell owns the notes, including which one is active.
    assert "phaseField.canvasNotes" in host
    assert "phaseField.canvasActiveNote" in host
    for handler in ("save(payload)", "select(payload)", "create()", "remove(payload)"):
        assert handler in host
    # A save must not re-push the scene, or it re-seeds the editor mid-keystroke.
    assert "Deliberately no invalidate()" in host

    # Ported Canvas components that stand on their own.
    surface_src = (
        repo.parent / "Documents/GitHub/base44-canvas/src/pages/EditorSurface.jsx"
    )
    if surface_src.is_file():
        surface_code = surface_src.read_text()
        for component in ("DocItem", "EditorToolbar", "StatusBar", "TagFilterBar",
                          "CommandPalette", "MarkdownPreview", "EditorArea"):
            assert component in surface_code
        # Excluded on purpose — checked as imports, since the module comment
        # names them to explain why they are absent.
        imports = [ln for ln in surface_code.splitlines() if ln.startswith("import ")]
        joined = "\n".join(imports)
        # AIWorkshop and OSSearchBar need an LLM and filesystem-indexer.
        assert "AIWorkshop" not in joined
        assert "OSSearchBar" not in joined
        # DocList drags in @hello-pangea/dnd for reordering this surface lacks.
        assert "canvas/DocList" not in joined

    served = client.get("/static/gallery/canvas-plugin.js")
    assert served.status_code == 200
