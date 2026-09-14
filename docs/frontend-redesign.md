# Phase · Field — Frontend Design Audit & Redesign Plan

**Date:** 2026-09-05  
**Author:** Principal Engineer Review  
**Scope:** `dev-music-service` frontend (`static/index.html`, `gallery/*.js`, sub-apps)

---

## Appendix Z — Origins & Evolution (from HistoryKit)

Retrieved via HistoryKit MCP from 697 indexed conversations across 21,288 messages.

### Timeline of Identity Shifts

| Date | Milestone | Conv. (Messages) | What Changed |
|------|-----------|------------------|--------------|
| **2025-09-11** | **Big Bang** — "Build music recognition app" | `68c33d2e…` (541 msgs) | First-ever idea: a Shazam/SoundHound clone. 541-message thread exploring audio fingerprinting (Dejavu, Chromaprint, AcoustID, audfprint), matching against a catalog, OpenRouter models. This is where the *music project* was born. |
| **2026-03-31** | Earliest code block in index — `ytdlp_service.py` search method fix | `69cbb96a…` | dev-music-service code already exists; someone is fixing bugs in the yt-dlp service layer. Project is a streaming backend by now. |
| **2026-06-18** | "Shader Lesson in DMS" | `6a33d0c8…` | WebAudio→shader uniform pipeline documented. Shader wallpapers are live. The visual identity ("the field") is established. |
| **2026-06-20** | "Shader wallpapers" appears 5+ times in index | Various | Shader wallpapers iterated heavily over multiple days. Palette-driven, audio-reactive GLSL shaders. |
| **2026-06-21** | "Video streaming integration" | `6a3f4e3d…` | Comparison: dev-music-service vs Spotify. Understanding streaming proxy architecture, range requests, yt-dlp piped to stdout. Browser-first playback confirmed as primary design choice. |
| **2026-06-28 → 29** | "App with Song Recognition" | `6a40912a…` | *"How can I build an app like SoundHound as a feature into dev-music-service?"* — song recognition proposed as a FEATURE addition to the existing streaming service, not as a separate product. Shows the tooling stack: Qwen3-Coder for speed. |
| **2026-06-22** | GitHub resume file shows dev-music-service README written | `6a3992dd…` | README frames it as "FastAPI music platform with browser-first playback, search, streaming, synced lyrics." Lyrics already documented at this point. |
| **2026-07-12** | "Microservices Translation Architecture" | `6a53a68f…` | Massive architecture exercise mapping translation systems onto dev-music-service. Essentia proposed as Audio Intelligence/MIR service alongside lyrics-translation. CaptionLocalizer as the transcription/localization bridge. |
| **2026-08-14** | "Viper Shader Refactor" + "Canvas Local Tool Bridge" | Various | Canvas/panel architecture starts taking shape. Base44 integration begins. |
| **2026-08-16** | "Music Service Architecture" | `6a8167c9…` (3 msgs) | *"How do Spotify/AppleMusic/AmazonMusic all architect their music service and why none of them offer lyric translations?"* — reveals user's belief that music apps don't do lyric translations well (inaccurate — Apple Music launched Lyrics Translation in iOS 26, Spotify went global Feb 2026). User sees dev-music-service as filling a gap. |
| **2026-08-20** | "Texture Side Project Ideas" — project atlas includes dev-music-service | `6a866bd9…` | Dev-music-service listed among connected projects in a broader portfolio review. It's one tool among many, not THE product. |

### Key Insight: Three Identities, One Codebase

The project evolved organically through conversation-driven development:

1. **Phase 1 (Sep 2025):** Music recognition tool (Shazam clone) — never built
2. **Phase 2 (Mar–Jun 2026):** Streaming music backend with browser playback — built successfully
3. **Phase 3 (Jun–Aug 2026):** Shader wallpapers, synced lyrics, translations, video mode — the "immersive music experience" identity emerged
4. **Phase 4 (Aug–Sep 2026):** Base44 plugin platform with dock panels — the "developer sandbox" identity grafted on top

**Identity drift occurred naturally through open-ended coding sessions.** Each new feature added without asking "does this belong in a music player?" The dock system was designed for a creative OS metaphor ("Palette"), not a music UI.

### Evidence from Conversations

From "App with Song Recognition" (2026-06-28):
> *"How can I build an app like sound hound as a feature into dev music service"*

This tells us the user's mental model was always **"dev-music-service plus features"** rather than **"what kind of product is dev-music-service?"**

From "Music Service Architecture" (2026-08-16):
> *"can you help me understand how spotify/applemusic/amazonmusic all architecht their music service and why none of them offer lyric translations?"*

This confirms the user sees dev-music-service as a **differentiated alternative** to commercial music services, positioned around lyrics/translations/visuals.

From "Microservices Translation Architecture" (2026-07-12):
Massive effort mapping full translation pipeline architecture onto the service — showing the depth of commitment to the music-experience vision.

### Why This Matters for Redesign

The redesign must **resolve the identity conflict**, not paper it over. The two-target strategy (Vercel = focused music product, Dev = experimental playground) directly reflects how the project evolved:
- The Vercel front end should be what the user *aspires* dev-music-service to be (immersive music experience)
- The Dev front end should preserve the chaotic energy that makes experimentation fun (plugin platform, dev tools)

---

## Executive Summary

Phase is an **immersive, audio-reactive music listening platform** with WebGL shader backgrounds, synced bilingual lyrics, focus-profile discovery, and translated vocals. Its current state conflates three identities — a natural consequence of 12 months of open-ended, conversation-driven development across 697 HistoryKit conversations (21K+ messages).

| Identity | Origin | Status | Decision |
|----------|--------|--------|----------|
| **Phase · Field** — Immersive music player + reactive visuals | Emerged Jun–Aug 2026 from streaming backend + shader experiments | ✅ Core | KEEP (Vercel prod) |
| **Base44 Plugin Platform** — 22 embedded mini-apps / surfaces | Grafted Aug 2026 via "Palette OS" creative workspace metaphor | 🔄 Legacy | DEV BUILD ONLY |
| **Developer Workbench** — ForgeTool, MCP, component vault | Built for experimentation; no external users depend on it | 🔧 Internal | DEV BUILD ONLY |

**Two-target strategy:**
- **Vercel deployment**: Polished, focused music experience. Zero non-music surfaces.
- **Dev build**: Full playground with every surface intact.

> The redesign must resolve the identity conflict, not paper it over. See [Appendix Z](#appendix-z--origins--evolution-from-historykit) for full origin history.

---

## Section 1 — Feature Inventory

### 1.1 Core Music Features (Vercel = KEEP, Dev = KEEP)

| # | Feature | Location | Assessment |
|---|---------|----------|------------|
| 1 | **The Field** — WebGL shader stage reacting to live audio | Shell CSS + `shaders.js` (2270 lines GLSL) | ★★★★★ Killer feature. 20+ curated shaders (Drift, Vellum, Halftone, Caustics, Stria, Ember, Marble, Weave, Prism, Tunnel, Pulse, Cells, Tide, Lattice, Mercury, Meridian, Bloom, Aperture, Resonance, Original). Each tagged with preset, BPM, a11y level, palette. This IS Phase's identity. |
| 2 | **Music Search & Streaming** | `service.js`, `/api/search`, yt-dlp backend | ★★★★☆ Solid foundation. Aggregates from multiple sources (YouTube, MusicBrainz). Local playback integration via ffplay. |
| 3 | **Synced Lyrics** | `/api/lyrics` (LRCLIB), `lyrics-shader-reader.js` | ★★★★★ Word-level timing display on the shader field. Foundational experience. |
| 4 | **Bilingual Timeline Reader** | `lyrics-shader-lab/` (Vite sub-app) | ★★★★☆ Excellent work. Separate Vite build, real service contracts, per-word vocabulary lookup, dyslexia-friendly type, timestamp-synced glow. Should be the default lyric view. |
| 5 | **Translated Vocals** | `semi-plugin.js`, `/api/vocals/translated` | ★★★★☆ Unique differentiator. Pika Voice Profile integration. Pre-release flag gated. |
| 6 | **Focus Profiles** | `focus.js`, FocusService, `focus_profile.json` | ★★★★☆ BPM/energy/valence/instrumentalness scoring from ReccoBeats. Coverage awareness displayed honestly. Good UX. |
| 7 | **Wallpaper Picker** | `wallpaper-palette.js`, dot rail in shell | ★★★★☆ Curated selection, each wallpaper paired from another shader. Clean interaction. |
| 8 | **Video Mode** | `videoModeBtn`, `/api/video/search`, YouTube overlay | ★★★☆☆ Nice-to-have. Video plays behind lyrics at reduced opacity. Search modal borrows the shell's omni-search pattern well. |
| 9 | **Audio Spectrum EQ** | `eq.js`, `#eqCanvas` | ★★★☆☆ FFT spectrum strip along bottom edge. Has popover controls (presets, reset). Functional but secondary. |
| 10 | **Chromecast** | `cast.js`, Google Cast SDK | ★★★☆☆ Standard casting. Works when configured. |
| 11 | **Share Sheet** | `share.js` | ★★★☆☆ Animated share-sheet appearance for tracks. |
| 12 | **Live Transcription** | `/api/lyrics/transcribe` (SSE) | ★★★☆☆ Real-time transcription stream. Useful but not yet polished. |

### 1.2 Non-Music Surfaces (Vercel = REMOVE, Dev = KEEP)

These are Base44 exports loaded as generic-host iframes in the dock row or overlay. Only 2 local repo checkouts exist (`base44-apps`, `base44-canvas`). The remaining ~15 repos referenced in `plugins.json` are archived exports with no active checkout.

| # | Surface | Blurb | State | Reason to Remove from Prod |
|---|---------|-------|-------|---------------------------|
| 1 | Canvas | Note editor | Wired (base44-canvas checkout exists) | Productivity tool, not music-related |
| 2 | Canvas (full app) | Whole Canvas app with router/graph | Wired | Same as above |
| 3 | FloatDesk | Reactions for playing track | Wired (archived export) | Low signal; reactions are decorative, not useful |
| 4 | TUNESHERE | Playlist/library view | Wired (archived export) | Duplicates shell's own search + Focus + library import |
| 5 | Champions Hub | Standings board | Wired (archived export) | Completely unrelated to music |
| 6 | Emerald Sky | Spec document reader | Wired (archived export) | Developer doc viewer |
| 7 | VertexFlow | glTF 3D viewport | Wired (archived export) | 3D model viewer, no music connection |
| 8 | StillShot AI | Photo board | Wired (archived export) | Image gallery, no music connection |
| 9 | ForgeTool | Developer workbench | Wired (archived export) | Internal dev tool |
| 10 | FlowState | Today's focus list | Wired (archived export) | Task management |
| 11 | FlowSchedule | Agenda | Wired (archived export) | Calendar/agenda |
| 12 | Task Management | Board view | Wired (archived export) | Kanban board |
| 13 | Digma | Component gallery | Wired (archived export) | Code components |
| 14 | OrbitJobs | Pipeline board | Wired (archived export) | CI/CD monitor |
| 15 | PassportLog | Visited-countries map | Wired (archived export) | Travel tracker |
| 16 | Luminous Chronicle | Print collection browser | Wired (archived export) | Physical collection archive |
| 17 | Radiant Archive | Project archive grid | Wired (archived export) | Project history |
| 18 | Resolution Weaver | Resolution list | Wired (archived export) | Personal resolutions |
| 19 | SETH | Learning session view | Wired (archived export) | Education tool |
| 20 | Solar Clock | Time display | Static HTML surface | Decorative clock — no music relevance |
| 21 | Pika Voice Profile | Voice config for translations | Wired (needs semi checkout) | Keep as part of Translated Vocals (#5 above) |

**Duplicate entries noted in `plugins.json`:**
- OrbitJobs `69fbf067` (old, superseded by `69edf69d`)
- FloatDesk `6a01fff` (old, superseded by `6a01ff36`)

### 1.3 Shared Infrastructure (Both Builds = KEEP)

| Component | Purpose | Location |
|-----------|---------|----------|
| Plugin Dock | Dock panel system (horizontal stack, slot eviction) | `plugin-dock.js` |
| Plugin Chrome | Resolve backdrop/border/blur per surface | `plugin-chrome.js` |
| Base44 App Plugin | Create iframe + protocol bridge (scene push, intents) | `base44-plugin.js` |
| App Launcher | Single shared overlay for generic-host apps | `apps-launcher.js` |
| Reactivity Engine | Audio-driven shader uniform pipeline | `reactivity.js`, `engine.js` |
| Player State | Track info, progress, transport controls | `player.js`, `nowPlaying` global |

---

## Section 2 — Design Problem Analysis

### 2.1 Information Architecture Failures

**Problem 1: Everything is equally accessible.**  
The shell presents ~20 dock toggles + edge zones + keyboard shortcuts, all at the same visual weight. A new user opens Phase and sees: a tool cluster, zone chevrons, a dot rail, caption info, and potentially dozens of dock panels. No hierarchy exists.

**Problem 2: Modes collide.**  
Three distinct interaction modes exist without clear boundaries:
- **Immersive mode** — fullscreen shader, auto-hide chrome, edge nav zones hover to reveal arrows
- **Grid mode** — Command+T switcher, all wallpapers shown as tiles with shader canvases
- **Search mode** — fullscreen omni-search with result rows

Each mode hides the others' chrome, but the transitions feel arbitrary. The `body.grid-mode:not(.search-mode) .zone:hover::before { opacity: 0 }` rule shows deliberate exclusion logic, but no user understands why clicking sometimes opens a grid and sometimes opens a search.

**Problem 3: Keyboard hints lie or hide.**  
`#hint` shows `<kbd>K</kbd>` for grid and `<kbd>S</kbd>` for search, but these disappear in responsive layouts. Mobile users never discover these shortcuts.

**Problem 4: The dock row doesn't scale.**  
From `plugins.json`: width is divided among open panels down to `--dock-w-min: 320px`. Three or four panels trigger evictions. But the catalog has 21 entries. The row was designed for 2–3 panels, not 21.

### 2.2 Interaction Design Issues

| Issue | Location | Impact |
|-------|----------|--------|
| Edge zones trigger mode changes accidentally | `.zone` left/right edges, 16vw wide | Clicking to dismiss chrome may open grid/search |
| Idle chrome fade has no recovery affordance | `#stage.idle .chrome { opacity: 0 }` | Users can't tell how to bring back UI |
| Info panel slides in/out with no persistent indicator | `#info.show` class toggle | Current track metadata disappears after 4 seconds |
| Wallpaper dots have no label or preview on hover | `.dot.on` only changes color | Users click randomly to cycle |
| Search results show nothing about context origin | `.r-src` chip exists but is rarely filled | Users can't distinguish Spotify vs YT vs MB results |
| "Analyse my top tracks" button disabled until Spotify connects | `#analyseTopBtn[disabled]` | Users don't understand why they can't explore Focus |

### 2.3 Technical Debt

| Issue | Severity | Notes |
|-------|----------|-------|
| Monolithic `index.html` (1737 lines, inline CSS + HTML + scripts) | High | Impossible to review in isolation; single PR touches everything |
| No TypeScript | Medium | All JS files are untyped; `globalThis` pollution (`state`, `nowPlaying`, `ALTS`, `MotionSafety`, `PluginDock`) |
| No test coverage for frontend | High | `audit:design` tests layout geometry but not interaction or API contracts |
| Shadow DOM / scoped styles not used | Medium | Global CSS means any iframe surface inherits shell styles unless carefully isolated |
| Build scripts are hand-tuned node scripts | Low | `build-canvas-surface.mjs`, `build-semi-surface.mjs` etc. work but lack abstraction |
| Inline SVG in data URIs for zone chevrons | Low | Not performant; should be CSS pseudo-elements or sprite sheet |

---

## Section 3 — Product Direction

### 3.1 Positioning Statement

> **Phase helps you *feel* music** through audio-reactive visuals, word-perfect synced lyrics, and intelligent discovery — in a distraction-free, immersive interface.

### 3.2 Guiding Principles

1. **The shader IS the interface.** Every UI element floats on or emerges from the field. Nothing sits "above" it as a separate layer.
2. **Progressive disclosure.** Default state = zero chrome. Users discover features through gesture, not menus.
3. **One primary flow.** Search → Play → Immerse. Every other interaction branches from this core loop.
4. **Performance as a feature.** 60fps shader updates, instant wallpaper switching, <100ms response for all UI actions.

### 3.3 Target User Journeys

**Primary (Vercel):**
```
Open Phase → Wallpapers load → Discover track (search/home) → Press play → 
Shader reacts → Read synced lyrics → Explore similar (Focus) → Switch wallpaper
```

**Secondary (Dev build):**
```
Open Phase → Open any surface from launcher → Experiment → Break things → Report
```

---

## Section 4 — Vercel Redesign Specification

### 4.1 New Information Architecture

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                    THE FIELD                        │
│              (WebGL Shader Background)               │
│                                                     │
│   [←]                    [tools]                    │
│   Zone                 ┌──────┐                     │
│   chevron             │ ♪ ⏸ ▶│ ← audio mini-bar   │
│                       └──────┘                     │
│                                                     │
│           NOW PLAYING (auto-reveals on play)        │
│           "Track Name"                             │
│           Artist · Album                           │
│           "Current lyric line…"                    │
│                                                     │
│                          [●] ● ● ○ ○          [→]   │
│                         Dots                      Zone │
│                        (wallpapers)                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │         DOCK PANEL (slide-in from right)      │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  × Close                                │  │  │
│  │  ├─────────────────────────────────────────┤  │  │
│  │  │                                         │  │  │
│  │  │  Panel content (Lyrics / Focus / etc.)  │  │  │
│  │  │                                         │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 4.2 Chrome Hierarchy

| Layer | Default | On Hover | On Click/Key |
|-------|---------|----------|--------------|
| **Wordmark + tick** (top-left) | `opacity: 0.5` | `opacity: 0.8` | Opens wallpaper picker |
| **Audio mini-bar** (top-center) | `translateY(-8px)` invisible | Slides into view | Expands to full now-playing card |
| **Tool cluster** (top-right) | `opacity: 0` | `opacity: 0.8` | Grid of tool buttons visible |
| **Edge zones** (left/right) | Invisible chevrons | Arrow slides in | Opens respective panel/grid |
| **Now Playing** (bottom-left) | Hidden | Auto-shows when playing | Shows title, artist, lyric, language pickers |
| **Dot rail** (bottom-center) | Visible when wallpaper > 1 | Dots enlarge on hover | Highlights current, click to cycle |
| **Keyboard hints** (bottom-right) | Faint | N/A | N/A (hidden on mobile) |

**Idle behavior:** After 4s of inactivity during playback, chrome fades to `opacity: 0.15`. Mouse movement restores it fully within 120ms.

### 4.3 Dock Panels (Vercel = 4 panels only)

| Panel | Trigger | Content |
|-------|---------|---------|
| **Lyrics** | Auto-opens on track start, or tap lyric line | Synced lyrics from LRCLIB with word-level highlighting. Language toggle below. |
| **Bilingual Reader** | Button in lyrics bar, or `L` key | Full lyrics-shader-lab in iframe. Original + localized side-by-side. |
| **Focus** | Tool button, or `F` key | Focus profile editor + ranked playlist. Shows ReccoBeats coverage stats. |
| **Wallpaper** | Tap wordmark or dot rail | Full-screen wallpaper grid (grid mode). Shader previews animate on hover. |

### 4.4 Removed from Vercel

- ~~All Base44 plugin surfaces~~ (Canvas, TUNESHERE, Champions Hub, etc.)
- ~~Solar Clock~~
- ~~FloatDesk reactions~~
- ~~App launcher button~~
- ~~Component Vault embed~~

### 4.5 Kept from Vercel

- WebGL shader field (core)
- Music search & streaming
- Synced lyrics
- Bilingual timeline reader (sub-app)
- Translated vocals
- Focus profiles
- Wallpaper picker
- Video mode
- Audio spectrum EQ
- Chromecast
- Share sheet
- Live transcription

---

## Section 5 — Dev Build Retention Strategy

### 5.1 How the Dev Build Accesses Surfaces

The dev build keeps `plugins.json` intact and serves all routes. To prevent surface overload:

1. **Launcher opens a sidebar, not the dock row.** Instead of expanding the dock panel stack, the launcher opens a left-edge drawer listing all plugins as cards.
2. **Surfaces open in overlays, not dock cards.** Selecting a surface from the launcher mounts it into the existing overlay slot (same as Canvas editor today), replacing whatever was there.
3. **Category tabs filter the list.** Categories: `Music Tools`, `Development`, `Creative`, `Utility`, `Experimental`.
4. **"Danger zone" badge on archived exports.** Surfaces from repos with no active checkout show a `⚠ archived` tag.

### 5.2 Dev Build Specific Features

In addition to all Vercel features, the dev build adds:
- ForgeTool access (MCP tools, component rankings, API scaffolding)
- Component Vault integration
- VertexFlow (glTF viewer)
- All task/project/archive surfaces
- Solar clock
- All Base44 plugin surfaces

### 5.3 Environment Toggle

A runtime variable controls the split:

```javascript
// Set via env var or query param: ?mode=prod
const MODE = window.location.search.includes('mode=dev') ? 'dev' : 'prod';

if (MODE === 'prod') {
  // Hide launcher, remove non-music surfaces from plugins.json filter
  plugins.filter(p => p.id === 'canvas' || p.id === 'semi');
} else {
  // All surfaces available
}
```

---

## Section 6 — Technical Redesign

### 6.1 File Structure Refactor

Split the monolithic `index.html` into modular sections:

```
static/
├── index.html              # Thin shell: stage container + chrome slots
├── css/
│   ├── main.css            # Base styles, variables, resets
│   ├── chrome.css          # Tool cluster, zones, wordmark, hints
│   ├── dock.css            # Dock panel system, overlays
│   ├── grid.css            # Wallpaper grid mode
│   ├── search.css          # Omni-search modal
│   └── responsive.css      # Media queries
├── js/
│   ├── init.js             # Boot sequence, mode detection
│   ├── state.js            # Centralized state management
│   ├── audio.js            # Web Audio analyser, stream setup
│   ├── player.js           # Transport controls, track state
│   ├── shaders/
│   │   ├── tile.js         # WebGL Tile class
│   │   ├── uniforms.js     # Uniform upload pipeline
│   │   ├── shaders.js      # All GLSL shader sources
│   │   └── motion-safety.js # prefers-reduced-motion handling
│   ├── data.js             # Wallpaper metadata (ALTS)
│   ├── navigation/
│   │   ├── chrome.js       # Chrome visibility, idle timer
│   │   ├── zones.js        # Edge zone handlers
│   │   ├── grid.js         # Grid mode toggle & rendering
│   │   └── search.js       # Omni-search
│   ├── panels/
│   │   ├── lyrics-panel.js # Lyrics dock panel
│   │   ├── focus-panel.js  # Focus dock panel
│   │   ├── eq-panel.js     # Spectrum EQ panel
│   │   └── wallpaper-panel.js # Wallpaper picker panel
│   ├── services/
│   │   ├── search-service.js   # Music search API client
│   │   ├── lyrics-service.js   # Lyrics fetch + sync
│   │   └── cast-service.js     # Chromecast
│   └── shared/
│       ├── plugin-dock.js      # Dock panel registry
│       ├── plugin-chrome.js    # Chrome resolution
│       ├── base44-plugin.js    # Base44 protocol bridge
│       └── reactivity.js       # Audio->shader uniform pipeline
├── gallery/                  # Sub-app assets (unchanged)
│   ├── app.js
│   ├── plugins.json
│   └── ...all existing files...
├── canvas/                   # Canvas sub-app (unchanged)
├── lyrics-shader-lab/        # Sub-app (unchanged)
└── clock/                    # Clock sub-app (unchanged)
```

### 6.2 State Management

Replace scattered globals with a single module:

```javascript
// state.js
export const Stage = {
  get index() { return this._index; },
  set index(v) { this._index = v; this._emit('wallpaper'); },
  _index: 0,
  mode: 'immersive',    // 'immersive' | 'grid'
  idle: false,
  searching: false,
};

export const Transport = {
  playing: false,
  progress: 0,
  track: null,  // { title, artist, album, art, duration }
};
```

Subscribe pattern remains push-based (no polling):

```javascript
Stage.subscribe('wallpaper', invalidate);
Transport.subscribe('track', renderNowPlaying);
```

### 6.3 CSS Architecture

Keep CSS custom properties for theming, but scope more aggressively:

```css
/* Variables stay global (shared across iframes via parent styling) */
:root {
  --sans: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --ink: #f4f4f2;
  --dim: rgba(244,244,242,.52);
  --focus: #8affc4;
  --ease: cubic-bezier(.55, 0, .1, 1);
}

/* Module-specific: use modifier classes instead of global body classes */
.stage.grid-active > .chrome { /* hide */ }
.stage.search-active .search-overlay { /* show */ }
```

### 6.4 Progressive Enhancement Checklist

- [ ] Service Worker for offline wallpaper cache (localStorage preload)
- [ ] Web Worker for FFT analysis (move from main thread)
- [ ] Lazy-load GLSL shaders on demand (not all 20+ at boot)
- [ ] Font loading optimization (preconnect + font-display: swap)
- [ ] Touch gestures for mobile (swipe wallpaper, long-press for menu)

---

## Section 7 — Implementation Roadmap

### Phase 1: Foundation (Week 1–2)

| Task | Files Affected | Effort |
|------|---------------|--------|
| Create new file structure (css/, js/, js/shaders/, js/navigation/, js/panels/) | All | Small |
| Extract CSS into modular files | `index.html` <style> block | Medium |
| Implement centralized `state.js` | Replace all global state mutations | Large |
| Add environment toggle (`?mode=prod|dev`) | `app.js` bootstrap | Small |

### Phase 2: Chrome Revamp (Week 2–3)

| Task | Files Affected | Effort |
|------|---------------|--------|
| Redesign chrome hierarchy with clear priority levels | `index.html` chrome markup | Medium |
| Implement improved idle/recovery behavior | `chrome.js` | Medium |
| Fix edge zone collision (reduce sensitivity, add debounce) | `zones.js` | Small |
| Add wallpaper dot hover previews | `data.js` + new thumbnail generation | Medium |
| Keyboard shortcut consistency across all breakpoints | `search.js` + `app.js` | Small |

### Phase 3: Vercel Cut (Week 3–4)

| Task | Files Affected | Effort |
|------|---------------|--------|
| Filter `plugins.json` at boot for prod mode | `apps-launcher.js` | Small |
| Remove dock toggles for non-music surfaces from HTML | `index.html` | Small |
| Remove unused iframe elements from shell | `index.html` | Small |
| Remove non-music routes from Vercel build script | `scripts/build-vercel-frontend.mjs` | Small |
| Update middleware.ts matcher if needed | `middleware.ts` | Small |

### Phase 4: Dev Build Launcher (Week 4–5)

| Task | Files Affected | Effort |
|------|---------------|--------|
| Build sidebar launcher with category filtering | `launcher.js` (new) | Medium |
| Category taxonomy for all 21 surfaces | Configuration | Small |
| Archived export badges | `launcher.js` | Small |
| Overlay mounting for dev surfaces | `apps-launcher.js` + `plugin-chrome.js` | Medium |

### Phase 5: Polish (Week 5–6)

| Task | Files Affected | Effort |
|------|---------------|--------|
| Motion reduction pass (prefers-reduced-motion) | All CSS transitions | Medium |
| Mobile responsive overhaul | `responsive.css` | Large |
| Performance benchmarking (FPS, bundle size) | Audit scripts | Small |
| Documentation update (README, CONTRIBUTING) | `README.md`, `docs/` | Small |

---

## Section 8 — Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cutting Base44 surfaces breaks dev workflows | Medium | High | Keep dev build unchanged initially; gradual migration |
| CSS modularization causes specificity conflicts | Medium | Medium | Use BEM naming convention strictly; CSS Modules would be ideal but not worth the build change |
| State module adds indirection overhead | Low | Low | Benchmark before merging; keep pub/sub lightweight |
| Mobile redesign reveals desktop gaps | Medium | Medium | Prioritize mobile-first after desktop polish |
| Shader FPS drops on low-end devices | Medium | High | `motion-safety.js` already handles reduced-motion; extend to auto-downgrade particle count on slow devices |

---

## Section 9 — Success Metrics

After implementation, measure:

| Metric | Baseline | Target |
|--------|----------|--------|
| First contentful paint (desktop) | ~800ms (estimated, single huge HTML) | <400ms (modular loading) |
| Unintentional mode switches (user reports) | Unknown (no telemetry) | <2% of sessions |
| Chrome recovery confidence (user survey) | Unknown (no survey data) | >80% of users know how to restore chrome |
| Dock panel overlap incidents | Frequent (>4 panels open) | Never (max 4 panels in prod) |
| Vercel bundle size | ~200KB HTML (monolithic) | <80KB total JS + CSS (modular + tree-shakeable) |
| 60fps maintenance rate | Known (via `Tile.draw()` rAF loop) | >95% on target devices |

---

## Appendix A — Wallpaper Catalog Reference

All 20 wallpapers from `data.js` with metadata:

| ID | Name | Preset | BPM | A11y | Pair From | Palette (first 2) |
|----|------|--------|-----|------|-----------|-------------------|
| drift | Drift | Flow | 76 | low | Pulse | #10141a #1d2c35 |
| vellum | Vellum | Rest | 60 | low | Tide | #ebd9b6 #9d6a3e |
| halftone | Halftone | Flow | 92 | medium | Cells | #0c0c10 #1a1014 |
| caustics | Caustics | Spark | 100 | medium | Mercury | #040c1a #0e2a4a |
| stria | Stria | Drive | 132 | high | Lattice | #04060a #0b1c12 |
| ember | Ember | Flow | 74 | low | Pulse | #0d0708 #421210 |
| marble | Marble | Rest | 58 | low | Tide | #1d2026 #474d56 |
| weave | Weave | Flow | 94 | low | Cells | #0a0c0f #16202b |
| prism | Prism | Spark | 104 | medium | Mercury | #050308 #2a1340 |
| tunnel | Tunnel | Drive | 130 | high | Lattice | #04050a #0c2018 |
| pulse | Pulse | Flow | 72 | medium | original | #0d0f1e #2e1438 |
| cells | Cells | Spark | 108 | medium | original | #0a0c10 #1a1c24 |
| tide | Tide | Rest | 56 | low | original | #0a0e16 #1a2a44 |
| lattice | Lattice | Drive | 128 | high | original | #06060a #0e2a1a |
| mercury | Mercury | Spark | 112 | medium | original | #0a0a0e #1a1a2e |
| meridian | Meridian | Flow | 82 | low | original | #140a1a #2a1438 |
| bloom | Bloom | Rest | 64 | low | original | #0e1610 #1a3824 |
| aperture | Aperture | Spark | 116 | medium | original | #0c0a10 #201a30 |
| resonance | Resonance | Flow | 88 | low | original | #100e0a #2a2418 |
| original | Original | Flow | 90 | medium | — | #0a0a0c #1a1a1e |

Each wallpaper has: `desc` (description), `track` (recommendation), `lyric` (featured lyric snippet), `pairFrom` (which shader it pairs from conceptually).

---

## Appendix B — Shell Chrome Markup Reference

Current chrome elements in `index.html` (line numbers approximate):

| Element | Role | Line Range |
|---------|------|------------|
| `#wordmark` | Brand + tick animation | ~730 |
| `#topR` | Tool cluster (search, wallpaper, EQ, focus, etc.) | ~740 |
| `#audio` | Audio mini-control (live indicator, mic/file buttons) | ~760 |
| `#capWrap` | Now-playing info area | ~790 |
| `#dots` | Wallpaper dot rail | ~830 |
| `#hint` | Keyboard shortcut hints | ~845 |
| `#zoneL` | Left edge navigation zone | ~650 |
| `#zoneR` | Right edge navigation zone | ~650 |
| `#videoModal` | Video search overlay | ~850 |
| `#clockModal` | Clock panel | ~890 |
| `#search` | Fullscreen search overlay | ~940 |
| `#gridScrim` + `#gridScroll` | Grid mode containers | ~870 |
| `#eqControls` | EQ presets popover | ~680 |
| `#capClick` | Capsule click handler area | ~920 |
| `#lyricLocaleWrap` | Language picker row | ~800 |
| `#videoTools` | Video mode controls | ~810 |

Total unique chrome elements: **16**. Of these, **6 are music-related** (audio, capWrap, dots, hint, lyricLocale, videoTools), **6 are navigational** (wordmark, topR, zoneL, zoneR, search, grid), and **4 are situational** (videoModal, clockModal, eqControls, capClick).

---

*End of Document*
