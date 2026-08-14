import {
  Accessibility,
  AudioLines,
  BookOpenText,
  Captions,
  Circle,
  Columns2,
  Contrast,
  Eye,
  Focus,
  PanelBottomOpen,
  Pin,
  RectangleHorizontal,
  Rows3,
  Settings2,
  Sparkles,
  Square,
  Type,
  X,
} from "lucide-react";

const SHAPES = [
  { value: "rounded", label: "Rounded", description: "Wide with soft corners", icon: RectangleHorizontal },
  { value: "circle", label: "Circle", description: "Focused, centered view", icon: Circle },
  { value: "square", label: "Square", description: "Balanced reading area", icon: Square },
];

const WINDOW_APPEARANCES = [
  { value: "window", label: "Shader window", description: "Keep the animated lyric surface", icon: RectangleHorizontal },
  { value: "textOnly", label: "Text only", description: "Remove the window and leave floating lyrics", icon: Type },
  { value: "shareSheet", label: "Share sheet", description: "Lift lyrics into a softly animated modal", icon: PanelBottomOpen },
];

const TRANSLATION_LAYOUTS = [
  { value: "stacked", label: "Stacked", description: "Translation below the original", icon: Rows3 },
  { value: "sideBySide", label: "Side by side", description: "Compare both languages", icon: Columns2 },
  { value: "focus", label: "Focus", description: "Reveal the translation when ready", icon: Focus },
];

const TEXT_SIZES = [
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
];

const LINE_SPACING = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

function ChoiceGroup({ label, description, options, value, onChange }) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">{label}</legend>
      {description && <p className="text-xs leading-relaxed text-white/55">{description}</p>}
      <div className={`grid grid-cols-1 gap-2 ${options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {options.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-12 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${selected ? "border-cyan-200/55 bg-cyan-200/15 text-white" : "border-white/10 bg-white/5 text-white/65 hover:border-white/25 hover:text-white"}`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold">{Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}{option.label}</span>
              {option.description && <span className="mt-1 block text-[10px] leading-snug text-white/45">{option.description}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PreferenceToggle({ label, description, checked, onChange, icon: Icon }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-white/75 transition-colors hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
      <Icon className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-white">{label}</span><span className="mt-0.5 block text-[10px] leading-snug text-white/45">{description}</span></span>
      <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-cyan-300" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-slate-950 transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></span>
    </button>
  );
}

export default function ReaderOptions({ open, preferences, onChange, onClose }) {
  if (!open) return null;
  return (
    <section id="readerOptionsPanel" role="dialog" aria-modal="false" aria-labelledby="readerOptionsTitle" className="absolute left-4 top-16 z-40 max-h-[calc(100vh-88px)] w-[min(520px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/95 p-4 text-white shadow-2xl shadow-black/45 backdrop-blur-xl">
      <header className="mb-4 flex items-start gap-3">
        <Accessibility className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="readerOptionsTitle" className="text-sm font-semibold">Reading and learning options</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/55">Tune bilingual lyrics for comparison, language practice, low vision, dyslexia, and motion sensitivity.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close reading options" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><X className="h-4 w-4" aria-hidden="true" /></button>
      </header>

      <div className="space-y-5">
        <ChoiceGroup label="Window appearance" description="This changes the lyric surface without replacing the Visual, Timeline, or Learn view." options={WINDOW_APPEARANCES} value={preferences.windowAppearance} onChange={(value) => onChange("windowAppearance", value)} />
        <ChoiceGroup label="Window shape" options={SHAPES} value={preferences.windowShape} onChange={(value) => onChange("windowShape", value)} />
        <ChoiceGroup label="Translation layout" description="The language picker stays above the lyric window; this controls how its result is read." options={TRANSLATION_LAYOUTS} value={preferences.layout} onChange={(value) => onChange("layout", value)} />
        <ChoiceGroup label="Original lyric size" options={TEXT_SIZES} value={preferences.originalSize} onChange={(value) => onChange("originalSize", value)} />
        <ChoiceGroup label="Translation size" options={TEXT_SIZES} value={preferences.translationSize} onChange={(value) => onChange("translationSize", value)} />
        <ChoiceGroup label="Line spacing" options={LINE_SPACING} value={preferences.lineSpacing} onChange={(value) => onChange("lineSpacing", value)} />

        <div className="grid gap-2 sm:grid-cols-2">
          <PreferenceToggle label="Spectrum bars" description="Show the audio bars along the bottom edge." checked={preferences.spectrumVisible} onChange={(value) => onChange("spectrumVisible", value)} icon={AudioLines} />
          <PreferenceToggle label="Pin behind shader" description="Composite the animated shader over the lyric window, like video backdrop mode." checked={preferences.lyricsBehindShader} onChange={(value) => onChange("lyricsBehindShader", value)} icon={Pin} />
          <PreferenceToggle label="Word-by-word glow" description="Highlight the estimated word position as each timed line plays." checked={preferences.wordGlow} onChange={(value) => onChange("wordGlow", value)} icon={Sparkles} />
          <PreferenceToggle label="High contrast" description="Use brighter text with stronger edge shadows." checked={preferences.highContrast} onChange={(value) => onChange("highContrast", value)} icon={Contrast} />
          <PreferenceToggle label="Reduce motion" description="Stop lyric pulsing, jitter, and animated scrolling." checked={preferences.reducedMotion} onChange={(value) => onChange("reducedMotion", value)} icon={Settings2} />
          <PreferenceToggle label="Dyslexia-friendly text" description="Increase word spacing and use a clearer font stack." checked={preferences.dyslexiaFont} onChange={(value) => onChange("dyslexiaFont", value)} icon={BookOpenText} />
          <PreferenceToggle label="Screen-reader updates" description="Announce the active original and translation together." checked={preferences.srAnnouncements} onChange={(value) => onChange("srAnnouncements", value)} icon={Captions} />
          <PreferenceToggle label="Language labels" description="Identify original and translated regions explicitly." checked={preferences.showLabels} onChange={(value) => onChange("showLabels", value)} icon={Type} />
          <PreferenceToggle label="Text backplate" description="Add a soft plate behind lyrics without changing the window background." checked={preferences.textPlate} onChange={(value) => onChange("textPlate", value)} icon={Eye} />
        </div>

        <div className="flex gap-3 rounded-xl border border-cyan-200/15 bg-cyan-200/5 p-3">
          <Type className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-white/60">Learn mode makes each original word selectable. Vocabulary cards show only CaptionLocalizer output and never invent definitions or pronunciation.</p>
        </div>
      </div>
    </section>
  );
}
