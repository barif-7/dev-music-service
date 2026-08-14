import { useEffect, useState } from "react";
import { Bookmark, Copy, LoaderCircle, X } from "lucide-react";

import { getLanguage } from "@/lib/bilingual/languages";
import { copyText } from "@/lib/bilingual/textUtils";

export default function VocabularyCard({ word, sourceLanguage, targetLanguage, provider, onSave, onClose }) {
  const [result, setResult] = useState({ state: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult({ state: "loading" });
    provider.getVocabulary({ word, sourceLanguage, targetLanguage })
      .then((next) => { if (!cancelled) setResult(next); })
      .catch(() => { if (!cancelled) setResult({ state: "unavailable" }); });
    return () => { cancelled = true; };
  }, [provider, sourceLanguage, targetLanguage, word]);

  const source = getLanguage(sourceLanguage, "Original");
  const target = getLanguage(targetLanguage, "Translation");
  const handleCopy = async () => {
    if (!await copyText(word)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Vocabulary: ${word}`} className="absolute inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="reader-plate w-full max-w-md rounded-2xl border border-white/15 bg-slate-950/95 p-5 text-white shadow-2xl">
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Vocabulary · {source.name}</p>
            <h2 className="mt-1 break-words text-2xl font-bold" lang={sourceLanguage || "und"} dir={source.dir}>{word}</h2>
          </div>
          <button type="button" onClick={onClose} className="reader-control grid h-11 w-11 place-items-center rounded-full hover:bg-white/10" aria-label="Close vocabulary card"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-16">
          {result.state === "loading" && <p role="status" className="inline-flex items-center gap-2 text-sm text-white/60"><LoaderCircle className="h-4 w-4 animate-spin" /> Asking CaptionLocalizer…</p>}
          {result.state === "unavailable" && <p className="text-sm text-white/55">A trustworthy translation is not available for this word.</p>}
          {result.state === "available" && result.translation && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-100/60">{target.name}</p>
              <p className="mt-1 break-words text-xl" lang={targetLanguage} dir={target.dir}>{result.translation}</p>
              <p className="mt-3 text-xs leading-relaxed text-white/45">Only verified localizer output is shown. Definitions and pronunciation stay hidden when the provider does not return them.</p>
            </div>
          )}
        </div>
        <footer className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={handleCopy} className="reader-control inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-xs"><Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy word"}</button>
          <button type="button" onClick={() => onSave?.({ word, ...result })} disabled={result.state !== "available"} className="reader-control inline-flex h-11 items-center gap-2 rounded-full bg-cyan-100 px-4 text-xs font-semibold text-slate-950 disabled:opacity-40"><Bookmark className="h-4 w-4" /> Save for practice</button>
        </footer>
      </section>
    </div>
  );
}
