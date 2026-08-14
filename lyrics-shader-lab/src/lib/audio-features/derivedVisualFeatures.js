/**
 * LYRIC SHADER LAB — Derived Visual Features
 *
 * Module: audio-features/derivedVisualFeatures
 * Responsibility: Maps CanonicalAudioFeatures → DerivedVisualFeatures.
 * This is the "interpretation layer" between raw audio data and visual output.
 *
 * Mapping rationale:
 *   energy             → motionIntensity, brightness
 *   danceability       → rhythmicStability, beatStrength
 *   tempo              → pulse rate (via uBeatPulse in shader)
 *   loudness           → loudness normalization (uLoudnessNorm)
 *   valence            → warmth / emotional color
 *   acousticness       → organicness, suppresses harsh digital warp
 *   instrumentalness   → ambience, more abstract visuals
 *   speechiness        → vocalPresence, lyric emphasis
 *   liveness           → spatial depth / crowd ambience
 *   key + mode         → hue identity and major/minor brightness bias
 */

import { NEUTRAL_AUDIO_FEATURES } from "./types";

/**
 * Normalizes loudness from dBFS (-60 to 0) to 0–1.
 */
function normalizeLoudness(loudnessDbfs) {
  return Math.max(0, Math.min(1, (loudnessDbfs + 60) / 60));
}

/**
 * Maps key (0–11) to a hue angle (0–360).
 * Uses the circle of fifths for perceptually meaningful hue spread.
 */
function keyToHue(key, mode) {
  if (key < 0) return 220; // default to cool blue for unknown key
  // Circle of fifths order: C, G, D, A, E, B, F#, Db, Ab, Eb, Bb, F
  const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const fifthsPosition = circleOfFifths.indexOf(key);
  const baseHue = (fifthsPosition / 12) * 360;
  // Minor keys shift hue slightly cooler (toward blues/purples)
  return mode === 0 ? (baseHue + 20) % 360 : baseHue;
}

/**
 * Derives a tension value from mode, valence, energy, and speechiness.
 */
function deriveTension(features) {
  const minorBias = features.mode === 0 ? 0.3 : 0;
  const valenceTension = 1 - (features.valence ?? 0.5);
  const energyTension = (features.energy ?? 0.5) * 0.4;
  return Math.min(1, minorBias + valenceTension * 0.4 + energyTension);
}

/**
 * Maps CanonicalAudioFeatures to DerivedVisualFeatures.
 * @param {import("./types").CanonicalAudioFeatures} canonical
 * @returns {{ derived: import("./types").DerivedVisualFeatures, attribution: Record<string, string> }}
 */
export function deriveDerivedVisualFeatures(canonical) {
  const f = { ...NEUTRAL_AUDIO_FEATURES, ...canonical };

  const loudnessNorm = normalizeLoudness(f.loudness);

  // tempo normalized to 0–1 over 60–200 BPM range
  const tempoNorm = Math.max(0, Math.min(1, (f.tempo - 60) / 140));

  const derived = {
    rhythmicStability: f.danceability * 0.7 + (1 - f.speechiness) * 0.3,
    beatStrength:       f.danceability * 0.5 + tempoNorm * 0.3 + f.energy * 0.2,
    brightness:         f.energy * 0.5 + loudnessNorm * 0.3 + f.valence * 0.2,
    warmth:             f.valence * 0.6 + f.acousticness * 0.3 + (f.mode === 1 ? 0.1 : 0),
    tension:            deriveTension(f),
    density:            f.energy * 0.4 + (1 - f.instrumentalness) * 0.3 + f.speechiness * 0.3,
    organicness:        f.acousticness * 0.6 + (1 - f.energy) * 0.2 + f.liveness * 0.2,
    vocalPresence:      f.speechiness * 0.7 + (1 - f.instrumentalness) * 0.3,
    ambience:           f.instrumentalness * 0.5 + (1 - f.energy) * 0.3 + f.acousticness * 0.2,
    motionIntensity:    f.energy * 0.6 + f.danceability * 0.3 + tempoNorm * 0.1,
  };

  // Clamp all to [0, 1]
  for (const k of Object.keys(derived)) {
    derived[k] = Math.max(0, Math.min(1, derived[k]));
    derived[k] = parseFloat(derived[k].toFixed(3));
  }

  const attribution = {
    rhythmicStability: "danceability+speechiness",
    beatStrength:      "danceability+tempo+energy",
    brightness:        "energy+loudness+valence",
    warmth:            "valence+acousticness+mode",
    tension:           "mode+valence+energy",
    density:           "energy+instrumentalness+speechiness",
    organicness:       "acousticness+energy+liveness",
    vocalPresence:     "speechiness+instrumentalness",
    ambience:          "instrumentalness+energy+acousticness",
    motionIntensity:   "energy+danceability+tempo",
  };

  return { derived, attribution };
}

/**
 * Derives hue and saturation from canonical features.
 */
export function deriveColorIdentity(canonical) {
  const f = { ...NEUTRAL_AUDIO_FEATURES, ...canonical };
  return {
    hue: keyToHue(f.key, f.mode),
    saturation: Math.min(1, f.energy * 0.5 + f.valence * 0.3 + 0.2),
  };
}