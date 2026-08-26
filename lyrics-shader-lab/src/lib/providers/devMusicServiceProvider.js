/** Canonical track-prior adapter for dev-music-service. */

import { NEUTRAL_AUDIO_FEATURES } from "@/lib/audio-features/types";

const featureCache = new Map();

export const devMusicServiceProvider = {
  name: "dev-music-service",

  async getAudioFeatures({ title, artist, spotify_id, duration_ms }) {
    const cacheKey = `${title}::${artist}::${spotify_id || ""}`;
    if (featureCache.has(cacheKey)) return featureCache.get(cacheKey);

    const params = new URLSearchParams({ title, artist });
    if (spotify_id) params.set("spotify_id", spotify_id);
    if (duration_ms) params.set("duration_ms", String(duration_ms));

    try {
      const response = await fetch(`/api/audio-features?${params}`);
      if (!response.ok) throw new Error(`Audio features request failed (${response.status})`);
      const payload = await response.json();
      const features = payload.available
        ? payload
        : { ...NEUTRAL_AUDIO_FEATURES, ...payload, source: "neutral_default", confidence: 0 };
      featureCache.set(cacheKey, features);
      return features;
    } catch (error) {
      console.warn("[LyricsShaderLab] Track priors unavailable:", error.message);
      return { ...NEUTRAL_AUDIO_FEATURES, source: "neutral_default", confidence: 0 };
    }
  },
};

export function clearFeatureCache() {
  featureCache.clear();
}
