import { ChevronDown, Globe } from "lucide-react";

import { LANGUAGES } from "@/lib/bilingual/languages";

export default function LanguageSelect({ value, onChange, label = "Translation language", disabled, allowOriginal = false }) {
  return (
    <label className="flex w-full items-center gap-2">
      <span className="sr-only">{label}</span>
      <div className="relative flex-1">
        <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="reader-control h-11 w-full appearance-none rounded-md border border-border/50 bg-secondary/60 pl-9 pr-9 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          {allowOriginal && <option value="">Original only</option>}
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>{language.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </label>
  );
}
