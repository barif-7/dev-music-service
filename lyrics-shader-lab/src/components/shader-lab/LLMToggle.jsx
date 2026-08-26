/**
 * LYRIC SHADER LAB — Server Analysis Toggle
 * Controls whether lyric analysis uses the server contract or local fallback.
 */

import React from "react";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Loader2 } from "lucide-react";

export default function LLMToggle({ enabled, onToggle, isAnalyzing }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/40 bg-card/40">
      <Sparkles className={`w-3.5 h-3.5 transition-colors ${enabled ? "text-violet-400" : "text-muted-foreground/40"}`} />
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] font-mono font-medium transition-colors ${
          enabled ? "text-violet-300" : "text-muted-foreground/60"
        }`}>
          Server Analyze
        </span>
      </div>
      {isAnalyzing && (
        <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
      )}
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        className="scale-75"
      />
    </div>
  );
}
