/**
 * Phase · Field — Centralized State Module
 *
 * Single source of truth for application state. All state mutations go through
 * set() which notifies subscribers. Existing code in app.js still uses a local
 * `state` object for backward compatibility; new code should use PhaseState.
 *
 * Usage:
 *   PhaseState.set('index', 3);            // triggers 'index' subscribers
 *   PhaseState.get('mode');                // 'immersive'
 *   PhaseState.on('index', (val) => {});   // subscribe
 *   PhaseState.once('ready', () => {});    // one-time listener
 */
const PhaseState = (() => {
  const _values = {
    /* ── Wallpaper / shader ── */
    index: 0,               // current wallpaper index in ALTS
    mode: 'immersive',      // 'immersive' | 'grid'

    /* ── UI mode flags ── */
    gridReady: false,        // grid tiles rendered
    crossfading: false,      // hero crossfade in progress
    transitioning: false,    // wallpaper transition in progress
    infoOpen: false,         // track info panel visible
    idle: false,             // chrome auto-hidden
    searchOpen: false,       // music search modal open

    /* ── Transport ── */
    playing: false,          // audio currently playing
    progress: 0,             // playback position 0..1
    track: null,             // { title, artist, album, art, duration } or null
    playlist: null,          // ordered-set snapshot (metadata only)
    queueSize: 0,            // total tracks in the active playing set
    nextTrack: null,         // next track selected by the queue policy

    /* ── Environment ── */
    env: 'prod',             // 'prod' | 'dev' — set by init()
  };

  const _subs = {};
  let _batchDepth = 0;
  const _pending = new Set();

  function _emit(key) {
    if (_batchDepth > 0) { _pending.add(key); return; }
    const val = _values[key];
    (_subs[key] || []).forEach(fn => { try { fn(val, key); } catch (e) { console.error(e); } });
    (_subs['*'] || []).forEach(fn => { try { fn(val, key); } catch (e) { console.error(e); } });
  }

  return {
    /** Set a state value and notify subscribers. */
    set(key, value) {
      if (_values[key] === value) return;
      _values[key] = value;
      _emit(key);
    },

    /** Get a state value. */
    get(key) {
      return _values[key];
    },

    /** Subscribe to changes on a key (or '*' for all changes). Returns unsubscribe fn. */
    on(key, fn) {
      if (!_subs[key]) _subs[key] = [];
      _subs[key].push(fn);
      return () => {
        const idx = _subs[key].indexOf(fn);
        if (idx >= 0) _subs[key].splice(idx, 1);
      };
    },

    /** One-time listener — auto-unsubscribes after first call. */
    once(key, fn) {
      const off = this.on(key, (val, k) => { off(); fn(val, k); });
      return off;
    },

    /** Batch multiple set() calls; subscribers fire once at the end. */
    batch(fn) {
      _batchDepth++;
      try { fn(); } finally {
        _batchDepth--;
        if (_batchDepth === 0) {
          const keys = [..._pending];
          _pending.clear();
          keys.forEach(k => _emit(k));
        }
      }
    },

    /** Snapshot all current values (for debugging). */
    snapshot() {
      return { ..._values };
    },

    /** Detect environment from URL params or build config. */
    init() {
      const params = new URLSearchParams(window.location.search);
      const env = params.get('mode') === 'dev' ? 'dev' : 'prod';
      _values.env = env;
      _emit('env');
      return env;
    },

    /** Whether the app is running in dev mode. */
    get isDev() { return _values.env === 'dev'; },

    /** Whether the app is running in prod mode. */
    get isProd() { return _values.env === 'prod'; },
  };
})();

/* Auto-detect environment on load. */
PhaseState.init();
