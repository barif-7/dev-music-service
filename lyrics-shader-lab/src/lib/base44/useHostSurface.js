import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { hostSurface } from "./hostSurface";

/**
 * React binding for the host bridge.
 *
 * Two hooks, deliberately separate:
 *   useHostScene()  re-renders when resolved scene state changes (rare)
 *   useActiveLine() re-renders when the active lyric line changes (per line)
 *
 * Per-frame values are never exposed as state. Read hostSurface.uniforms or
 * hostSurface.frame directly inside a render loop.
 */

export function useHostScene() {
  const [scene, setScene] = useState(hostSurface.scene);
  useEffect(() => {
    const stopListening = hostSurface.start();
    const unsubscribe = hostSurface.onScene(setScene);
    return () => { unsubscribe(); stopListening(); };
  }, []);
  return scene;
}

export function useActiveLine() {
  return useSyncExternalStore(
    hostSurface.onActiveChange,
    () => hostSurface.frame.active,
    () => -1,
  );
}

/**
 * Opt-in 20 Hz playback time for UI that genuinely needs intra-line updates.
 * The shader uniforms remain mutable and allocation-free at the host frame
 * rate; React only joins the clock while word glow or the timeline is visible.
 */
export function useHostFrameTime(enabled) {
  const subscribe = useCallback(
    (notify) => enabled ? hostSurface.onFrameTick(notify) : () => {},
    [enabled],
  );
  const snapshot = useCallback(
    () => enabled ? hostSurface.frame.tick : 0,
    [enabled],
  );
  useSyncExternalStore(subscribe, snapshot, () => 0);
  return hostSurface.frame.time;
}

export const intent = (name, payload) => hostSurface.intent(name, payload);
