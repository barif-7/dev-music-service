/**
 * Base44 host bridge — guest side.
 *
 * The mirror of static/gallery/base44-plugin.js. It exists so a Base44 export
 * can be embedded without knowing anything about its host: it receives resolved
 * scene state, a packed uniform frame, and sends named intents back.
 *
 * The split matters for performance. Scene messages are rare and drive React
 * state. Frame messages arrive once per animation frame and deliberately do NOT
 * touch React — they mutate a stable uniforms object that the renderer reads
 * directly, so a 60 Hz feed causes zero re-renders. Only a change of active
 * lyric line is promoted to React.
 */

const NS = "base44";
const PROTOCOL = 1;

export function createHostSurface() {
  const surface = {
    connected: false,
    scene: null,
    /* Mutated in place every frame; identity is stable so the renderer can hold
       a reference and React never sees a new object. */
    uniforms: {},
    frame: { time: 0, active: -1, playing: false, mood: "calm", level: 0 },
    _keys: [],
    _sceneSubs: new Set(),
    _activeSubs: new Set(),
  };

  const emit = (subs, value) => {
    for (const fn of subs) {
      try { fn(value); } catch (error) { console.warn("[base44] subscriber", error); }
    }
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

  const receive = (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.p !== NS || data.v !== PROTOCOL) return;

    // The host asks us to re-announce after a reload; announcing twice is safe.
    if (data.t === "probe") {
      window.parent.postMessage({ p: NS, v: PROTOCOL, t: "ready" }, window.location.origin);
      return;
    }
    if (data.t === "init") {
      surface._keys = Array.isArray(data.uniformKeys) ? data.uniformKeys : [];
      surface.connected = true;
      return;
    }
    if (data.t === "scene") {
      surface.scene = data;
      emit(surface._sceneSubs, data);
      return;
    }
    if (data.t === "frame") {
      const previousActive = surface.frame.active;
      surface.frame.time = data.time || 0;
      surface.frame.active = data.active ?? -1;
      surface.frame.playing = Boolean(data.playing);
      surface.frame.mood = data.mood || "calm";
      surface.frame.level = data.level || 0;
      if (data.u) unpack(data.u);
      // Promote to React only when the line actually changes.
      if (surface.frame.active !== previousActive) emit(surface._activeSubs, surface.frame.active);
    }
  };

  surface.intent = (name, payload) => {
    window.parent.postMessage(
      { p: NS, v: PROTOCOL, t: "intent", name, payload },
      window.location.origin,
    );
  };
  surface.onScene = (fn) => { surface._sceneSubs.add(fn); return () => surface._sceneSubs.delete(fn); };
  surface.onActiveChange = (fn) => { surface._activeSubs.add(fn); return () => surface._activeSubs.delete(fn); };
  surface.start = () => {
    window.addEventListener("message", receive);
    window.parent.postMessage({ p: NS, v: PROTOCOL, t: "ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  };

  return surface;
}

/** The surface is a singleton per document — one host, one connection. */
export const hostSurface = createHostSurface();
