/**
 * LYRIC SHADER LAB — Server Analysis Provider Adapter
 * 
 * Module: llmProvider
 * Responsibility: Abstracted interface for LLM-based lyric analysis.
 * Calls the embedded app's same-origin FastAPI analysis contract.
 * 
 * ARCHITECTURE NOTE:
 * This module implements a provider adapter pattern.
 * No model or provider secret is exposed to frontend code.
 * 
 * Provider Interface:
 * {
 *   analyzeLyric(input: {
 *     songTitle: string;
 *     artist: string;
 *     lyricLine: string;
 *     section: "intro" | "verse" | "chorus" | "bridge" | "outro";
 *   }): Promise<LyricAnalysis>
 * }
 */

import { analyzeLyricLocal, getDefaultAnalysis } from "./lyricAnalyzer";

/**
 * dev-music-service provider. The endpoint is deterministic today and can gain
 * a server-side model adapter later without changing this browser contract.
 */
export const devMusicServiceAnalysisProvider = {
  name: "dev-music-service",

  async analyzeLyric({ songTitle, artist, lyricLine, section }) {
    if (!lyricLine || lyricLine.trim() === "") {
      return getDefaultAnalysis(section);
    }

    const response = await fetch("/api/visuals/llm-analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        songTitle,
        artist,
        lyricLine,
        section,
      }),
    });

    if (!response.ok) {
      throw new Error(`Shader API request failed with ${response.status}`);
    }

    return response.json();
  },
};

/** Offline/testing provider. */
export const mockLLMProvider = {
  name: "mock",

  async analyzeLyric({ lyricLine, section }) {
    await new Promise((r) => setTimeout(r, 500));
    return analyzeLyricLocal(lyricLine, section);
  },
};

/**
 * Analyze a lyric with LLM enhancement, falling back to local analysis on failure.
 */
export async function analyzeLyricWithLLM(provider, input) {
  try {
    return await provider.analyzeLyric(input);
  } catch (err) {
    console.warn("[LyricShaderLab] LLM analysis failed, using local fallback:", err.message);
    return analyzeLyricLocal(input.lyricLine, input.section);
  }
}
