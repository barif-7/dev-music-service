export const TRANSLATION_STATES = {
  NOT_REQUESTED: "not_requested",
  LOADING: "loading",
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
  SAME_LANGUAGE: "same_language",
};

const cache = new Map();
let requestCounter = 0;

export function cacheKey(trackId, index, text, sourceLocale, targetLocale) {
  return [trackId || "_", index ?? "_", text, sourceLocale || "auto", targetLocale].join("\u0001");
}

export function getCached(key) {
  return cache.get(key) || null;
}

export function invalidateForTrack(trackId) {
  const prefix = `${trackId || "_"}\u0001`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function freshRequestId() {
  requestCounter += 1;
  return requestCounter;
}

export async function fetchLine(provider, context) {
  const { trackId, index, text, sourceLocale, targetLocale } = context;
  if (!String(text || "").trim()) return { state: TRANSLATION_STATES.UNAVAILABLE };
  if (sourceLocale && sourceLocale !== "auto" && sourceLocale === targetLocale) {
    return { state: TRANSLATION_STATES.SAME_LANGUAGE };
  }

  const key = cacheKey(trackId, index, text, sourceLocale, targetLocale);
  const cached = getCached(key);
  if (cached?.state === TRANSLATION_STATES.AVAILABLE || cached?.state === TRANSLATION_STATES.UNAVAILABLE) {
    return cached;
  }

  cache.set(key, { state: TRANSLATION_STATES.LOADING });
  try {
    const result = await provider.getTranslation(context);
    const entry = {
      state: result.state || TRANSLATION_STATES.UNAVAILABLE,
      text: result.text || "",
      translit: result.transliteration || "",
      meaning: result.meaning || "",
      error: result.error || null,
    };
    cache.set(key, entry);
    return entry;
  } catch {
    const entry = { state: TRANSLATION_STATES.ERROR, error: "Translation service unavailable." };
    cache.set(key, entry);
    return entry;
  }
}

export function prefetchLines(provider, lyrics, activeIndex, count, context) {
  for (let offset = 1; offset <= count && activeIndex + offset < lyrics.length; offset += 1) {
    const index = activeIndex + offset;
    const line = lyrics[index];
    if (!line?.text) continue;
    const next = {
      ...context,
      index,
      text: line.text,
      startTime: line.time,
      endTime: line.endTime,
      section: line.section,
    };
    const key = cacheKey(next.trackId, index, line.text, next.sourceLocale, next.targetLocale);
    if (!getCached(key)) fetchLine(provider, next).catch(() => {});
  }
}
