/**
 * Lyrics reader surface — a dumb view.
 *
 * Everything this used to work out for itself (preferences and their storage,
 * section inference, the active-line scan, palette maths, shader parameters,
 * uniform assembly) is resolved by the host and arrives in the scene. What is
 * left is rendering and intent dispatch.
 *
 * The timeline and learn views are lazily loaded: the visual view is the
 * always-mounted default, so the interactive learning UI is only fetched when
 * someone actually opens it.
 */

import { Suspense, lazy, useMemo, useState } from "react";
import { Eye, EyeOff, GraduationCap, ListMusic, Settings2, Sparkles } from "lucide-react";

import LiveAnnouncer from "@/components/bilingual/LiveAnnouncer";
import VisualizerPanel from "@/components/shader-lab/VisualizerPanel";
import { hostSurface } from "@/lib/base44/hostSurface";
import { intent, useActiveLine, useHostScene } from "@/lib/base44/useHostSurface";
import { createCaptionLocalizerProvider } from "@/lib/bilingual/captionLocalizerProvider";
import { TRANSLATION_STATES } from "@/lib/bilingual/translationService";

const BilingualTimeline = lazy(() => import("@/components/bilingual/BilingualTimeline"));
const LearnControls = lazy(() => import("@/components/bilingual/LearnControls"));
const ReaderOptions = lazy(() => import("@/components/shader-lab/ReaderOptions"));
const VocabularyCard = lazy(() => import("@/components/bilingual/VocabularyCard"));

const EMPTY_LINES = [];
const VIEW_TABS = [
  { id: "visual", label: "Visual", Icon: Sparkles },
  { id: "timeline", label: "Timeline", Icon: ListMusic },
  { id: "learn", label: "Learn", Icon: GraduationCap },
];

export default function LyricsReaderSurface() {
  const scene = useHostScene();
  const activeIndex = useActiveLine();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [vocabularyWord, setVocabularyWord] = useState("");
  const [translationRevealed, setTranslationRevealed] = useState(true);

  const prefs = scene?.prefs;
  const view = scene?.view || "visual";
  const backgroundVisible = scene?.backgroundVisible !== false;
  const lines = scene?.lines || EMPTY_LINES;
  const activeLine = activeIndex >= 0 ? lines[activeIndex] : null;

  const lineState = useMemo(() => {
    if (!scene?.translationLocale) return { state: TRANSLATION_STATES.NOT_REQUESTED, text: "" };
    if (activeLine?.localized) return { state: TRANSLATION_STATES.AVAILABLE, text: activeLine.localized };
    if (!activeLine?.text) return { state: TRANSLATION_STATES.UNAVAILABLE, text: "" };
    return { state: TRANSLATION_STATES.LOADING, text: "" };
  }, [activeLine, scene?.translationLocale]);

  const localizerProvider = useMemo(
    () => createCaptionLocalizerProvider(scene?.track),
    [scene?.track],
  );

  const announcement = useMemo(() => {
    if (!prefs?.srAnnouncements || !activeLine?.text) return "";
    return activeLine.localized
      ? `Original: ${activeLine.text}. ${scene?.translationLabel || "Translation"}: ${activeLine.localized}`
      : activeLine.text;
  }, [activeLine, prefs?.srAnnouncements, scene?.translationLabel]);

  // The host has not completed the handshake yet — render nothing rather than
  // a half-configured surface that would flash default styling.
  if (!scene || !prefs) return <main className="h-screen" aria-busy="true" />;

  const seek = (time) => intent("seek", { time });
  const translationFor = (line) => {
    if (!scene.translationLocale) return { state: TRANSLATION_STATES.NOT_REQUESTED, text: "" };
    return line.localized
      ? { state: TRANSLATION_STATES.AVAILABLE, text: line.localized }
      : { state: TRANSLATION_STATES.LOADING, text: "" };
  };

  const surfaceClass = [
    "reader-glass-surface relative h-screen overflow-visible text-white",
    `reader-shape-${prefs.windowShape}`,
    prefs.windowAppearance === "textOnly" ? "reader-text-only" : "",
    prefs.windowAppearance === "shareSheet" ? "reader-share-sheet" : "",
    backgroundVisible ? "" : "reader-background-hidden",
    prefs.highContrast ? "reader-high-contrast" : "",
    prefs.reducedMotion ? "reader-reduced-motion" : "",
    prefs.dyslexiaFont ? "reader-dyslexia" : "",
  ].filter(Boolean).join(" ");

  return (
    <main
      className={surfaceClass}
      data-background-visible={backgroundVisible ? "true" : "false"}
      data-window-appearance={prefs.windowAppearance}
      data-reader-shape={prefs.windowShape}
      data-translation-layout={prefs.layout}
      style={{ "--reader-soft-gradient": scene.gradient }}
    >
      <div data-reader-chrome className="absolute left-4 top-4 z-30 flex items-center gap-1 rounded-full border border-white/10 bg-black/35 p-1 font-mono text-[9px] uppercase tracking-wider backdrop-blur-md">
        {VIEW_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => intent("view", { view: id })}
            aria-pressed={view === id}
            className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 py-2 ${view === id ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => intent("background", { visible: !backgroundVisible })}
          aria-pressed={backgroundVisible}
          aria-label={backgroundVisible ? "Hide lyric window background" : "Show lyric window background"}
          className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 py-2 ${backgroundVisible ? "text-white/60 hover:text-white" : "bg-white/15 text-white"}`}
        >
          {backgroundVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Background
        </button>
        <button
          type="button"
          onClick={() => setOptionsOpen((open) => !open)}
          aria-expanded={optionsOpen}
          aria-controls="readerOptionsPanel"
          aria-haspopup="dialog"
          aria-label="Open reading options"
          className={`grid min-h-11 min-w-11 place-items-center rounded-full px-2 ${optionsOpen ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <Suspense fallback={null}>
        {optionsOpen && (
          <ReaderOptions
            open={optionsOpen}
            preferences={prefs}
            onChange={(key, value) => intent("preference", { key, value })}
            onClose={() => setOptionsOpen(false)}
          />
        )}

        {view !== "timeline" ? (
          <VisualizerPanel
            uniforms={hostSurface.uniforms}
            // Read at render time, not held as state: mood changes once per
            // lyric line, which is exactly when this component re-renders.
            mood={hostSurface.frame.mood}
            energy={hostSurface.frame.level}
            lyricText={activeLine?.text || (scene.track ? "Waiting for timed lyrics…" : "Play a song to begin")}
            section={activeLine?.section || "intro"}
            showPerf={false}
            shaderPreset={scene.preset}
            backgroundMode="wallpaper"
            wallpaperName={scene.wallpaper?.name}
            wallpaperBlend
            backgroundVisible={prefs.windowAppearance === "textOnly" ? false : backgroundVisible}
            lyricsBehindShader={prefs.lyricsBehindShader}
            highContrast={prefs.highContrast}
            reduceMotion={prefs.reducedMotion}
            shaderCatalogLoading={false}
            bilingual={{
              originalLocale: scene.sourceLocale,
              originalLabel: "Original",
              targetLocale: scene.translationLocale,
              targetLabel: scene.translationLabel,
              lineState,
              preferences: prefs,
              onRetry: () => intent("translate", { index: activeIndex }),
              onWordSelect: setVocabularyWord,
              learnMode: view === "learn",
              translationRevealed,
              onRevealTranslation: () => setTranslationRevealed(true),
              currentTime: hostSurface.frame.time,
              lineStartTime: activeLine?.time,
              lineEndTime: activeLine?.endTime,
            }}
          />
        ) : (
          <BilingualTimeline
            lyrics={lines}
            activeIndex={activeIndex}
            currentTime={hostSurface.frame.time}
            duration={scene.duration}
            prefs={prefs}
            targetLocale={scene.translationLocale}
            targetLabel={scene.translationLabel}
            accent={scene.wallpaper?.palette?.[2] || "#ffffff"}
            backgroundVisible={prefs.windowAppearance === "textOnly" ? false : backgroundVisible}
            onSeek={seek}
            onReplay={(line) => seek(line.time)}
            onPractice={(line, index) => intent("practice", { index })}
            translationFor={translationFor}
          />
        )}

        {view === "learn" && (
          <LearnControls
            onRepeat={() => activeLine && seek(activeLine.time)}
            onReplayPrevious={() => {
              const previous = lines[Math.max(0, activeIndex - 1)];
              if (previous) seek(previous.time);
            }}
            onSlow={() => intent("rate", { rate: 0.75 })}
            onPractice={() => intent("practice", { index: activeIndex })}
            onVocabulary={() => {
              const first = activeLine?.text?.split(/\s+/).find(Boolean) || "";
              setVocabularyWord(first.replace(/[^\p{L}\p{N}']/gu, ""));
            }}
            hasOriginal={Boolean(activeLine?.text)}
            canUseVocabulary={Boolean(scene.translationLocale)}
          />
        )}

        {vocabularyWord && (
          <VocabularyCard
            word={vocabularyWord}
            sourceLanguage={scene.sourceLocale}
            targetLanguage={scene.translationLocale}
            provider={localizerProvider}
            onSave={(entry) => { intent("vocabulary", entry); setVocabularyWord(""); }}
            onClose={() => setVocabularyWord("")}
          />
        )}
      </Suspense>

      {scene.track && (
        <div data-reader-chrome className="pointer-events-none absolute bottom-4 left-1/2 z-30 max-w-[70%] -translate-x-1/2 truncate rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-center font-mono text-[9px] text-white/45 backdrop-blur-md">
          {scene.track.title} · {scene.track.artist || "Unknown artist"}
        </div>
      )}
      <LiveAnnouncer enabled={prefs.srAnnouncements} message={announcement} />
    </main>
  );
}
