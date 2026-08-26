/**
 * LYRIC SHADER LAB — Shader Uniform Mapper (v2)
 *
 * Module: shaderUniformMapper
 * Responsibility: Maps the full feature pipeline into ShaderUniformState.
 *
 * Input pipeline:
 *   CanonicalAudioFeatures + DerivedVisualFeatures + LyricAnalysis + live SelfAnalyzedAudioFeatures
 *   → ShaderUniformState
 *
 * This replaces the old shaderUniforms.js mapAnalysisToUniforms() function.
 * Old names are aliased below for backwards compatibility with ShaderCanvas/shaderPresets.
 */

import { NEUTRAL_AUDIO_FEATURES } from "@/lib/audio-features/types";
import { derivedVisualToColors } from "./colorIdentity";

/**
 * Normalizes loudness dBFS (-60 to 0) → 0–1
 */
function normLoudness(db) {
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

/**
 * Normalizes tempo (60–200 BPM) → 0–1
 */
function normTempo(bpm) {
  return Math.max(0, Math.min(1, (bpm - 60) / 140));
}

/**
 * Builds the default shader uniform state from neutral values.
 */
export function getDefaultUniforms() {
  return buildShaderUniforms(
    NEUTRAL_AUDIO_FEATURES,
    {
      rhythmicStability: 0.5, beatStrength: 0.3, brightness: 0.3,
      warmth: 0.5, tension: 0.2, density: 0.4, organicness: 0.5,
      vocalPresence: 0.2, ambience: 0.4, motionIntensity: 0.3,
    },
    null,
    0
  );
}

/**
 * Core mapper: CanonicalAudioFeatures + DerivedVisualFeatures + lyric analysis → ShaderUniformState
 *
 * @param {import("@/lib/audio-features/types").CanonicalAudioFeatures} canonical
 * @param {import("@/lib/audio-features/types").DerivedVisualFeatures} derived
 * @param {import("./lyricAnalyzer").LyricAnalysis | null} lyricAnalysis - optional lyric-level override
 * @param {number} currentTime
 * @returns {import("@/lib/audio-features/types").ShaderUniformState}
 */
export function buildShaderUniforms(canonical, derived, lyricAnalysis, currentTime = 0) {
  const f = { ...NEUTRAL_AUDIO_FEATURES, ...canonical };

  const tempoNorm  = normTempo(f.tempo);
  const loudNorm   = normLoudness(f.loudness);
  const beatPulse  = simulateBeatPulse(currentTime, f.tempo);

  // Color identity — prefer lyric analysis colors if available
  const { colorA, colorB, hue, saturation } = derivedVisualToColors(
    derived, f, lyricAnalysis
  );

  // Chaos: driven by tension + spectral character
  const chaos = derived.tension * 0.5 + (1 - derived.organicness) * 0.3 + derived.motionIntensity * 0.2;

  // Warp: organic sources warp less (acoustic music → gentle curves)
  const warp = derived.motionIntensity * 0.5 + derived.tension * 0.3 + (1 - derived.organicness) * 0.2;

  // Grain: more for lo-fi / organic content
  const grain = 0.02 + derived.organicness * 0.08 + derived.ambience * 0.05;

  return {
    uTime: currentTime,
    // Live frame
    uAudioEnergy:       simulateAudioEnergy(currentTime, f.energy),
    uBassEnergy:        simulateBandEnergy(currentTime, f.energy, 0.3),
    uMidEnergy:         simulateBandEnergy(currentTime, f.energy * f.danceability, 1.7),
    uTrebleEnergy:      simulateBandEnergy(currentTime, 1 - f.acousticness, 3.1),
    uBeatPulse:         beatPulse,
    // Track-level priors
    uDanceability:      f.danceability,
    uValence:           f.valence,
    uTempoBpm:          tempoNorm,
    uLoudnessNorm:      loudNorm,
    uAcousticness:      f.acousticness,
    uInstrumentalness:  f.instrumentalness,
    uSpeechiness:       f.speechiness,
    uLiveness:          f.liveness,
    // Visual interpretation
    uBrightness:        derived.brightness,
    uWarmth:            derived.warmth,
    uTension:           derived.tension,
    uChaos:             Math.min(1, chaos),
    uWarp:              Math.min(1, warp),
    uGrain:             Math.min(0.3, grain),
    uDensity:           derived.density,
    // Color identity
    uHue:               hue,
    uSaturation:        saturation,
    uColorA:            colorA,
    uColorB:            colorB,
    // Backwards-compat aliases used by shaderPresets.js renderer
    uLyricEnergy:       lyricAnalysis?.energy ?? f.energy,
    uPulse:             derived.beatStrength,
    uMood:              lyricAnalysis ? MOOD_INDEX[lyricAnalysis.mood] ?? 0 : 0,
  };
}

const MOOD_INDEX = {
  calm: 0, euphoric: 1, sad: 2, aggressive: 3, dreamy: 4, chaotic: 5,
};

// ---------------------------------------------------------------------------
// Simulation helpers (replace with real Web Audio / FFT in production)
// ---------------------------------------------------------------------------

function simulateAudioEnergy(time, baseEnergy) {
  const beat = Math.pow(Math.sin(time * Math.PI * 2.0), 2);
  const noise = Math.sin(time * 7.3) * 0.05 + Math.sin(time * 13.7) * 0.03;
  return Math.max(0, Math.min(1, baseEnergy * 0.6 + beat * 0.3 + noise + 0.08));
}

function simulateBandEnergy(time, base, freq) {
  const cycle = Math.pow(Math.sin(time * Math.PI * freq), 2);
  return Math.max(0, Math.min(1, base * 0.5 + cycle * 0.4 + 0.1));
}

function simulateBeatPulse(time, bpm) {
  const beatHz = (bpm || 120) / 60;
  return Math.max(0, Math.sin(time * Math.PI * beatHz * 2));
}

// ---------------------------------------------------------------------------
// Smooth interpolation (unchanged from old shaderUniforms.js)
// ---------------------------------------------------------------------------

export function lerpUniforms(from, to, t) {
  const ease = t * t * (3 - 2 * t);
  const result = {};
  for (const key of Object.keys(to)) {
    if (key === "uTime") {
      result[key] = to[key];
    } else if (Array.isArray(to[key])) {
      result[key] = to[key].map((v, i) =>
        (from[key]?.[i] ?? v) + (v - (from[key]?.[i] ?? v)) * ease
      );
    } else {
      result[key] = (from[key] ?? to[key]) + ((to[key] ?? 0) - (from[key] ?? to[key])) * ease;
    }
  }
  return result;
}

export function hexToNormalized(hex) {
  const c = hex.replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}