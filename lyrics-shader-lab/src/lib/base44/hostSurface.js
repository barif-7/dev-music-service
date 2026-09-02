/**
 * Base44 host bridge — guest side.
 *
 * The mirror of static/gallery/base44-plugin.js. It exists so a Base44 export
 * can be embedded without knowing anything about its host: it receives resolved
 * scene state, a packed uniform frame and named real-time events, and sends
 * intents or events back.
 *
 * Scene messages drive React state. Frame messages deliberately do NOT touch
 * React — they mutate stable objects that a renderer reads directly, so a
 * 60 Hz feed causes zero re-renders. Intent requests can optionally await a
 * host result without changing the fire-and-forget intent API.
 */

const NS = "base44";
const PROTOCOL = 1;
const REQUEST_TIMEOUT_MS = 5000;

export function createHostSurface() {
  const surface = {
    connected: false,
    plugin: "",
    capabilities: [],
    scene: null,
    /* Mutated in place every frame; identity is stable so the renderer can hold
       a reference and React never sees a new object. */
    uniforms: {},
    frame: { time: 0, tick: 0, active: -1, playing: false, mood: "calm", level: 0 },
    _keys: [],
    _sceneSubs: new Set(),
    _activeSubs: new Set(),
    _frameTickSubs: new Set(),
    _connectionSubs: new Set(),
    _eventSubs: new Map(),
    _pending: new Map(),
    _requestSequence: 0,
    _startRefs: 0,
  };

  const emit = (subs, value) => {
    for (const fn of subs) {
      try { fn(value); } catch (error) { console.warn("[base44] subscriber", error); }
    }
  };

  const post = (message) => {
    window.parent.postMessage({ ...message, p: NS, v: PROTOCOL }, window.location.origin);
  };

  const setConnected = (connected) => {
    if (surface.connected === connected) return;
    surface.connected = connected;
    emit(surface._connectionSubs, connected);
  };

  /* Unpack the packed float array using the layout the host declared at
     handshake. Vector slots reuse their arrays, so this allocates nothing. */
  const unpack = (floats) => {
    let offset = 0;
    for (const [key, size] of surface._keys) {
      if (size === 1) {
        surface.uniforms[key] = floats[offset++];
      } else {
        const slot = surface.uniforms[key] || (surface.uniforms[key] = new Array(size));
        for (let i = 0; i < size; i++) slot[i] = floats[offset++];
      }
    }
  };

  const receiveEvent = (data) => {
    const named = surface._eventSubs.get(data.name);
    if (named) emit(named, data.payload);
    const wildcard = surface._eventSubs.get("*");
    if (wildcard) emit(wildcard, { name: data.name, payload: data.payload });
  };

  const receiveResult = (data) => {
    const pending = surface._pending.get(data.id);
    if (!pending) return;
    surface._pending.delete(data.id);
    window.clearTimeout(pending.timeoutId);
    if (data.ok) pending.resolve(data.value);
    else pending.reject(new Error(data.error || "Host intent failed"));
  };

  const receive = (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.p !== NS || data.v !== PROTOCOL) return;

    // The host asks us to re-announce after a reload; announcing twice is safe.
    if (data.t === "probe") {
      post({ t: "ready" });
      return;
    }
    if (data.t === "init") {
      surface.plugin = String(data.plugin || "");
      surface.capabilities = Array.isArray(data.capabilities) ? [...data.capabilities] : [];
      surface._keys = Array.isArray(data.uniformKeys) ? data.uniformKeys : [];
      setConnected(true);
      return;
    }
    if (data.t === "scene") {
      surface.scene = data;
      emit(surface._sceneSubs, data);
      return;
    }
    if (data.t === "frame") {
      const previousActive = surface.frame.active;
      const previousTick = surface.frame.tick;
      for (const [key, value] of Object.entries(data)) {
        if (key === "p" || key === "v" || key === "t" || key === "u") continue;
        surface.frame[key] = value;
      }
      // Word highlighting needs a playback clock, but promoting the full 60 Hz
      // frame stream into React would undo the bridge's allocation-free design.
      // A 20 Hz tick is visually smooth and only has subscribers while a timed
      // reader feature (word glow or timeline) is visible.
      surface.frame.tick = Math.floor(surface.frame.time * 20);
      if (data.u) unpack(data.u);
      // Promote to React only when the line actually changes.
      if (surface.frame.active !== previousActive) emit(surface._activeSubs, surface.frame.active);
      if (surface.frame.tick !== previousTick) emit(surface._frameTickSubs, surface.frame.tick);
      return;
    }
    if (data.t === "event") receiveEvent(data);
    else if (data.t === "result") receiveResult(data);
  };

  surface.intent = (name, payload) => post({ t: "intent", name, payload });
  surface.request = (name, payload, { timeout = REQUEST_TIMEOUT_MS } = {}) => {
    const id = `${Date.now().toString(36)}-${++surface._requestSequence}`;
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        surface._pending.delete(id);
        reject(new Error(`Host intent timed out: ${name}`));
      }, timeout);
      surface._pending.set(id, { resolve, reject, timeoutId });
      post({ t: "intent", id, name, payload });
    });
  };
  surface.event = (name, payload) => post({ t: "event", name, payload });
  surface.onScene = (fn) => { surface._sceneSubs.add(fn); return () => surface._sceneSubs.delete(fn); };
  surface.onActiveChange = (fn) => { surface._activeSubs.add(fn); return () => surface._activeSubs.delete(fn); };
  surface.onFrameTick = (fn) => { surface._frameTickSubs.add(fn); return () => surface._frameTickSubs.delete(fn); };
  surface.onConnectionChange = (fn) => {
    surface._connectionSubs.add(fn);
    return () => surface._connectionSubs.delete(fn);
  };
  surface.onEvent = (name, fn) => {
    const subscribers = surface._eventSubs.get(name) || new Set();
    subscribers.add(fn);
    surface._eventSubs.set(name, subscribers);
    return () => {
      subscribers.delete(fn);
      if (!subscribers.size) surface._eventSubs.delete(name);
    };
  };
  surface.start = () => {
    surface._startRefs++;
    if (surface._startRefs === 1) {
      window.addEventListener("message", receive);
      post({ t: "ready", capabilities: ["event", "intent-result"] });
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      surface._startRefs = Math.max(0, surface._startRefs - 1);
      if (surface._startRefs) return;
      window.removeEventListener("message", receive);
      setConnected(false);
    };
  };

  return surface;
}

/** The surface is a singleton per document — one host, one connection. */
export const hostSurface = createHostSurface();
