/**
 * LYRIC SHADER LAB — Live Lyric Display
 * Shows the active lyric as animated text overlaying the shader canvas.
 */

import React from "react";
// `m` is framer-motion's tree-shakeable component; paired with LazyMotion it
// loads only the DOM animation feature set instead of the whole library, with
// identical behaviour. Aliased to `motion` so usage below is unchanged.
import { AnimatePresence, LazyMotion, domAnimation, m as motion } from "framer-motion";

const MOOD_TEXT_CLASSES = {
  calm:       "text-cyan-300/90",
  euphoric:   "text-amber-200",
  sad:        "text-indigo-300/80",
  aggressive: "text-red-300",
  dreamy:     "text-violet-300/90",
  chaotic:    "text-yellow-200",
};

const MOOD_GLOW = {
  calm:       "0 0 30px rgba(103,232,249,0.3)",
  euphoric:   "0 0 40px rgba(245,158,11,0.4), 0 0 80px rgba(236,72,153,0.2)",
  sad:        "0 0 30px rgba(99,102,241,0.3)",
  aggressive: "0 0 40px rgba(239,68,68,0.4), 0 0 80px rgba(239,68,68,0.15)",
  dreamy:     "0 0 30px rgba(124,58,237,0.4), 0 0 60px rgba(6,182,212,0.2)",
  chaotic:    "0 0 40px rgba(250,204,21,0.3), 0 0 80px rgba(220,38,38,0.2)",
};

const PRIMARY_TEXT_SIZES = {
  standard: "text-2xl md:text-4xl",
  large: "text-3xl md:text-5xl",
  "extra-large": "text-4xl md:text-6xl",
};

const CHORUS_TEXT_SIZES = {
  standard: "text-3xl md:text-5xl",
  large: "text-4xl md:text-6xl",
  "extra-large": "text-5xl md:text-7xl",
};

const SECONDARY_TEXT_SIZES = {
  standard: "text-base md:text-xl",
  large: "text-xl md:text-2xl",
  "extra-large": "text-2xl md:text-3xl",
};

export default function LyricDisplay({
  lyricText,
  secondaryText,
  secondaryLabel,
  mood,
  energy,
  section,
  wallpaperBlend = false,
  translationLayout = "stacked",
  textScale = "standard",
  highContrast = false,
  reduceMotion = false,
}) {
  const textClass = highContrast
    ? "text-white"
    : wallpaperBlend
      ? "text-white/95"
      : MOOD_TEXT_CLASSES[mood] || MOOD_TEXT_CLASSES.calm;
  const glowStyle = wallpaperBlend
    ? highContrast
      ? "0 3px 12px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,.95)"
      : "0 2px 26px rgba(0,0,0,.88), 0 0 48px rgba(0,0,0,.55), 0 0 18px rgba(255,255,255,.16)"
    : MOOD_GLOW[mood] || MOOD_GLOW.calm;
  const isChorus = section === "chorus";
  const primarySize = (isChorus ? CHORUS_TEXT_SIZES : PRIMARY_TEXT_SIZES)[textScale] || PRIMARY_TEXT_SIZES.standard;
  const secondarySize = SECONDARY_TEXT_SIZES[textScale] || SECONDARY_TEXT_SIZES.standard;
  const comparing = Boolean(secondaryText);
  const sideBySide = comparing && translationLayout === "side-by-side";

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-8 pointer-events-none">
      <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        {lyricText && (
          <motion.div
            key={lyricText}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -15, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            className={`w-full text-center ${sideBySide ? "max-w-5xl" : "max-w-3xl"}`}
          >
            <div className={sideBySide ? "grid grid-cols-2 items-center gap-8" : "space-y-4"}>
              <div dir="auto" className={sideBySide ? "min-w-0 border-r border-white/15 pr-8" : "min-w-0"}>
                {comparing && (
                  <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">Original</span>
                )}
                <motion.p
                  className={`font-display font-bold leading-tight ${textClass} ${primarySize}`}
                  style={{ textShadow: glowStyle }}
                  animate={reduceMotion ? undefined : { scale: [1, 1 + energy * 0.03, 1] }}
                  transition={reduceMotion ? undefined : { duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                >
                  {lyricText}
                </motion.p>
              </div>

              {secondaryText && (
                <motion.div
                  dir="auto"
                  className={sideBySide ? "min-w-0 text-left" : "mx-auto max-w-2xl"}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.15, duration: reduceMotion ? 0 : 0.4 }}
                >
                  <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-100/75">
                    {secondaryLabel || "Translation"}
                  </span>
                  <p className={`font-medium leading-relaxed ${highContrast ? "text-white" : "text-white/75"} ${secondarySize}`} style={{ textShadow: glowStyle }}>
                    {secondaryText}
                  </p>
                </motion.div>
              )}
            </div>

            <motion.div
              className="mt-5 flex items-center justify-center gap-2"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: highContrast ? 0.8 : 0.5 }}
              transition={{ delay: reduceMotion ? 0 : 0.3 }}
            >
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/55">
                {section}
              </span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/55">
                {mood}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </LazyMotion>
    </div>
  );
}
