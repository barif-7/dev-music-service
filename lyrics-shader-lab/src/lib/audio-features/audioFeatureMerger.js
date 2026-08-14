/**
 * LYRIC SHADER LAB — Audio Feature Merger
 *
 * Module: audio-features/audioFeatureMerger
 * Responsibility: Merges provider (ReccoBeats) features with self-analyzed FFT features
 * into a single CanonicalAudioFeatures object.
 *
 * Merge priority:
 *   1. Provider features (ReccoBeats / acousticbrainz)
 *   2. Self-analyzed FFT features (mapped to canonical names)
 *   3. Neutral defaults
 *
 * Rules:
 *   - Prefer provider values when available and confidence > threshold
 *   - Fill missing fields from self-analyzed equivalents
 *   - Never block visuals — always produce a usable output
 *   - Track the effective source per feature for attribution
 */

import { NEUTRAL_AUDIO_FEATURES } from "./types";

const PROVIDER_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Maps self-analyzed features onto canonical field names where possible.
 * @param {import("./types").SelfAnalyzedAudioFeatures} self
 * @returns {Partial<import("./types").CanonicalAudioFeatures>}
 */
function selfAnalyzedToCanonical(self) {
  if (!self) return {};
  return {
    // RMS amplitude maps loosely to loudness (convert to rough dBFS)
    loudness: self.rms > 0 ? 20 * Math.log10(self.rms) : NEUTRAL_AUDIO_FEATURES.loudness,
    // Spectral centroid as brightness proxy → correlates with energy
    energy: self.midEnergy != null ? (self.bassEnergy + self.midEnergy) / 2 : undefined,
    // Zero-crossing rate correlates with speechiness
    speechiness: self.zeroCrossingRate != null
      ? Math.min(1, self.zeroCrossingRate * 2)
      : undefined,
    // Spectral centroid (high value = less acoustic, more synthetic)
    acousticness: self.spectralCentroid != null
      ? Math.max(0, 1 - self.spectralCentroid)
      : undefined,
    // Beat confidence → danceability proxy
    danceability: self.beatConfidence != null
      ? Math.min(1, self.beatConfidence * 1.2)
      : undefined,
    // BPM from beat detection
    tempo: self.bpmEstimate,
    // Chroma → key
    key: self.estimatedKey,
    mode: self.estimatedMode,
  };
}

/**
 * Merges provider + self-analyzed features. Returns canonical features
 * plus an attribution map showing which source provided each field.
 *
 * @param {import("./types").CanonicalAudioFeatures | null} providerFeatures
 * @param {import("./types").SelfAnalyzedAudioFeatures | null} selfFeatures
 * @returns {{ merged: import("./types").CanonicalAudioFeatures, attribution: Record<string, string> }}
 */
export function mergeAudioFeatures(providerFeatures, selfFeatures) {
  const attribution = {};
  const selfCanonical = selfAnalyzedToCanonical(selfFeatures);
  const isProviderTrusted =
    providerFeatures &&
    providerFeatures.source !== "mock" &&
    providerFeatures.confidence >= PROVIDER_CONFIDENCE_THRESHOLD;

  const CANONICAL_FIELDS = [
    "danceability", "energy", "loudness", "speechiness",
    "acousticness", "instrumentalness", "liveness", "valence",
    "tempo", "key", "mode", "time_signature",
  ];

  const merged = { ...NEUTRAL_AUDIO_FEATURES };

  // Determine effective source label
  merged.source = isProviderTrusted
    ? (providerFeatures.source || "reccobeats")
    : selfFeatures
      ? "self_analyzed"
      : "mock";

  merged.confidence = isProviderTrusted
    ? providerFeatures.confidence
    : selfFeatures
      ? 0.4
      : 0;

  for (const field of CANONICAL_FIELDS) {
    const providerVal = isProviderTrusted ? providerFeatures[field] : undefined;
    const selfVal = selfCanonical[field];
    const neutralVal = NEUTRAL_AUDIO_FEATURES[field];

    if (providerVal != null) {
      merged[field] = providerVal;
      attribution[field] = providerFeatures.source || "reccobeats";
    } else if (selfVal != null) {
      merged[field] = selfVal;
      attribution[field] = "self_analyzed";
    } else {
      merged[field] = neutralVal;
      attribution[field] = "neutral_default";
    }
  }

  // Pass-through identity fields
  for (const field of ["providerTrackId", "isrc", "mbid", "duration_ms"]) {
    if (isProviderTrusted && providerFeatures[field] != null) {
      merged[field] = providerFeatures[field];
    }
  }

  merged.analyzedAt = new Date().toISOString();

  return { merged, attribution };
}

/**
 * Quick helper: merge and return just the canonical features.
 */
export function getMergedFeatures(providerFeatures, selfFeatures) {
  return mergeAudioFeatures(providerFeatures, selfFeatures).merged;
}