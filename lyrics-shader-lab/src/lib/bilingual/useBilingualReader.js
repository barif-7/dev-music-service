import { useCallback, useEffect, useRef, useState } from "react";

import {
  TRANSLATION_STATES,
  fetchLine,
  freshRequestId,
  invalidateForTrack,
  prefetchLines,
} from "./translationService";

const EMPTY = { state: TRANSLATION_STATES.NOT_REQUESTED, text: "", translit: "", meaning: "", error: null };

export function useBilingualReader({
  trackId,
  lyrics,
  activeIndex,
  sourceLocale = "auto",
  targetLocale,
  provider,
  onAnnounce,
}) {
  const [lineState, setLineState] = useState(EMPTY);
  const contextRef = useRef(null);

  useEffect(() => {
    invalidateForTrack(trackId);
    setLineState(EMPTY);
    contextRef.current = null;
  }, [trackId]);

  useEffect(() => {
    let cancelled = false;
    const requestId = freshRequestId();
    contextRef.current = { requestId, activeIndex, targetLocale, trackId };

    const run = async () => {
      if (activeIndex < 0 || !targetLocale) {
        setLineState(EMPTY);
        return;
      }
      const line = lyrics[activeIndex];
      if (!line?.text) {
        setLineState({ ...EMPTY, state: TRANSLATION_STATES.UNAVAILABLE });
        return;
      }
      if (line.localized) {
        setLineState({ ...EMPTY, state: TRANSLATION_STATES.AVAILABLE, text: line.localized });
        return;
      }

      setLineState({ ...EMPTY, state: TRANSLATION_STATES.LOADING });
      const context = {
        trackId,
        index: activeIndex,
        text: line.text,
        sourceLocale,
        targetLocale,
        startTime: line.time,
        endTime: line.endTime,
        section: line.section,
      };
      const result = await fetchLine(provider, context);
      const current = contextRef.current;
      if (cancelled || !current || current.requestId !== requestId || current.targetLocale !== targetLocale) return;
      setLineState(result);
      if (result.state === TRANSLATION_STATES.ERROR) onAnnounce?.(result.error || "Translation unavailable.", "assertive");
      prefetchLines(provider, lyrics, activeIndex, 3, { trackId, sourceLocale, targetLocale });
    };

    run();
    return () => { cancelled = true; };
  }, [activeIndex, lyrics, onAnnounce, provider, sourceLocale, targetLocale, trackId]);

  const retry = useCallback(() => {
    if (activeIndex < 0) return;
    const line = lyrics[activeIndex];
    if (!line?.text || !targetLocale) return;
    const requestId = freshRequestId();
    contextRef.current = { requestId, activeIndex, targetLocale, trackId };
    setLineState({ ...EMPTY, state: TRANSLATION_STATES.LOADING });
    fetchLine(provider, {
      trackId,
      index: activeIndex,
      text: line.text,
      sourceLocale,
      targetLocale,
      startTime: line.time,
      endTime: line.endTime,
      section: line.section,
    }).then((result) => {
      if (contextRef.current?.requestId === requestId) setLineState(result);
    });
  }, [activeIndex, lyrics, provider, sourceLocale, targetLocale, trackId]);

  return { lineState, retry };
}
