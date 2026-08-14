export function tokenizeLyricWords(text) {
  let wordIndex = 0;
  return (String(text || "").match(/\s+|\S+/g) || []).map((token) => ({
    text: token,
    wordIndex: /\S/.test(token) ? wordIndex++ : -1,
  }));
}

export function lyricWordMetrics(text) {
  const tokens = tokenizeLyricWords(text);
  const weights = [];
  let total = 0;

  tokens.forEach((token) => {
    if (token.wordIndex < 0) return;
    const letters = token.text.replace(/[^\p{L}\p{N}]+/gu, "").length
      || token.text.trim().length
      || 1;
    const weight = Math.max(0.85, Math.sqrt(letters));
    total += weight;
    weights.push(total);
  });

  return { tokens, weights, total };
}

// Mirrors Phase's original read-along model: longer words receive a slightly
// larger share of the line's timestamp window, without inventing word timing.
export function getActiveLyricWordIndex(text, startTime, endTime, currentTime) {
  const metrics = lyricWordMetrics(text);
  const start = Number(startTime);
  const current = Number(currentTime);
  if (!metrics.weights.length || !Number.isFinite(start) || !Number.isFinite(current)) return -1;

  const suppliedEnd = Number(endTime);
  const end = Number.isFinite(suppliedEnd) && suppliedEnd > start ? suppliedEnd : start + 4;
  const span = Math.max(0.35, end - start);
  const progress = Math.max(0, Math.min(0.999, (current - start) / span));
  const target = progress * metrics.total;
  const index = metrics.weights.findIndex((limit) => target < limit);
  return index < 0 ? metrics.weights.length - 1 : index;
}

export function wordGlowState(wordIndex, activeWordIndex) {
  if (activeWordIndex < 0 || wordIndex < 0) return "";
  if (wordIndex === activeWordIndex) return "reader-word-active";
  return wordIndex < activeWordIndex ? "reader-word-past" : "reader-word-upcoming";
}
