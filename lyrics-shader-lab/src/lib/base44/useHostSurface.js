import { useEffect, useState, useSyncExternalStore } from "react";

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

export const intent = (name, payload) => hostSurface.intent(name, payload);
