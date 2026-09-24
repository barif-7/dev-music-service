# Phase plugin features

The floating dock is the host view. Every `PluginDock.register` input passes
through `PhasePluginFeature.normalize`, including existing panels. Keep this
boundary when adding or changing features rather than giving each feature
its own viewport geometry.

```js
const feature = PluginDock.register({
  id:'example',
  el:panel,                  // host container; view content lives inside it
  toggle:button,
  layout:{ mode:'row', scroll:'auto' },
  config:projectState(),     // resolved presentation data + action callbacks
  render:renderView,         // renderView(config); no dock or service access
  onOpen:refresh,            // controller effects stay outside the view
});

feature.updateConfig(projectState()); // replaces the entire config snapshot
feature.open();
```

- **Dock host:** owns outer width, height, position, stacking, overflow policy,
  open state, focus and accessibility. `layout.mode` is `row` or `overlay`;
  `layout.scroll` is `auto` (default) or `hidden`. Layout is set at registration,
  separately from feature config. `updateConfig` never changes it or opens a panel.
- **Controller:** owns state, storage, requests, timers and playback. Projects
  presentation data and supplies callbacks for user actions.
- **View:** accepts one config object, renders its content and calls supplied
  callbacks. Owns internal layout only, using the space provided by the host;
  no outer fixed positioning, viewport dimensions or dock mutations.

Config is a shallow copied, frozen object; controllers must treat nested data
as immutable snapshots too. Rendering runs once at registration and on each
`updateConfig`, including while closed. Lifecycle callbacks run only on an
open/close transition.

`pomodoro.js` and `pomodoro-view.js` are the native example. The view is bound
to its content DOM once, then consumes resolved labels, control states, tracks
and actions. Track arrays remain stable between session changes so timer ticks
preserve list DOM and scroll state.

Existing registrations keep working: `overlay:true` maps to overlay layout;
`host` neutralizes a former modal wrapper; `showClass` mirrors a legacy open
class. Older native controllers can adopt config rendering when touched;
they are not all converted to separate views. Embedded apps already use
host-projected `scene` objects as their config and named intents as actions,
so their `Base44AppPlugin` transport is unchanged.

All outer dock geometry lives in `static/css/dock.css`, with mobile tokens in
`responsive.css`. Modal selectors exclude dock panels and their wrappers;
feature selectors must not reintroduce competing geometry. Run
`node scripts/audit-plugin-dock.mjs` for real browser bounds, stacking,
visibility and config-contract checks, and `node scripts/audit-pomodoro.mjs`
for timer/playback behavior.
