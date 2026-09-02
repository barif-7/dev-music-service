# Handoff Notes

Running context for whoever picks this up next. Newest first.

## Packaging

- **`pyproject.toml` is the source of truth for dependencies**, not
  `requirements.txt`. Use `uv` (`uv run …`, `uv run --extra dev pytest`).
- Dev tooling (pytest, flake8, bandit) lives in the `dev` optional-dependency
  group.

## 2026-09-01 — Frontend design is audited in a browser, not grepped

**Why:** the design assertions were string matches against `static/index.html`
and `base44-canvas/src/index.css`. They broke on every deliberate design change
and caught none of the real bugs — `inset:0` followed by `right:auto` is valid
CSS that silently shrink-to-fits a "full-viewport" panel to 300px, and no
stylesheet grep sees that.

**`npm run audit:design`** (`scripts/design-audit.mjs`) boots the app on a free
port, drives the overlay in Chromium, and asserts computed style and measured
boxes: the pane is inset rather than full-bleed, the glass is thin enough to let
the field through, the overlay takes no dock slot and survives a
narrow-viewport evict, the toggle stays reachable above it, the surface adds no
second backdrop, and an embed sizes itself from the vault's reported height
while staying sandboxed. 15 checks.

Verified it actually fails: reintroducing the `inset:0;right:auto` bug turns
"panel is inset, not full-bleed" red with `0px x 0px gap` and exits 1.

**Not in CI** — it needs a browser and a booted app, and a flaky render should
not block a merge. `playwright-core` is a devDependency (it ships no browsers);
the Chromium is discovered from the local `ms-playwright` cache and overridable
with `DESIGN_AUDIT_CHROMIUM`. Vault checks skip when the vault is down.

**pytest keeps the wiring contract** — framing headers, registration, the
`chrome=overlay` handshake — and no longer asserts CSS values at all.

## 2026-09-01 — The solar clock was never allowed to be framed

**Symptom:** Firefox paints "Firefox Can't Open This Page … will not allow
Firefox to display the page if another site has embedded it" inside the clock
panel. Chrome fails the same way but silently — `ERR_BLOCKED_BY_RESPONSE` and an
empty panel — which is why it went unnoticed.

**Cause:** `beta_auth_gate` hard-coded the framing allowlist as
`("/lyrics-shader-lab", "/canvas")`. The clock is `/static/clock/index.html`,
so it was served `X-Frame-Options: DENY` and refused to be framed. Pre-existing;
nothing to do with the overlay work.

**Fix:** the allowlist is now `_FRAMEABLE_PATHS`, next to the other path sets,
and includes the clock. `test_every_framed_surface_is_allowed_to_be_framed`
scans the shell's own `<iframe src=…>` attributes and asserts each one returns
200 + SAMEORIGIN, so a new surface cannot be added without being allowed —
rather than a hand-kept list that drifts the same way.

**Unrelated leftover:** `/favicon.ico` 404s. Cosmetic, still open.

## 2026-09-01 — The editor emerges from the field, full screen

**Asked for:** the canvas editor should emerge from the shaders via a fade-in
and sit centred as a full-screen overlay. That supersedes the inset floating
pane taken from Canvas OS v2 below — the glass is now full-bleed, and the field
shows *through* it rather than around it.

- **Full-bleed**: `inset:0`, no radius, no border, no shadow. A shadow would
  read as an object sitting over the stage; this is the stage changing state.
- **Centred writing**: the column keeps its reading width (672px) and centres
  on the glass, so the field stays visible either side of the text.
- **Emergence**: no slide. Opacity fades up while `backdrop-filter` ramps from
  `blur(0px)` — closed, there is no glass at all, so opening makes the field
  appear to condense into a pane. A `scale(1.015 -> 1)` settles with it.

**The easing had to be its own.** `--ease` is `cubic-bezier(.55,0,.1,1)`, shaped
for a panel sliding into place, and it front-loads so hard that opacity went
.02 -> .99 in 90ms — a snap, not an emergence. Measured in-page over rAF, the
replacement `cubic-bezier(.32,.08,.24,1)` gives a short beat, then opacity
blooming over ~560ms, with the blur still thickening to ~780ms:

```
  t(ms)  opacity  blur
     2     0.00      0
   123     0.06    1.1
   187     0.47    8.4
   379     0.90   21.5
   563     1.00   26.5
   775     1.00     28
```

`npm run audit:design` asserts the full-bleed box, the centred column, the fade
(no translate offset), and that the closed state really is `blur(0px)` — the
last one has to be read *after* the transition settles, since mid-flight
computed style still reports the old value.

## 2026-09-01 — The overlay follows the Canvas OS v2 "liquid glass" direction

**Source:** a Claude design thread ("Pallette", 2026-06-15, HistoryKit conv
`338db761-3429-47f9-9011-7cd5bdb602a9`). There is no separate written spec for
Canvas OS — v1 tokens live in `base44-canvas/src/index.css`, and the visual
direction lives in that thread:

- **v1 "Cognitive Workbench"** — chromatic depth (surfaces lift in steps via
  blue-grey hue shifts, *not* heavy borders), hybrid type (Inter for reading,
  JetBrains Mono as a system accent), a 2px accent left-border "you are here".
- **v2 "liquid glass"** — a shader field on a fixed background layer, with the
  panels floating above it as **rounded frosted-glass cards**: thin top
  highlight, soft drop shadow, `backdrop-filter` blur, and **widened gaps so the
  colour bleeds through the glass and around the edges**. The thread's own
  correction is the useful part: *"the background is too dark and the gaps too
  tight, so the 'alive' quality isn't coming through."*

**What changed:** the overlay was full-bleed, square and unpainted — the
opposite of that. It is now one floating pane: `inset:clamp(...)` for a gap all
round, `--squircle` radius, a `::before` top highlight, a deep drop shadow, and
glass at `rgba(15,16,22,.55)` with `blur(28px) saturate(1.5)` — thinner and more
saturated than either dock glass, because at `--glass-strong` the field behind it
goes to black.

Inside, the surface adds **no** glass of its own: a second tinted layer inside
the first is what makes an embed look like a box in a box. The bars lift off the
pane with `hsl(var(--foreground) / 0.03)` and hairlines, and the prose sits
directly on the glass at a reading width.

**Not yet taken from the thread:** v3's bottom-centre command carousel (lenses:
Blocks · Plugins · Theme · Search · AI) and the 5-palette theme factory. The
`/component` picker is the closest thing to a lens the surface has today.

## 2026-09-01 — The notes editor opens as a transparent overlay

**Why:** the editor was a card in the dock row, which is the wrong shape for
writing. It now takes the viewport, with the shell's visuals running underneath.

**What changed:**

- `PluginDock` gained `overlay:true`. An overlay takes the whole viewport rather
  than a slot, so it neither narrows the row nor is narrowed by it, and row
  pressure never evicts it. `--dock-count` and slot assignment skip it;
  `dock-any-open` still counts it, because that describes what is open rather
  than what the row is dividing.
- `.dock-panel.dock-overlay` in the shell paints nothing — `inset:0` alone, since
  re-stating `right`/`width` there would undo the edge `inset` just set.
- The iframe now says how it is framed: `/canvas?surface=editor&chrome=overlay`.
  The guest cannot see this for itself, and it changes what it has to paint.
- In `base44-canvas`, `body.embedded-surface` drops the `bg-background` those
  components carry for the standalone app — the host has always owned the
  backdrop. Under `body.chrome-overlay` the chrome and the prose column get a
  **blur** rather than a fill, so the visuals still read through the margins.
- `PresenceIndicators` is now opt-in (`showPresence`). Three hardcoded drifting
  collaborators read as decoration in the full app; over a transparent overlay
  they read as a claim that other people are in the document.

**Escape hatch:** a full-bleed panel that covered its own toggle would have no
way out. `#topR` (z-index 42) is deliberately stacked above the panel (26) and is
exempt from the idle fade, so the tool cluster stays reachable while it is open.

**Preview embeds fixed alongside:** the card was framing the vault's `dev=1`
workbench — prop editors, a component switcher — which is right for a developer
opening a tab and wrong inside a note. It now asks for `embed=1&theme=dark`,
which renders the component alone and posts its painted size back, so the frame
is sized from the component instead of a fixed guess.

## 2026-09-01 — Canvas can embed Component Vault previews

**Why:** the Canvas surface listed `/history` and `/music` slash commands that
only posted a `BASE44_CANVAS_REQUEST_SEARCH` message into the void — no host
had ever implemented the other half, so the picker sat on "QUERYING…" forever.

**What changed:**

- `services/component_vault_service.py` talks to the local HistoryKit
  Component Vault over its MCP Streamable HTTP transport (`tools/call
  search_components`). The transport is stateless, so there is no handshake or
  session to keep. Preview URLs are **rebuilt from settings**, not passed
  through from the tool response: the browser frames that URL, so its origin
  has to be ours to choose.
- `GET /api/components/search?q=&limit=` exposes it, projected down to what a
  picker row and a preview card render — no source, imports or audit detail.
  An absent vault is a `503`, since it is a developer-machine service.
- `static/gallery/canvas-plugin.js` gained `search` / `searchDismiss` intents.
  The **shell** fetches and puts the reply on the scene; the surface never
  reaches outside the note, which is the same rule every other plugin follows.
  `/history` and `/music` are answered `unsupported` rather than left hanging.
- Canvas (in `base44-canvas`) gained a `/component` command, a result picker,
  and `componentEmbed.js` — a registered Quill block embed whose fields live on
  `data-*` attributes so the card survives being stored as HTML and parsed back.
  Its iframe gets `allow-scripts allow-same-origin`, which is safe *because* the
  vault is a different origin than the host; a same-origin preview URL would be
  a sandbox escape, so that case falls back to the strict form.
- Fixed alongside: the slash menu's outside-click dismissal listened on the
  bubble phase, so a click that re-rendered the menu had already detached the
  clicked node and `closest()` read it as "outside". Nothing noticed while every
  command closed the menu anyway; `/component` is the first that stays open.

**Config:** `COMPONENT_VAULT_MCP_URL` (default `http://127.0.0.1:8766/mcp`),
`COMPONENT_VAULT_PREVIEW_URL` (default `http://127.0.0.1:4174`). Neither exists
on a hosted deploy, where the command degrades to an unreachable-vault message.

**Rebuild after changing Canvas:** `npm run build:canvas` re-vendors
`static/canvas/` from `~/Documents/GitHub/base44-canvas`.

## 2026-06-14 — Audio features moved from Spotify to ReccoBeats

**Why:** Spotify deprecated `GET /audio-features` on 2024-11-27 and now returns
`403` for this app, which made the entire Focus filter (BPM / energy / focus
scoring) non-functional.

**What changed:**

- New provider abstraction `services/audio_feature_provider.py`
  (`AudioFeatureProvider` Protocol). `FocusService` depends only on it, so the
  source is swappable.
- New `services/reccobeats_service.py` (`ReccoBeatsProvider`). Keyless API at
  `https://api.reccobeats.com/v1`. Two-step lookup (resolve Spotify IDs →
  ReccoBeats track objects, then fetch features per ReccoBeats UUID) because the
  features endpoint is **not** keyed by Spotify ID. Bounded concurrency,
  `429`/`Retry-After` backoff, 24h TTL cache including negative results.
- `FocusService` reworked to use the provider; surfaces **coverage**
  (`features_covered`/`features_total`) and **`no_data_tracks`** instead of
  dropping tracks or faking zero scores. `focus_score()`, `matches_profile()`,
  and `focus_profile.json` are unchanged (ReccoBeats ranges match Spotify's).
- `AudioFeatures` gained a `source` tag (`"reccobeats"` today). `/api/focus/*`
  HTTP signatures unchanged; responses gained additive coverage/no-data fields.
- Frontend focus panel shows coverage and a distinct "no audio data" state.
- Full design + the planned ReccoBeats + Essentia hybrid in
  [`docs/audio-features.md`](docs/audio-features.md).

**No remaining runtime dependency on Spotify's `/audio-features`.** Spotify is
still used only for track *lists* (playlists, top tracks) and OAuth.

**Config:** `RECCOBEATS_API_BASE_URL` (default
`https://api.reccobeats.com/v1`). No API key required.

### Known pre-existing test issue (unrelated to this change)

`tests/test_main.py::test_search_accepts_album_and_year_hints` fails on `main`
too: it asserts `MusicService.search` is called with `expected_album`/
`expected_year` as **kwargs**, but the `/api/search` route passes them
positionally. Either the route or the test should be reconciled — out of scope
for the ReccoBeats work.
