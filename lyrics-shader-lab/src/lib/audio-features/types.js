/**
 * LYRIC SHADER LAB — Canonical Audio Feature Types
 *
 * Module: audio-features/types
 * Responsibility: Shared type definitions for all audio feature layers.
 * Extraction: Copy into dev-music-service as the shared type contract.
 *
 * Feature Source Priority:
 *   1. ReccoBeats / provider audio features
 *   2. Self-analyzed Web Audio / FFT features
 *   3. Cached previous track profile
 *   4. Neutral defaults
 *
 * NOTE: This is NOT dependent on Spotify. The system should be portable
 * across any audio feature provider that conforms to CanonicalAudioFeatures.
 */

// ---------------------------------------------------------------------------
// Audio Feature Source
// ---------------------------------------------------------------------------

/**
 * @typedef {"reccobeats" | "spotify_legacy" | "self_analyzed" | "acousticbrainz" | "mock"} AudioFeatureSource
 */

// ---------------------------------------------------------------------------
// Canonical Track-Level Audio Features
// Sourced from a provider (ReccoBeats, AcousticBrainz, etc.)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CanonicalAudioFeatures
 * @property {AudioFeatureSource} source
 * @property {number} confidence - 0–1, how reliable the data is
 * @property {number} [danceability]
 * @property {number} [energy]
 * @property {number} [loudness] - in dBFS, typically -60 to 0
 * @property {number} [speechiness]
 * @property {number} [acousticness]
 * @property {number} [instrumentalness]
 * @property {number} [liveness]
 * @property {number} [valence] - 0=negative, 1=positive
 * @property {number} [tempo] - BPM
 * @property {number} [key] - 0–11 (Pitch Class), -1 = unknown
 * @property {0|1} [mode] - 0=minor, 1=major
 * @property {number} [time_signature]
 * @property {number} [duration_ms]
 * @property {string} [providerTrackId]
 * @property {string} [isrc]
 * @property {string} [mbid]
 * @property {string} [analyzedAt]
 */

// ---------------------------------------------------------------------------
// Self-Analyzed Audio Features (Web Audio / FFT)
// Measured in real-time from audio playback in-browser
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SelfAnalyzedAudioFeatures
 * @property {number} rms - Root mean square amplitude
 * @property {number} peak - Peak amplitude
 * @property {number} crestFactor - Peak / RMS ratio
 * @property {number} spectralCentroid - Brightness indicator (Hz normalized 0–1)
 * @property {number} spectralRolloff - High-frequency rolloff
 * @property {number} spectralFlux - Frame-to-frame spectral change
 * @property {number} zeroCrossingRate - Noisiness / percussiveness indicator
 * @property {number} bassEnergy - Sub 200Hz energy (0–1)
 * @property {number} midEnergy - 200–4kHz energy (0–1)
 * @property {number} trebleEnergy - 4kHz+ energy (0–1)
 * @property {number} onsetStrength - Beat/transient strength
 * @property {number} beatConfidence - 0–1 confidence in detected beat
 * @property {number} [bpmEstimate]
 * @property {number[]} [chroma] - 12-element pitch class vector
 * @property {number} [estimatedKey] - 0–11
 * @property {0|1} [estimatedMode]
 */

// ---------------------------------------------------------------------------
// Derived Visual Features (Mapped from canonical + self-analyzed)
// Never exposed directly as shader uniforms — they are an interpretation layer.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} DerivedVisualFeatures
 * @property {number} rhythmicStability - How locked-in the groove feels (0–1)
 * @property {number} beatStrength - How hard the beat hits (0–1)
 * @property {number} brightness - Overall luminance character (0–1)
 * @property {number} warmth - Emotional warmth / valence coloring (0–1)
 * @property {number} tension - Dissonance / minor-mode / high-energy pressure (0–1)
 * @property {number} density - Signal complexity / layering (0–1)
 * @property {number} organicness - Acoustic vs. synthetic character (0–1)
 * @property {number} vocalPresence - Lyric / speech prominence (0–1)
 * @property {number} ambience - Abstract / spatial / ambient quality (0–1)
 * @property {number} motionIntensity - How kinetic the visuals should feel (0–1)
 */

// ---------------------------------------------------------------------------
// Shader Uniform State (Final per-frame GPU-facing values)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ShaderUniformState
 * // Time
 * @property {number} uTime
 * // Live frame values (from SelfAnalyzedAudioFeatures or simulated)
 * @property {number} uAudioEnergy
 * @property {number} uBassEnergy
 * @property {number} uMidEnergy
 * @property {number} uTrebleEnergy
 * @property {number} uBeatPulse
 * // Track-level priors (from CanonicalAudioFeatures)
 * @property {number} uDanceability
 * @property {number} uValence
 * @property {number} uTempoBpm - normalized 0–1 (60–200 BPM range)
 * @property {number} uLoudnessNorm - normalized 0–1 from dBFS
 * @property {number} uAcousticness
 * @property {number} uInstrumentalness
 * @property {number} uSpeechiness
 * @property {number} uLiveness
 * // Visual interpretation (from DerivedVisualFeatures)
 * @property {number} uBrightness
 * @property {number} uWarmth
 * @property {number} uTension
 * @property {number} uChaos
 * @property {number} uWarp
 * @property {number} uGrain
 * @property {number} uDensity
 * // Color identity
 * @property {number} uHue - 0–360
 * @property {number} uSaturation - 0–1
 * @property {number[]} uColorA - [r,g,b] normalized
 * @property {number[]} uColorB - [r,g,b] normalized
 */

// ---------------------------------------------------------------------------
// Visual Engine Snapshot (full exportable state)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} VisualEngineSnapshot
 * @property {Object} song
 * @property {Object} [lyric]
 * @property {CanonicalAudioFeatures} canonicalAudioFeatures
 * @property {SelfAnalyzedAudioFeatures} [selfAnalyzedAudioFeatures]
 * @property {DerivedVisualFeatures} derivedVisualFeatures
 * @property {ShaderUniformState} shaderUniforms
 * @property {string} generatedAt
 */

// ---------------------------------------------------------------------------
// Neutral defaults — used when all providers fail
// ---------------------------------------------------------------------------

export const NEUTRAL_AUDIO_FEATURES = {
  source: "mock",
  confidence: 0,
  danceability: 0.5,
  energy: 0.5,
  loudness: -14,
  speechiness: 0.1,
  acousticness: 0.3,
  instrumentalness: 0.2,
  liveness: 0.1,
  valence: 0.5,
  tempo: 120,
  key: -1,
  mode: 1,
  time_signature: 4,
};

export const NEUTRAL_SELF_ANALYZED = {
  rms: 0.3,
  peak: 0.4,
  crestFactor: 1.3,
  spectralCentroid: 0.4,
  spectralRolloff: 0.5,
  spectralFlux: 0.1,
  zeroCrossingRate: 0.1,
  bassEnergy: 0.3,
  midEnergy: 0.4,
  trebleEnergy: 0.2,
  onsetStrength: 0.3,
  beatConfidence: 0.5,
  bpmEstimate: 120,
};