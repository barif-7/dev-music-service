/**
 * LYRIC SHADER LAB — Visualizer Panel
 * Composites the shader canvas + lyric text overlay.
 */

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BilingualReader from "@/components/bilingual/BilingualReader";
import ShaderCanvas from "./ShaderCanvas";
import LyricDisplay from "./LyricDisplay";
import PerfMonitor from "./PerfMonitor";

export default function VisualizerPanel({
  uniforms,
  lyricText,
  secondaryLyricText,
  secondaryLyricLabel,
  mood,
  energy,
  section,
  showPerf,
  shaderPreset,
  onPreviousShader,
  onNextShader,
  shaderCatalogLoading,
  backgroundMode = "shader",
  wallpaperName,
  wallpaperBlend = false,
  backgroundVisible = true,
  lyricsBehindShader = false,
  translationLayout = "stacked",
  textScale = "standard",
  highContrast = false,
  reduceMotion = false,
  bilingual = null,
  sequencerOverride = null,
}) {
  const backgroundHidden = backgroundVisible === false;
  const passthrough = backgroundMode === "passthrough" || backgroundHidden;
  const wallpaperComposite = backgroundMode === "wallpaper";
  const integratedBackground = passthrough || wallpaperComposite;
  const pinnedLyrics = Boolean(bilingual && lyricsBehindShader && !passthrough);
  return (
    <div data-reader-view={wallpaperComposite ? "visual" : undefined} data-lyrics-layer={pinnedLyrics ? "underlay" : "overlay"} className={`relative isolate w-full h-full ${integratedBackground ? "reader-visualizer-window overflow-visible bg-transparent" : "overflow-hidden rounded-3xl bg-black shadow-2xl shadow-black/30"}`}>
      {!passthrough && (
        <ShaderCanvas
          uniforms={uniforms}
          shaderPreset={shaderPreset}
          className={`${wallpaperComposite ? "reader-wallpaper-canvas" : ""} ${pinnedLyrics ? "reader-shader-foreground" : ""}`}
        />
      )}
      {bilingual ? (
        <BilingualReader
          originalText={lyricText}
          originalLocale={bilingual.originalLocale}
          originalLabel={bilingual.originalLabel}
          targetLocale={bilingual.targetLocale}
          targetLabel={bilingual.targetLabel}
          mood={mood}
          section={section}
          uniforms={uniforms}
          lineState={bilingual.lineState}
          prefs={bilingual.preferences}
          onRetry={bilingual.onRetry}
          onWordSelect={bilingual.onWordSelect}
          learnMode={bilingual.learnMode}
          translationRevealed={bilingual.translationRevealed}
          onRevealTranslation={bilingual.onRevealTranslation}
          currentTime={bilingual.currentTime}
          lineStartTime={bilingual.lineStartTime}
          lineEndTime={bilingual.lineEndTime}
          pinnedBehindShader={pinnedLyrics}
          sequencerOverride={sequencerOverride}
        />
      ) : (
        <LyricDisplay
          lyricText={lyricText}
          secondaryText={secondaryLyricText}
          secondaryLabel={secondaryLyricLabel}
          mood={mood}
          energy={energy}
          section={section}
          wallpaperBlend={wallpaperBlend}
          translationLayout={translationLayout}
          textScale={textScale}
          highContrast={highContrast}
          reduceMotion={reduceMotion}
        />
      )}
      {!backgroundHidden && <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {!integratedBackground && (
          <button
            type="button"
            onClick={onPreviousShader}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-black/20 text-white/80 backdrop-blur-md hover:text-white hover:bg-black/35 transition-colors"
            aria-label="Previous shader"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className="px-3 py-1.5 rounded-full border border-white/10 bg-black/20 text-[9px] font-mono uppercase tracking-[0.28em] text-white/70 backdrop-blur-md">
          {integratedBackground
            ? `Wallpaper · ${wallpaperName || "Phase"}`
            : shaderCatalogLoading
            ? "Loading shaders"
            : `${shaderPreset?.name || "Aurora"}${shaderPreset?.sourceShaderId ? " · api" : " · local"}`}
        </div>
        {!integratedBackground && (
          <button
            type="button"
            onClick={onNextShader}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-black/20 text-white/80 backdrop-blur-md hover:text-white hover:bg-black/35 transition-colors"
            aria-label="Next shader"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>}
      <PerfMonitor enabled={showPerf} />
    </div>
  );
}
