# Handoff Notes

Running context for whoever picks this up next. Newest first.

## Packaging

- **`pyproject.toml` is the source of truth for dependencies**, not
  `requirements.txt`. Use `uv` (`uv run …`, `uv run --extra dev pytest`).
- Dev tooling (pytest, flake8, bandit) lives in the `dev` optional-dependency
  group.

## 2026-09-24 — Finish Qwen's translation-cache and benchmark follow-up

Recovered Qwen session `947b410e-12a2-4e0d-b1d5-d1f5d071bfea` from September 23.
The user selected model comparisons, live translation-cache integration, and
the pending local changes; multi-node scheduling was deferred. The follow-up
is submitted on new branches for PR review, as requested September 24.

- `LyricsService` now reads and writes SQLite beneath its memory cache in the
  eager, background-fill, and playback-window paths. Per-line source/timing and
  policy fingerprints let overlapping windows share translations while changed
  input causes a miss. Plain-lyric synthetic timing uses the stable line index
  consistently across the eager and window paths.
- Cache initialization/read/write failures leave translation available through
  memory. Tests exercise actual SQLite persistence, a fresh Python process,
  overlapping windows, changed text/timing/options/track identity, partial
  upstream output, and unwritable/corrupt storage.
- Preserved and completed the pending explicit frontend-origin default and
  iPad client. Replaced a vacuous stream-header test with real proxy assertions
  for local and deployed origins. Added the client's missing Info.plist and
  ignored Xcode user state. The unsigned simulator build succeeds for arm64 and
  x86_64; physical-device playback and AirPlay remain unverified.
- Qwen's background comparison already finished 32 jobs. DeepSeek accepted 8/8;
  Qwen 27B accepted 2 then hit six quota errors; Qwen Flash hit eight quota
  errors; Kimi K3 hit eight provider URL errors. The gateway report preserves
  all terminal results and distinguishes availability from coding quality.
  No provider billing restriction or routing policy was changed.

Validation: full Python suite and focused regression checks, flake8, frontend
lint, Bandit, both Python entry-point imports, and the iPad simulator build.
The gateway's 56 offline tests pass. See `backlog.md` for remaining work,
including provider availability, repeated benchmarks, shared reservations,
durable job execution, translation retention, and device verification.

## 2026-09-13 — Restore audio and muted video resolution

**Mac mini follow-up:** SSH access restored; applied the same targeted resolver
fix to `/Users/struggling/.phase/app` and restarted `com.phase.music-service`
on port 8010. Its LaunchAgent already used the project venv and Homebrew PATH.
Backup: `/Users/struggling/.phase/backups/playback-20260913-070444`.
Chrome verified audio playback, seeking past 80 seconds, and 854×480 video
through `https://phase.tail4752f5.ts.net:8443`. 151 service/API checks passed
with 3 skips and 3 Focus tests deselected; an unrelated Focus-scoring assertion
also fails in the backed-up test. Details are recorded on the mini in
`docs/playback-repair-2026-09-13.md`.

Playback of `WAd7VEWCWOI` (SEM DEMORA, Super Slowed) returned 403 for ordinary
and open-ended Range requests, even though a bounded 1 MiB probe returned 206.
The old forced Android clients yielded unusable full-stream URLs. Both audio
and video logged these rejections; a small range probe alone hid the failure.

- Updated yt-dlp from 2026.3.17 to 2026.8.19 with its `default` extra, which
  installs the matching EJS solver; removed the forced player-client list.
- `config.ytdlp_options()` passes `js_runtimes` into every Python extraction.
  Setting `YTDLP_JS_RUNTIME` in the environment alone had no effect in yt-dlp.
- The muted overlay can use a video-only MP4 when a progressive A/V file is
  unavailable. The audio fallback still requires audio, with separate cache
  entries to prevent a muted overlay source from becoming silent playback.
- `run.sh` uses `uv run --locked`. The local LaunchAgent now runs the project
  `.venv/bin/python` instead of global Python and includes Homebrew in `PATH`
  so Node is available. The previous plist is backed up at
  `/private/tmp/phase-music-launchagent-before-playback-fix.plist`.

Validation: 248 pytest passed, 7 skipped; both Vercel entry points import;
the failing audio now returns 200 without Range, and video `fNg2wdawbiQ`
returns its complete 10,515,848-byte H.264 MP4 with an open-ended Range request.
The LaunchAgent was restarted on port 8000 with the corrected environment.
An actual Chrome run through `loadTrack` on port 8000 confirmed playback past
2 seconds, seeking past 80 seconds, and the 854×480 video overlay playing in
sync with no media errors (three successful 206 responses).

## 2026-09-13 — Every local app is registered, and each one carries its export store

**Why:** `/component` browsed four hand-listed apps, three of which were not
running, so in practice it browsed one. Meanwhile 24 Base44 surfaces were
already vendored and served by this shell, and the vault held the components
exported from them — with no link between the two.

### The link already existed in the catalogue

`plugins.json` names a `repo` per surface, `apps.json` in the export folder maps
that repo to Base44's own `appId`, and the vault tags every component with the
project it was ingested from. Joining those three is `services/base44_index.py`.

**The app id is the join key, not the app name.** OrbitJobs is why: two exports,
both called "OrbitJobs", 9 components and 13. Matching on the name merges them
into one 22-component list, which is the same undifferentiated pile the picker
was built to get rid of. Matching on the id keeps them apart.

Two catalogue entries were not joined and now are. `lyrics-shader-lab` had no
`repo` at all, and `canvas` points at `base44-canvas` — its build checkout,
which is not its export bucket. Both got a **`base44Repo`** field: `repo` says
where a surface is *built* from and is read by `build-surface.mjs`, so it could
not be repointed. They are genuinely different facts about one app.

A surface can also be known by two names — Base44 calls it "Lyric Shader Lab"
and the catalogue calls it "Lyrics Shader Lab". Both are matched on, because
searching an app by its own name and not finding it is indefensible.

### Registration has two tiers

- A **mounted** app is a compiled bundle this shell serves and can frame. That
  is what most of the Base44 surfaces are; there is no process behind them, and
  the tier exists because pretending otherwise meant they could never register.
  They are registered from the catalogue rather than listed by hand, so
  vendoring a surface is now all it takes to make it browsable.
- A **service** app additionally has a local backend, so its components can be
  driven rather than only shown. Those four are still spelled out by hand in
  `api/live_component_bindings.py` with the operations they actually back.

**A backend going down no longer removes the app.** It drops to the mounted
tier: the bundle still frames and the export store still browses, and only the
components that would have forwarded to a dead API are hidden. Losing 60
browsable StillShot components because its photo indexer is stopped was the
behaviour that made this obvious.

A surface behind an unset feature flag is left out entirely — its route 404s,
so listing it offers a dead end. That is why `semi` is absent.

### The store

`/api/components/search?kind=reusable&app=<id>` returns the vault components
exported from that app, ranked by the vault's reuse score. **Scoped to one app
on purpose**: the vault holds 782 distinct components across every export ever
ingested, and handing that back unscoped is exactly what was replaced. The app
has to be named, running, and carry a Base44 app id.

The picker grew a third view, **Reusable**, which appears only once an app is
chosen — offering it earlier would be offering the unscoped index again. Live
components stay interactive; vault entries are inert previews framed from the
vault's own origin, which is why they keep the stricter cross-origin sandbox
rather than the app wrapper's.

**The reuse score ranks the store but is not in it.** It stays server-side with
the rest of the audit detail, as `test_source_and_audit_detail_are_not_forwarded`
has required since the vault endpoint was written; the ordering happens before
the projection drops it.

**One vault client, in `services/component_vault_service`.** It used to be a
private singleton in `main.py`, which the routers cannot import without a cycle.

### The palette had to learn to stay on screen

Growing the app list from 4 rows to 22 broke the picker. It is fixed at the
caret and only its horizontal side was ever clamped, so a caret in the lower
third of a note put the search box and every result below the fold — the header
was all you got, with no way to reach the rest.

It now measures itself and flips above the caret when it will not fit below,
capping the panel on whichever side it lands so the result list scrolls inside
it rather than the panel running off the screen. The service view is a flex
column for that reason: capping the height without letting the list shrink
would just clip the footer instead. Measured rather than guessed, because the
height depends on which view is open and how many rows came back.

`npm run audit:design` drives it from a caret pushed to the bottom of a note
and asserts the panel is inside the viewport with its search box reachable.
Verified it fails: dropping the computed placement reports `880–1283 of 900`
and `input off screen`. 20 checks.

### Gotcha worth keeping

The fetch size and the display limit are different numbers. Passing the display
limit down to the vault caps `total_matches` at the page size — Canvas reported
"10 of 10" when it has 103. A bucket is fetched whole, then ranked, then sliced.

### Verified

241 pytest passed, 18 design-audit checks passed. Driven in a browser: 22 apps
listed where there was 1, StillShot present and marked offline, picking an app
narrowing to it, its 29 exported components listed, a query narrowing within
them, and one embedded as a vault preview. The audit's embed check now happens
to land on a mounted app (Aura Vision), so both tiers are covered.

**Left open:** the three service backends (canvas `:39445`, stillshot `:8788`,
vertexflow `:8795`) are still down, so their drivable components are unproven
against a live API. `/favicon.ico` still 404s.

## 2026-09-12 — Vocabulary is its own local service; `/component` browses live apps

Two threads, both landing in the same session. Written up together because the
second one exists to put the first one's surface inside a note.

### Vocabulary runs beside the app, not inside it

**Why:** the learning loop wanted its own storage, its own schedule arithmetic
and an optional model call, none of which belong in the music shell's process.
It follows the CaptionLocalizer pattern already in `plugins/`: a separate
FastAPI process, a same-origin adapter, and a surface the shell can frame.

- **`plugins/vocabulary/`** — FastAPI on `127.0.0.1:8796`
  (`sh scripts/run-vocabulary.sh`, `plugins/vocabulary/manifest.json`), SQLite at
  `~/Library/Application Support/Phase/vocabulary.sqlite3`.
- **Two schedules per word.** Recognition (see the word, recall the meaning) and
  production (see the meaning, recall the word) advance independently, because
  understanding a word and being able to reach for it are different things and
  they decay at different rates.
- **A word with no meaning is not a card.** It waits in an inbox instead, so a
  capture made mid-song does not become a review prompt with nothing to recall.
- **`api/vocabulary.py`** proxies `/api/vocabulary/*` to it, so the browser only
  ever talks to our origin. The plugin itself refuses cross-origin writes
  outright rather than relying on permissive CORS.
- **Ollama is optional.** Capture, edit, review and export all work with it
  stopped; only the meaning suggestion needs it.

**The lookup had never actually worked.** It returned
`{"state":"unavailable"}` against a healthy Ollama with the model loaded, and
the `except` swallowed the reason. Ollama compiles the `format` schema into a
GBNF grammar, and llama.cpp expands a length bound into that many repetition
rules — `Definition.meaning`'s `maxLength: 3000` alone builds a grammar large
enough to kill the model runner before it emits a token, which surfaces as a
500 `"model runner has unexpectedly stopped"`. `lookup._grammar_safe` strips
the four length/count keywords out of the schema on the way to Ollama; the
bounds still hold, because the response is validated against `Definition`
coming back.

Worth knowing when adding a field: **a `max_length` on a `Definition` field is
free, a length bound in the wire schema is not.** Two tests keep the split
honest — one asserts the request carries no bounds, the other that an
over-length answer is still rejected. The first one fails if the raw
`model_json_schema()` goes back on the request.

The lookup tests mock `httpx`, which is why this survived a green suite: a mock
accepts any `format` at all. It only shows up against a real Ollama.

### `/component` browses running apps, not a file index

**Why:** the picker listed every `.jsx` the vault had indexed, duplicates and
all, and nothing in that list could do anything — they were source files, not
running components.

- **`/api/components/search` is now the live registry.** The vault's source
  search moved to **`/api/components/source-search`**; same service, same
  shape, new path.
- **Registration is explicit** (`api/live_component_bindings.py`): an app, a
  bundle, a health probe, and named operations over its real API. No JSX
  scanning and no synthesised handlers, so a component in the list is one
  someone decided to expose.
- **Availability needs both halves** — the compiled bundle on disk *and* the
  backing service answering its health probe. An app that is not running does
  not appear, which is what keeps the duplicates out.
- **One pooled proxy per app** (`services/live_components.py`) is shared by the
  embeds and the API adapters, so a note with four cards in it does not open
  four connection pools.
- The picker has **Active apps** and **Components** views; choosing an app
  narrows to its registered components, and an embed mounts the app's own
  compiled view against the same backend. Actions are forwarded to the real
  API, so the card shows live data.

**Embeds report their height.** Canvas sizes a component card from a height the
framed page posts on `cv-embed-size`, falling back to a preview-shaped 280px.
The vault's embed mode measures what it painted; a mounted *app* view has no
content height to measure — it fills what it is given — so
`static/components/host.js` asks for a viewport-shaped card instead. Without
it the app view is cropped mid-content at 280px.

**`npm run audit:design` covers the live embed now**, not the vault preview —
the flow it used to drive no longer exists on that route. Its two component
checks assert the card outgrew the 280px default and that the wrapper, which is
deliberately granted same-origin and forms so the mounted app works, is still
scoped to our own `/components/<app>/<key>` and cannot navigate the top window.
Verified it fails: commenting out the height report turns the first one red
with `still default 280px`. 18 checks.

The audit drove the picker by waiting on a row selector, which matched the app
row still on screen and fired the second Enter before the component list
replaced it. It waits on the picker's own `ENTER to browse app` /
`ENTER to embed` hint instead.

### Verified

237 pytest passed, 18 design-audit checks passed, and the browser flows driven
end to end: a real `llama3.2` lookup filling the editor, save, recall with a
rating, the library, and a second tab refreshing off the `phase-vocabulary`
BroadcastChannel when the first one saves.

**Left open:** the model fills `collocations` with paraphrases rather than
common phrases, and leaves `translation` empty on a cross-language lookup even
though the prompt asks for one. Both are answer quality from `llama3.2`, not
wiring — worth a prompt pass or a larger model, neither attempted here.
`/favicon.ico` still 404s, as it has since 2026-09-01.

## 2026-09-05 — Frontend refactor: CSS extraction, state module, env toggle

**What changed:** the monolithic `static/index.html` (1736 lines with 1129
lines of inline CSS) was split into modular files following the design audit
in `docs/frontend-redesign.md`.

- **CSS** extracted into 6 files under `static/css/`: `main.css` (variables,
  resets, stage, lyric reader), `chrome.css` (auto-hide chrome, wordmark,
  tools, audio, caption, dots, zones, nowbar, share), `dock.css` (dock panel
  system, overlays, EQ, apps launcher), `grid.css` (wallpaper grid mode),
  `search.css` (search overlay, Spotify/Focus/Apple Music/translation/video
  modals), `responsive.css` (all media queries, loaded last).
- **`static/js/state.js`** — centralized state module (`PhaseState` global)
  with observable set/get/on/batch pattern. Existing `state` object in
  `app.js` remains for backward compat; new code should use `PhaseState`.
- **`static/js/init.js`** — boot sequence with environment detection.
  `?mode=dev` query param enables dev mode; default is prod. In prod mode,
  dev-only surfaces (Canvas, Apps, Clock) are hidden via CSS
  (`body[data-env="prod"]`).
- **Chrome behavior** — idle timer increased to 4s, idle fades to 0.15
  opacity (not fully hidden), edge zones narrowed to 10vw with 80ms debounce,
  wallpaper dots show name tooltips on hover.
- **Vercel build** — `scripts/build-vercel-frontend.mjs` now removes non-music
  surface directories from `dist/static/`. Only `gallery/`, `lyrics-shader-lab/`,
  `canvas/`, `css/`, `js/` survive the prod build.
- **Apps launcher** — category taxonomy added to `plugins.json`. In dev mode,
  the launcher shows all generic-host plugins with category filter tabs and
  archived badges. In prod, only music-related plugins appear.

**Canvas chrome fix:** the canvas plugin's chrome in `plugins.json` was
`opacity: 0.995` (near-opaque), which conflicted with the design audit's
expectation of semi-transparent glass. Updated to `opacity: 0.55` to match
the CSS fallback and the "liquid glass" design direction.

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
