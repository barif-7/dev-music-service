import { lazy, Suspense } from "react";

const LyricShaderLab = lazy(() => import("@/pages/LyricShaderLab"));
const LyricsReaderSurface = lazy(() => import("@/pages/LyricsReaderSurface"));
const VocabularySurface = lazy(() => import("@/pages/VocabularySurface"));

export default function App() {
  const isReader = new URLSearchParams(window.location.search).get("surface") === "reader";
  const isVocabulary = window.location.pathname.startsWith('/vocabulary') || new URLSearchParams(window.location.search).get('surface') === 'vocabulary';
  document.documentElement.classList.toggle("reader-surface", isReader);
  document.body.classList.toggle("reader-surface", isReader);
  for (const element of [document.documentElement, document.body, document.getElementById("root")]) {
    if (!element) continue;
    element.style.backgroundColor = isReader ? "transparent" : "";
    element.style.backgroundImage = isReader ? "none" : "";
  }
  return (
    <Suspense fallback={<div className={isReader ? "h-screen bg-transparent" : "min-h-screen bg-background"} aria-label="Loading Lyrics Shader Lab" />}>
      {isVocabulary ? <VocabularySurface /> : isReader ? <LyricsReaderSurface /> : <LyricShaderLab />}
    </Suspense>
  );
}
