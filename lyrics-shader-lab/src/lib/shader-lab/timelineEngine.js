/**
 * LYRIC SHADER LAB — Lyric Timeline Engine
 * 
 * Module: timelineEngine
 * Responsibility: Manages playback state, active lyric resolution, and scrubbing.
 * Extraction: Copy into dev-music-service as the core sync engine.
 * 
 * This is a pure logic module with no React dependencies.
 * It can be used in any JS runtime.
 */

/**
 * Finds the active lyric index for a given time position.
 * Uses binary-search-like approach for efficiency.
 * @param {Array} lyrics - Timestamped lyric objects with { time, text, section }
 * @param {number} currentTime - Current playback time in seconds
 * @returns {number} Index of the active lyric, or -1 if before first lyric
 */
export function getActiveLyricIndex(lyrics, currentTime) {
  let active = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

/**
 * Gets the next lyric that will become active.
 */
export function getNextLyricIndex(lyrics, currentTime) {
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time > currentTime) {
      return i;
    }
  }
  return -1;
}

/**
 * Calculates progress within the current lyric's duration.
 * Returns 0-1 representing how far through the current lyric we are.
 */
export function getLyricProgress(lyrics, activeIndex, currentTime) {
  if (activeIndex < 0 || activeIndex >= lyrics.length) return 0;

  const startTime = lyrics[activeIndex].time;
  const endTime = activeIndex + 1 < lyrics.length
    ? lyrics[activeIndex + 1].time
    : startTime + 6; // default 6s for last lyric

  const duration = endTime - startTime;
  if (duration <= 0) return 0;

  return Math.min(1, Math.max(0, (currentTime - startTime) / duration));
}

/**
 * Formats seconds into mm:ss display.
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}