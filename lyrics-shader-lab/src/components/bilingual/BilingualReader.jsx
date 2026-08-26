import { useState } from "react";
// `m` + LazyMotion loads only the DOM animation feature set instead of the
// whole library, with identical behaviour. Aliased so usage below is unchanged.
import { AnimatePresence, LazyMotion, domAnimation, m as motion } from "framer-motion";
import { Copy, Eye, RefreshCw } from "lucide-react";

import { getLanguage } from "@/lib/bilingual/languages";
import { copyText, detectDir } from "@/lib/bilingual/textUtils";
import { TRANSLATION_STATES } from "@/lib/bilingual/translationService";
import { getActiveLyricWordIndex, tokenizeLyricWords, wordGlowState } from "@/lib/bilingual/wordTiming";
import { getLyricMotion, wordJitter } from "@/lib/shader-lab/lyricMotion";

const SIZE_SCALE = {
  standard: { original: "text-2xl md:text-4xl", translation: "text-base md:text-xl" },
  large: { original: "text-3xl md:text-5xl", translation: "text-xl md:text-2xl" },
  xlarge: { original: "text-4xl md:text-6xl", translation: "text-2xl md:text-3xl" },
};

const LINE_SPACING = { compact: "leading-snug", normal: "leading-relaxed", relaxed: "leading-loose" };

const MOOD_TEXT = {
  calm: "text-cyan-200", euphoric: "text-amber-100", sad: "text-indigo-200",
  aggressive: "text-red-200", dreamy: "text-violet-200", chaotic: "text-yellow-100",
};

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!await copyText(text)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button type="button" onClick={handleCopy} aria-label={label} className="reader-control grid h-11 w-11 place-items-center rounded-full bg-black/25 text-white/70 hover:bg-black/45 hover:text-white">
      {copied ? <span aria-hidden="true">✓</span> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

function TimedWords({ text, enabled, startTime, endTime, currentTime }) {
  if (!enabled) return text;
  const activeWordIndex = getActiveLyricWordIndex(text, startTime, endTime, currentTime);
  return tokenizeLyricWords(text).map((token, tokenIndex) => (
    token.wordIndex < 0
      ? token.text
      : <span key={`${token.text}-${tokenIndex}`} className={`reader-word ${wordGlowState(token.wordIndex, activeWordIndex)}`}>{token.text}</span>
  ));
}

function TranslationRegion({ lineState, prefs, targetLocale, targetName, onRetry, startTime, endTime, currentTime }) {
  if (lineState.state === TRANSLATION_STATES.LOADING) {
    return <div role="status" aria-label="Translating lyric" className="reader-loading-bar mx-auto h-1 w-2/3 rounded-full" />;
  }
  if (lineState.state === TRANSLATION_STATES.ERROR) {
    return (
      <div className="flex items-center justify-center gap-2 text-amber-100">
        <span className="text-sm">Translation unavailable.</span>
        <button type="button" onClick={onRetry} className="reader-control inline-flex h-11 items-center gap-2 rounded-full bg-amber-200/15 px-4 text-xs">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }
  if (lineState.state === TRANSLATION_STATES.SAME_LANGUAGE) {
    return <p className="text-sm text-white/55">Already in {targetName}.</p>;
  }
  if (lineState.state === TRANSLATION_STATES.UNAVAILABLE) {
    return <p className="text-sm text-white/55">Translation is not available for this line.</p>;
  }
  if (lineState.state !== TRANSLATION_STATES.AVAILABLE || !lineState.text) return null;

  const language = getLanguage(targetLocale, targetName);
  return (
    <div className="space-y-1">
      <p
        className={`reader-text reader-translation break-words font-medium ${SIZE_SCALE[prefs.translationSize]?.translation || SIZE_SCALE.standard.translation} ${LINE_SPACING[prefs.lineSpacing] || LINE_SPACING.normal} text-white/85`}
        lang={targetLocale || "und"}
        dir={detectDir(lineState.text, targetLocale)}
      >
        <TimedWords text={lineState.text} enabled={prefs.wordGlow} startTime={startTime} endTime={endTime} currentTime={currentTime} />
      </p>
      {prefs.showTransliteration && lineState.translit && (
        <p className="font-mono text-xs text-cyan-100/70" dir="ltr">{lineState.translit}</p>
      )}
      <span className="sr-only">Translation direction: {language.dir === "rtl" ? "right to left" : "left to right"}</span>
    </div>
  );
}

export default function BilingualReader({
  originalText,
  originalLocale = "",
  originalLabel = "Original",
  targetLocale = "",
  targetLabel = "Translation",
  section,
  mood,
  uniforms,
  lineState,
  prefs,
  onRetry,
  onWordSelect,
  learnMode = false,
  translationRevealed = true,
  onRevealTranslation,
  currentTime = 0,
  lineStartTime,
  lineEndTime,
  pinnedBehindShader = false,
  sequencerOverride = null,
}) {
  const reducedMotion = prefs.reducedMotion;
  const motionValues = getLyricMotion(uniforms);
  const targetLanguage = getLanguage(targetLocale, targetLabel);
  const hasTranslationMode = Boolean(targetLocale);
  const effectiveLayout = prefs.windowShape === "circle" ? "stacked" : prefs.layout;
  const sideBySide = hasTranslationMode && effectiveLayout === "sideBySide";
  const showTranslation = hasTranslationMode && (effectiveLayout !== "focus" || translationRevealed);
  const words = originalText && (learnMode || prefs.wordGlow || (!reducedMotion && motionValues.jitterActive))
    ? tokenizeLyricWords(originalText)
    : [];
  const activeWordIndex = prefs.wordGlow
    ? getActiveLyricWordIndex(originalText, lineStartTime, lineEndTime, currentTime)
    : -1;
  const sequencedSize = { sm: "standard", md: prefs.originalSize, lg: "large", xl: "xlarge" }[sequencerOverride?.size];
  const primarySize = SIZE_SCALE[sequencedSize || prefs.originalSize]?.original || SIZE_SCALE.standard.original;
  const lineSpacing = LINE_SPACING[prefs.lineSpacing] || LINE_SPACING.normal;
  const textColor = prefs.highContrast ? "text-white" : MOOD_TEXT[mood] || MOOD_TEXT.calm;
  const glow = prefs.highContrast
    ? "0 3px 12px rgba(0,0,0,1),0 0 30px rgba(0,0,0,.95)"
    : "0 2px 26px rgba(0,0,0,.88),0 0 48px rgba(0,0,0,.55),0 0 18px rgba(255,255,255,.16)";
  const positionClass = {
    top: "items-start pt-20",
    center: "items-center",
    bottom: "items-end pb-20",
  }[sequencerOverride?.position] || "items-center";
  const enterMotion = {
    "fade-up": { opacity: 0, y: 28, scale: 0.97 },
    "fade-down": { opacity: 0, y: -28, scale: 0.97 },
    fade: { opacity: 0 },
    "zoom-in": { opacity: 0, scale: 0.72 },
    "slide-left": { opacity: 0, x: 56 },
    typewriter: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
  }[sequencerOverride?.enter] || { opacity: 0, y: 24, scale: 0.97 };
  const exitMotion = {
    "fade-up": { opacity: 0, y: -24, scale: 0.97 },
    "fade-down": { opacity: 0, y: 24, scale: 0.97 },
    fade: { opacity: 0 },
    "zoom-out": { opacity: 0, scale: 0.72 },
    "slide-left": { opacity: 0, x: -56 },
  }[sequencerOverride?.exit] || { opacity: 0, y: -20, scale: 0.97 };

  const plate = (
    <motion.div
      key={originalText || "empty"}
      initial={reducedMotion ? false : enterMotion}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, clipPath: "inset(0 0% 0 0)" }}
      exit={reducedMotion ? { opacity: 1 } : exitMotion}
      transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`reader-plate pointer-events-auto relative w-full ${sideBySide ? "max-w-5xl" : "max-w-3xl"} rounded-2xl p-5 sm:p-7 ${prefs.textPlate && prefs.windowAppearance !== "textOnly" ? "border border-white/10 bg-black/35 backdrop-blur-sm" : "border border-transparent bg-transparent"}`}
    >
      <div className={sideBySide ? "grid grid-cols-2 items-center gap-8" : "space-y-4"}>
        <section aria-label="Original lyric" className={`min-w-0 text-center ${sideBySide ? "border-r border-white/15 pr-8" : ""}`}>
          {prefs.showLabels && hasTranslationMode && <span className="reader-label mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">{originalLabel}</span>}
          <motion.p
            className={`reader-text break-words font-display font-bold ${primarySize} ${lineSpacing} ${textColor}`}
            style={{ textShadow: glow, willChange: reducedMotion ? undefined : "transform, filter" }}
            animate={reducedMotion ? undefined : {
              scale: motionValues.scale,
              letterSpacing: motionValues.letterSpacing,
              rotate: motionValues.rotate,
              skewX: motionValues.skewX,
              filter: `hue-rotate(${motionValues.hueRotate}deg) brightness(${motionValues.filterBrightness.toFixed(2)}) blur(${motionValues.blur.toFixed(2)}px)`,
            }}
            transition={reducedMotion ? undefined : { duration: 0.18, ease: "easeOut" }}
            lang={originalLocale || "und"}
            dir={detectDir(originalText, originalLocale)}
          >
            {words.length ? words.map((token, index) => {
              if (token.wordIndex < 0) return token.text;
              const clean = token.text.replace(/[^\p{L}\p{N}']/gu, "");
              const wordMotion = reducedMotion || !motionValues.jitterActive ? {} : {
                animate: wordJitter(token.wordIndex, motionValues.chaos),
                transition: { duration: 0.22, ease: "easeOut" },
              };
              return (
                <span key={`${token.text}-${index}`}>
                  <motion.span className={`reader-word inline-block ${wordGlowState(token.wordIndex, activeWordIndex)}`} {...wordMotion}>
                    {learnMode ? (
                      <button type="button" onClick={() => clean && onWordSelect?.(clean)} className="reader-control pointer-events-auto underline-offset-4 hover:underline focus-visible:underline" aria-label={`Look up ${clean || token.text}`}>
                        {token.text}
                      </button>
                    ) : token.text}
                  </motion.span>
                </span>
              );
            }) : originalText || "· · ·"}
          </motion.p>
        </section>

        {showTranslation && (
          <section aria-label={`Translation in ${targetLanguage.name}`} className="min-w-0 text-center">
            {prefs.showLabels && <span className="reader-label mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-100/75" dir={targetLanguage.dir}>{targetLabel || targetLanguage.name}</span>}
            <TranslationRegion lineState={lineState} prefs={prefs} targetLocale={targetLocale} targetName={targetLabel || targetLanguage.name} onRetry={onRetry} startTime={lineStartTime} endTime={lineEndTime} currentTime={currentTime} />
          </section>
        )}
      </div>

      {(learnMode || (hasTranslationMode && effectiveLayout === "focus" && !translationRevealed)) && (
        <div className="mt-5 flex min-h-11 items-center justify-center gap-2 border-t border-white/10 pt-3">
          {effectiveLayout === "focus" && !translationRevealed && (
            <button type="button" onClick={onRevealTranslation} className="reader-control inline-flex h-11 items-center gap-2 rounded-full bg-cyan-100 px-4 text-xs font-semibold text-slate-950">
              <Eye className="h-4 w-4" aria-hidden="true" /> Show translation
            </button>
          )}
          {learnMode && <CopyButton text={originalText} label="Copy original lyric" />}
          {learnMode && lineState.state === TRANSLATION_STATES.AVAILABLE && <CopyButton text={lineState.text} label="Copy translated lyric" />}
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/35">{section} · {mood}</span>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className={`absolute inset-0 z-10 flex justify-center p-6 sm:p-8 ${positionClass} ${pinnedBehindShader ? "reader-lyrics-underlay" : ""} ${prefs.highContrast ? "reader-high-contrast" : ""} ${prefs.dyslexiaFont ? "reader-dyslexia" : ""} ${reducedMotion ? "reader-reduced-motion" : ""}`}>
      <LazyMotion features={domAnimation}>
        {reducedMotion ? plate : <AnimatePresence mode="wait">{plate}</AnimatePresence>}
      </LazyMotion>
    </div>
  );
}
