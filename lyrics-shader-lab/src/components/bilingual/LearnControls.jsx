import { Bookmark, BookOpen, Gauge, RotateCcw, SkipBack } from "lucide-react";

function Action({ onClick, icon: Icon, label, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="reader-control inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 text-xs text-white/75 backdrop-blur-md hover:bg-black/45 hover:text-white disabled:opacity-40" aria-label={label}>
      <Icon className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );
}

export default function LearnControls({ onRepeat, onReplayPrevious, onSlow, onPractice, onVocabulary, hasOriginal, canUseVocabulary }) {
  return (
    <div data-reader-chrome className="absolute bottom-14 left-1/2 z-30 flex w-[min(720px,calc(100%-32px))] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 backdrop-blur-md" role="toolbar" aria-label="Language learning controls">
      <Action onClick={onRepeat} icon={RotateCcw} label="Repeat line" disabled={!hasOriginal} />
      <Action onClick={onReplayPrevious} icon={SkipBack} label="Previous line" disabled={!hasOriginal} />
      <Action onClick={onSlow} icon={Gauge} label="Slow playback" />
      <Action onClick={onPractice} icon={Bookmark} label="Practice" disabled={!hasOriginal} />
      <Action onClick={onVocabulary} icon={BookOpen} label="Vocabulary" disabled={!hasOriginal || !canUseVocabulary} />
    </div>
  );
}
