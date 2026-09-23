/**
 * Phase · Field — Boot sequence and environment toggle
 *
 * Runs after all gallery scripts have loaded. Detects the environment
 * (prod/dev) and applies the appropriate surface visibility rules.
 *
 * Prod mode: only music-related surfaces visible (lyrics, focus timer, EQ, Spotify,
 *            Apple Music, video, translations, wallpaper picker).
 * Dev mode:  all surfaces available including Base44 plugins, canvas, apps.
 *
 * Override at runtime:
 *   ?mode=dev   — force dev mode on any deployment
 *   ?mode=prod  — force prod mode (default on Vercel)
 */
(function boot() {
  'use strict';

  const env = PhaseState.get('env');

  /* ── Surfaces hidden in prod mode ── */
  const DEV_ONLY_PANELS = [
    'canvasEditor',           // Notes editor
    'pikaVoiceProfilePanel',  // Voice profile (under development)
    'appsPanel',              // Apps launcher
    'appSurfacePanel',        // App surface overlay
  ];

  /* ── Dock menu buttons hidden in prod mode ── */
  const DEV_ONLY_BUTTONS = [
    'canvasToggle',           // Notes toggle
    'appsBtn',                // Apps button
    'pikaVoiceProfileBtn',    // Voice profile button
  ];

  if (env === 'prod') {
    /* Tag the body for CSS hooks — CSS rules hide dev-only elements.
       Using data-env rather than the `hidden` attribute so that
       PluginDock can still programmatically open panels if needed. */
    document.body.dataset.env = 'prod';
  } else {
    document.body.dataset.env = 'dev';

    /* In dev mode, show the apps button (hidden by default in HTML) */
    const appsBtn = document.getElementById('appsBtn');
    if (appsBtn) appsBtn.removeAttribute('hidden');
  }

  /* Expose a runtime toggle for development convenience */
  window.__phaseEnv = {
    current: env,
    switchTo(newEnv) {
      const url = new URL(window.location);
      url.searchParams.set('mode', newEnv);
      window.location.href = url.toString();
    },
  };

  console.info(`Phase · Field booted in ${env} mode`);
})();
