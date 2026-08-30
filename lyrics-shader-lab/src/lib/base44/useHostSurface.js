import { useEffect, useState, useSyncExternalStore } from "react";

import { hostSurface } from "./hostSurface";

/**
 * React binding for the host bridge.
 *
 * Hooks are deliberately separated by cadence:
 *   useHostScene()  re-renders when resolved scene state changes (rare)
 *   useActiveLine() re-renders when the active lyric line changes (per line)
 *   useHostConnection() re-renders only when the iframe handshake changes
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

export function useHostConnection() {
  return useSyncExternalStore(
    hostSurface.onConnectionChange,
    () => hostSurface.connected,
    () => false,
  );
}

export function useHostEvent(name, handler) {
  useEffect(() => hostSurface.onEvent(name, handler), [name, handler]);
}

export const intent = (name, payload) => hostSurface.intent(name, payload);
export const request = (name, payload, options) => hostSurface.request(name, payload, options);
export const emitHostEvent = (name, payload) => hostSurface.event(name, payload);
