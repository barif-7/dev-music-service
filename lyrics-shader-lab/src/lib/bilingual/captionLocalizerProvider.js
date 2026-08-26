import { TRANSLATION_STATES } from "./translationService";

function stableWordIndex(word) {
  let hash = 2166136261;
  for (const character of String(word || "").toLowerCase()) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 1_000_000 + (hash >>> 0);
}

async function localizeLine({ song, index, text, targetLocale, startTime, endTime, section }) {
  const response = await fetch("/api/lyrics/localize-window", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: song?.title || "Lyric Shader Lab",
      artist: song?.artist || "Unknown artist",
      album: song?.album || null,
      duration: song?.duration ? Math.round(song.duration) : null,
      locale: targetLocale,
      section: section || null,
      bpm: song?.bpm ? Math.round(song.bpm) : null,
      lines: [{
        index,
        text,
        start_time_ms: Number.isFinite(startTime) ? Math.max(0, Math.round(startTime * 1000)) : null,
        end_time_ms: Number.isFinite(endTime) ? Math.max(0, Math.round(endTime * 1000)) : null,
      }],
    }),
  });
  if (!response.ok) throw new Error(`CaptionLocalizer request failed (${response.status})`);
  const payload = await response.json();
  return payload.localized?.[String(index)] || "";
}

export function createCaptionLocalizerProvider(song) {
  return {
    name: "caption-localizer",
    async getTranslation({ index = 0, text, targetLocale, startTime, endTime, section }) {
      if (!targetLocale) return { state: TRANSLATION_STATES.UNAVAILABLE };
      const localized = await localizeLine({ song, index, text, targetLocale, startTime, endTime, section });
      return localized
        ? { state: TRANSLATION_STATES.AVAILABLE, text: localized }
        : { state: TRANSLATION_STATES.UNAVAILABLE };
    },
    async getVocabulary({ word, targetLanguage }) {
      if (!word || !targetLanguage) return { state: TRANSLATION_STATES.UNAVAILABLE };
      const index = stableWordIndex(word);
      try {
        const localized = await localizeLine({
          song: { ...song, title: `${song?.title || "Lyric Shader Lab"} · vocabulary` },
          index,
          text: word,
          targetLocale: targetLanguage,
        });
        return localized
          ? { state: TRANSLATION_STATES.AVAILABLE, translation: localized }
          : { state: TRANSLATION_STATES.UNAVAILABLE };
      } catch {
        return { state: TRANSLATION_STATES.UNAVAILABLE };
      }
    },
  };
}
