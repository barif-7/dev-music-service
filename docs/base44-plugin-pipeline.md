# Base44 Plugin Pipeline

How a Base44 app becomes an embedded surface in this application.

A Base44 export is a whole SPA — its own router, auth, storage and backend.
Embedding one directly makes it a second source of truth: it derives its own
state, keeps its own storage, and reaches back into the host's DOM. This
pipeline normalises any such export into a **plugin**: a view that derives
nothing, stores nothing, and never touches the host.

---

## 1. The shape of it

```
   BASE44 CLOUD                LOCAL REPO                 THIS APP
  ┌──────────────┐          ┌──────────────┐          ┌──────────────────┐
  │  app source  │  eject   │  vite build  │  vendor  │  static/<name>/  │
  │              │ ───────► │  --base=/…/  │ ───────► │  index.html+js   │
  └──────────────┘          └──────────────┘          └────────┬─────────┘
                                                               │ GET /<name>
                                                               ▼
                                              ┌────────────────────────────┐
                                              │  <iframe> in the shell     │
                                              │  X-Frame-Options SAMEORIGIN│
                                              └────────────────────────────┘
```

Acquisition and embedding are separate stages. The build is vendored into
`static/` because the FastAPI app has no Node step in its deploy path.

---

## 2. Runtime contract

The protocol has snapshot, continuous-frame, event and request channels. **The
host owns state; the surface renders it and asks for changes.**

```
        HOST  (static/gallery/base44-plugin.js)      SURFACE  (hostSurface.js)
        ────────────────────────────────────────     ────────────────────────
                                                        mount
              ◄───────────── ready ──────────────────
        ──────────────  init  ─────────────────►        learns uniform layout
        ──────────────  scene ─────────────────►        React state   (rare)
        ──────────────  frame ─────────────────►        mutable ref   (60 Hz)
        ──────────────  event ─────────────────►        named notification
              ◄───────────── event ─────────────        named notification
              ◄───────────── intent ─────────────       "please do X"
        ────────────── result ─────────────────►        optional request result
```

| message  | direction | cadence | carries |
|----------|-----------|---------|---------|
| `ready`  | surface → host | on mount, and on `probe` | nothing |
| `probe`  | host → surface | on iframe `load` | nothing |
| `init`   | host → surface | after `ready` | `surface`, `uniformKeys` |
| `scene`  | host → surface | when a revision bumps | resolved state |
| `frame`  | host → surface | once per `requestAnimationFrame` | `Float32Array` + scalars |
| `intent` | surface → host | on user action | `name`, `payload` |
| `event`  | either direction | on a discrete change | `name`, `payload` |
| `result` | host → surface | after a requested intent | `id`, `ok`, `value`/`error` |

Every message carries `p: "base44"` and `v: 1`. Both sides check origin **and**
`event.source` before reading anything.

### Why scene and frame are separate

This split is the reason a 60 Hz feed costs nothing:

```
  scene  ──►  React state   ──►  re-render        (rare: track change, prefs)
  frame  ──►  mutable object ──► renderer reads directly   (60 Hz, 0 renders)
                    │
                    └── only a change of the coarse index is promoted to React
```

Frames mutate an object with a **stable identity**. React never sees a new
reference, so it never re-renders. The renderer reads the live values inside its
own animation loop.

### The uniform layout is self-describing

The host declares the packed array's shape at handshake, as `[name, components]`
pairs. The surface unpacks generically, reusing vector arrays so nothing is
allocated per frame:

```
uniformKeys: [['uTime',1], ['uAudioEnergy',1], … ['uColorA',3], ['uColorB',3]]

Float32Array(14):  [ t │ e │ b │ c │ g │ l │ p │ w │ r g b │ r g b ]
                     0   1   2   3   4   5   6   7  8 9 10 11 12 13
```

Neither side hard-codes offsets, so the layout can change without the two
drifting apart.

### Discrete state is pushed, not polled

The player publishes track, source and lyric events at the mutation point. The
reader converts those into an immediate scene invalidation; localization and
progressive transcription therefore appear in the iframe without a polling
delay. Canvas autosaves also invalidate its scene immediately. Its active draft
is keyed by note id, so the refreshed note list does not reset the caret.

All plugin instances share one window message listener and one animation-frame
pump. `invalidate()` additionally schedules a microtask scene flush, coalescing
multiple mutations from the same JavaScript turn.

---

## 3. Anatomy of a plugin

```
  ┌─ HOST ────────────────────────────────────────────────────────┐
  │                                                               │
  │   manifest ──► Base44AppPlugin.create()                       │
  │   ├ id, surface, frame (iframe el)                            │
  │   ├ frameFloats, uniformKeys   ← packed-array shape           │
  │   ├ scene()      ── returns resolved state                    │
  │   ├ frame_(out)  ── fills the array; null = idle this tick    │
  │   ├ paused()     ── skip work while the panel is closed       │
  │   └ intents{}    ── named handlers; the host decides          │
  └───────────────────────────────────────────────────────────────┘
```

A surface with no per-frame needs sets `frameFloats: 0` and `uniformKeys: []`;
that channel then idles. **The runtime did not change to support this** — a text
editor and a shader reader use the same code.

### The two plugins today

| | `lyrics-shader-lab` | `base44-canvas` |
|---|---|---|
| surface | `reader` | `editor` |
| frame channel | 14 floats @ 60 Hz | **unused** (`frameFloats: 0`) |
| host state | lyrics, prefs, wallpaper | note collection |
| intents | `seek rate translate view background preference practice vocabulary` | `save select create remove sync` |

---

## 4. What "the host owns state" means in practice

The lyrics reader was **515 → 237 lines** because everything below moved out:

```
  BEFORE (surface did this)          AFTER (host does this)
  ─────────────────────────          ──────────────────────
  17 preference keys + storage  ──►  reader-preferences.js
  section inference             ──►  lyric-scene.js
  active-line rescan per tick   ──►  lyric-scene.js  (forward cursor)
  lyric mood analysis           ──►  lyric-scene.js
  palette + gradient maths      ──►  wallpaper-palette.js
  shader parameter resolution   ──►  lyric-scene.js
  uniform assembly              ──►  lyric-scene.js
```

The test asserts the absence: no `localStorage`, no `getActiveLyricIndex`, no
`analyzeLyricLocal`, no `getDefaultUniforms` in the surface.

> **Rule of thumb.** If the surface can compute it, the host probably already
> knows it. Two implementations of the same maths on either side of a frame
> boundary will drift — they did, and the palette softening was the proof.

---

## 5. Where plugins appear: the dock

Panels declare themselves in **markup**, so placement is pure CSS and holds
whether or not a script registers them:

```html
<aside class="dock-panel" data-dock-id="notes"> … </aside>
```

Registering only adds behaviour. (A feature-flagged panel that never registered
once lost its geometry entirely and rendered in the top-left corner. Hence the
rule.)

### Shared width, not fixed width

```
  --dock-x ┤                                                  ├ --dock-x
           │   ┌────────┐ gap ┌────────┐ gap ┌────────┐       │
           │   │ slot 2 │     │ slot 1 │     │ slot 0 │       │
           │   └────────┘     └────────┘     └────────┘       │
           └──────────────────────────────────────────────────┘
                                              ▲ dock origin (top-right)

  --dock-w-eff = clamp(--dock-w-min,
                       (100vw − 2·--dock-x − (n−1)·--dock-gap) / n,
                       --dock-w)
```

Slots run right-to-left and follow **registration order**, so an open panel never
jumps sideways when another opens. Panels narrow as more join; only when even
`--dock-w-min` will not fit does the row close the least recently opened.

| viewport | 1 open | 2 | 3 | 4 |
|---------:|-------:|--:|--:|--:|
| 1600 | 520 | 520 | 508 | 378 |
| 1280 | 520 | 520 | 401 | *evicts* |
| 1024 | 430 | 430 | *evicts* | — |

Six panels are registered: `notes · clock · spectrum · apple-music · spotify ·
focus`. The four settings panels were modal dialogs; as dock panels they are
non-modal (`role="region"`, no focus trap) because they are worth adjusting
*while* the visuals react. `videoModal` and music search stay modal, where
exclusivity is correct.

---

## 6. Adding a plugin

```
 1. SURFACE      add a page that renders one thing and derives nothing
                 resolve ?surface=<name> BEFORE the router and auth —
                 an embedded surface has no route to match, and the host
                 has already decided who the user is

 2. GUEST BRIDGE copy src/lib/base44/hostSurface.js (it is domain-free)

 3. SPLIT        lazy-load the surface and the full app separately, or the
                 surface downloads the router, auth and every page with it

 4. BUILD        vite build --base=/static/<name>/ --outDir dist-surface
                 vendor into static/<name>/

 5. ROUTE        serve index.html; 503 with the build command when missing
                 add the path to the SAMEORIGIN list in main.py

 6. HOST         a manifest for Base44AppPlugin.create(), a dock-panel in
                 markup, and a toggle
```

Steps 2–6 are mechanical. **Step 1 is not** — it means reading the app and
deciding what it should stop doing. That part does not get cheaper with a second
plugin.

---

## 7. File map

| file | lines | role |
|---|---:|---|
| `static/gallery/base44-plugin.js` | 130 | host runtime — **domain-free, reused unchanged** |
| `src/lib/base44/hostSurface.js` | 102 | guest bridge — **domain-free, copied per app** |
| `src/lib/base44/useHostSurface.js` | 34 | React binding (scene / active-line hooks) |
| `static/gallery/plugin-dock.js` | 164 | placement, stacking, capacity |
| `static/gallery/lyrics-shader-reader.js` | 171 | manifest — reader |
| `static/gallery/canvas-plugin.js` | 129 | manifest — notes editor |
| `static/gallery/lyric-scene.js` | 167 | reader's resolved state |
| `static/gallery/reader-preferences.js` | 142 | reader prefs, shell-owned |
| `static/gallery/wallpaper-palette.js` | 51 | palette maths, single implementation |

**~266 lines are reusable infrastructure; the rest is per-app glue.**

---

## 8. Known edges

- **No declarative manifest.** Plugins are JS objects. An unknown fire-and-forget
  intent is `console.warn`-ed; a requested intent also receives an error result.
  Base44's own
  `tools_permission_config` (`auto_approved_operations`, `connector_guards`) is
  the shape worth copying.
- **`frame_` is a naming workaround** — `frame` was taken by the iframe element.
- **`frameFloats` duplicates `uniformKeys`.** The sum of components *is* the
  count; deriving it would remove a drift risk.
- **Not every app is a plugin candidate.** Canvas as a whole is a three-tier
  application — own router, own auth, own backend, plus a filesystem-indexer
  dependency. Only its *editor* was extractable. A good second plugin is a
  single surface with no auth and no persistence.
