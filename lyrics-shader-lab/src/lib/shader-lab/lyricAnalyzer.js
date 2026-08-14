/**
 * LYRIC SHADER LAB — Deterministic Lyric Analyzer
 * 
 * Module: lyricAnalyzer
 * Responsibility: Maps lyric text to structured visual parameters using keyword heuristics.
 * Extraction: Copy into dev-music-service as a fallback when LLM is unavailable.
 * In production, used by: POST /lyrics/analyze (server-side fallback)
 */

const MOOD_KEYWORDS = {
  calm: ["quiet", "still", "gentle", "soft", "peace", "drift", "snow", "silent", "fades", "white", "hollow"],
  euphoric: ["light", "sun", "suns", "thousand", "electric", "burning", "bright", "neon", "glow", "fire", "blaze"],
  sad: ["lost", "ghost", "lonely", "tears", "broken", "empty", "cold", "shadow", "shadows", "grey"],
  aggressive: ["burn", "crash", "scream", "rage", "smash", "chains", "current", "veins", "voltage"],
  dreamy: ["dream", "float", "haze", "cloud", "mist", "frequencies", "tangled", "web", "time", "machine"],
  chaotic: ["noise", "chaos", "static", "shatter", "storm", "dissolving", "nothing", "seems"],
};

const SECTION_ENERGY_MAP = {
  intro: 0.2,
  verse: 0.45,
  chorus: 0.85,
  bridge: 0.6,
  outro: 0.15,
};

const MOOD_COLORS = {
  calm:       { colorA: "#1E3A5F", colorB: "#4A90B8" },
  euphoric:   { colorA: "#F59E0B", colorB: "#EC4899" },
  sad:        { colorA: "#1E1B4B", colorB: "#6366F1" },
  aggressive: { colorA: "#7F1D1D", colorB: "#EF4444" },
  dreamy:     { colorA: "#7C3AED", colorB: "#06B6D4" },
  chaotic:    { colorA: "#DC2626", colorB: "#FACC15" },
};

const MOOD_PARAMS = {
  calm:       { brightness: 0.3, chaos: 0.1, pulse: 0.2 },
  euphoric:   { brightness: 0.9, chaos: 0.4, pulse: 0.9 },
  sad:        { brightness: 0.2, chaos: 0.15, pulse: 0.3 },
  aggressive: { brightness: 0.7, chaos: 0.8, pulse: 0.95 },
  dreamy:     { brightness: 0.5, chaos: 0.25, pulse: 0.5 },
  chaotic:    { brightness: 0.6, chaos: 0.9, pulse: 0.7 },
};

/**
 * Deterministic lyric analysis — no LLM required.
 * @param {string} lyricLine - The lyric text to analyze
 * @param {string} section - Song section (intro, verse, chorus, bridge, outro)
 * @returns {LyricAnalysis}
 */
export function analyzeLyricLocal(lyricLine, section = "verse") {
  const lower = lyricLine.toLowerCase();
  const words = lower.split(/\s+/);

  // Score each mood by keyword matches
  const scores = {};
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    scores[mood] = words.reduce((score, word) => {
      return score + (keywords.some(kw => word.includes(kw)) ? 1 : 0);
    }, 0);
  }

  // Find dominant mood
  const detectedMood = Object.entries(scores).reduce(
    (best, [mood, score]) => (score > best.score ? { mood, score } : best),
    { mood: "calm", score: 0 }
  ).mood;

  // Calculate energy from section + word intensity
  const sectionEnergy = SECTION_ENERGY_MAP[section] || 0.4;
  const wordEnergy = Math.min(1, words.length / 12);
  const energy = Math.min(1, sectionEnergy * 0.6 + wordEnergy * 0.4);

  const params = MOOD_PARAMS[detectedMood];
  const colors = MOOD_COLORS[detectedMood];

  return {
    mood: detectedMood,
    energy: parseFloat(energy.toFixed(2)),
    brightness: params.brightness,
    chaos: params.chaos,
    pulse: params.pulse,
    colorA: colors.colorA,
    colorB: colors.colorB,
    visualPrompt: generateVisualPrompt(detectedMood, lyricLine, section),
  };
}

function generateVisualPrompt(mood, lyric, section) {
  const prompts = {
    calm:       `soft ambient glow, gentle particles drifting, muted tones — "${lyric}"`,
    euphoric:   `explosive light beams, radiant particles, golden energy burst — "${lyric}"`,
    sad:        `cold rain on glass, deep blue shadows, slow falling particles — "${lyric}"`,
    aggressive: `red lightning, fractured geometry, intense pulse waves — "${lyric}"`,
    dreamy:     `neon fog, floating crystals, iridescent aurora trails — "${lyric}"`,
    chaotic:    `glitch distortion, shattered grid, rapid color shifts — "${lyric}"`,
  };
  return prompts[mood] || prompts.calm;
}

/**
 * Returns default analysis for empty/instrumental sections.
 */
export function getDefaultAnalysis(section = "intro") {
  return {
    mood: "calm",
    energy: SECTION_ENERGY_MAP[section] || 0.2,
    brightness: 0.2,
    chaos: 0.05,
    pulse: 0.15,
    colorA: "#0F172A",
    colorB: "#1E3A5F",
    visualPrompt: "ambient stillness, soft particle drift",
  };
}