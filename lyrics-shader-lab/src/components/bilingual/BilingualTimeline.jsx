import { useEffect, useRef } from "react";
import { Bookmark, ChevronRight, Play, RotateCcw } from "lucide-react";

import { detectDir } from "@/lib/bilingual/textUtils";
import { TRANSLATION_STATES } from "@/lib/bilingual/translationService";
import { getActiveLyricWordIndex, tokenizeLyricWords, wordGlowState } from "@/lib/bilingual/wordTiming";
import { formatTime } from "@/lib/shader-lab/timelineEngine";

const ORIGINAL_SIZES = { standard: "text-sm md:text-base", large: "text-base md:text-lg", xlarge: "text-lg md:text-xl" };
const TRANSLATION_SIZES = { standard: "text-xs md:text-sm", large: "text-sm md:text-base", xlarge: "text-base md:text-lg" };

function TimedWords({ text, enabled, startTime, endTime, currentTime }) {
  if (!enabled) return text;
  const activeWordIndex = getActiveLyricWordIndex(text, startTime, endTime, currentTime);
  return tokenizeLyricWords(text).map((token, tokenIndex) => (
    token.wordIndex < 0
      ? token.text
      : <span key={`${token.text}-${tokenIndex}`} className={`reader-word ${wordGlowState(token.wordIndex, activeWordIndex)}`}>{token.text}</span>
  ));
}

export default function BilingualTimeline({
  lyrics,
  activeIndex,
  currentTime,
  duration,
  prefs,
  targetLocale,
  targetLabel,
  accent = "#ffffff",
  backgroundVisible = true,
  onSeek,
  onReplay,
  onPractice,
  translationFor,
}) {
  const activeRef = useRef(null);
  const sideBySide = prefs.layout === "sideBySide" && prefs.windowShape !== "circle";

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: prefs.reducedMotion ? "auto" : "smooth", block: "center" });
  }, [activeIndex, prefs.reducedMotion]);

  return (
    <div className={`reader-timeline-window flex h-full flex-col text-white ${backgroundVisible ? "shadow-2xl shadow-black/20" : "reader-background-hidden"}`} data-reader-view="timeline">
      <header className={`flex items-center justify-between gap-4 border-b px-5 py-4 font-mono ${backgroundVisible ? "border-white/10 bg-black/10" : "border-transparent"}`}>
        <div>
          <p className="text-[9px] uppercase tracking-[0.28em] text-white/40">Bilingual timestamp sync</p>
          <p className="mt-1 text-xs text-white/70">Select a line to replay it in the Phase player</p>
        </div>
        <div className="text-right text-[11px] text-white/50">{formatTime(currentTime)} <span className="text-white/20">/</span> {formatTime(duration)}</div>
      </header>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 md:p-5" aria-label="Synchronized bilingual lyrics">
        {!lyrics.length && <li className="grid h-full place-items-center font-mono text-xs text-white/40">Timed lyrics will appear when a song starts.</li>}
        {lyrics.map((line, index) => {
          const active = index === activeIndex;
          const past = index < activeIndex;
          const translation = translationFor(line, index);
          const translated = translation?.state === TRANSLATION_STATES.AVAILABLE && translation.text;
          return (
            <li key={`${line.time}-${index}`} ref={active ? activeRef : null}>
              <div
                aria-current={active ? "true" : undefined}
                className={`group grid min-h-14 grid-cols-[54px_minmax(0,1fr)] gap-3 rounded-2xl border px-3 py-3 md:grid-cols-[64px_minmax(0,1fr)_80px] ${active ? "font-semibold" : past ? "text-white/40" : "text-white/75"}`}
                style={active ? { borderColor: `${accent}70`, backgroundColor: `${accent}20` } : { borderColor: "transparent" }}
              >
                <button type="button" onClick={() => onSeek(line.time)} className="reader-control pt-0.5 text-left font-mono text-[10px]" style={{ color: active ? accent : "rgba(255,255,255,.35)" }} aria-label={`Seek to ${formatTime(line.time)}`}>
                  {formatTime(line.time)}
                </button>
                <div className={`min-w-0 ${sideBySide && translated ? "grid grid-cols-2 gap-4" : "space-y-1"}`}>
                  <p lang="und" dir={detectDir(line.text)} className={`${ORIGINAL_SIZES[prefs.originalSize] || ORIGINAL_SIZES.standard} break-words leading-relaxed ${sideBySide && translated ? "border-r border-white/15 pr-4" : ""}`}>
                    <TimedWords text={line.text || "· · ·"} enabled={prefs.wordGlow && active} startTime={line.time} endTime={line.endTime} currentTime={currentTime} />
                  </p>
                  <div className="min-w-0">
                    {translated && <p lang={targetLocale || "und"} dir={detectDir(translation.text, targetLocale)} className={`${TRANSLATION_SIZES[prefs.translationSize] || TRANSLATION_SIZES.standard} break-words leading-relaxed text-cyan-100/80`}><span className="sr-only">{targetLabel || "Translation"}: </span><TimedWords text={translation.text} enabled={prefs.wordGlow && active} startTime={line.time} endTime={line.endTime} currentTime={currentTime} /></p>}
                    {translation?.state === TRANSLATION_STATES.LOADING && <div className="reader-loading-bar mt-2 h-0.5 w-20 rounded-full" role="status" aria-label="Translating line" />}
                  </div>
                </div>
                <span className="hidden self-center justify-self-end rounded-full border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-white/35 md:block">{line.section}</span>
                {active && (
                  <div className="col-start-2 flex flex-wrap items-center gap-2 pt-1" onClick={(event) => event.stopPropagation()}>
                    <ChevronRight className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden="true" />
                    <button type="button" onClick={() => onReplay(line, index)} className="reader-control inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 font-mono text-[10px]"><RotateCcw className="h-3 w-3" /> Replay</button>
                    <button type="button" onClick={() => onPractice(line, index)} className="reader-control inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 font-mono text-[10px]"><Bookmark className="h-3 w-3" /> Practice</button>
                    <button type="button" onClick={() => onSeek(line.time)} className="reader-control inline-flex h-10 items-center gap-1.5 rounded-full bg-cyan-100/15 px-3 font-mono text-[10px] text-cyan-100"><Play className="h-3 w-3" /> Play</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
