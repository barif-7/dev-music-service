/**
 * LYRIC SHADER LAB — Shader Uniforms Debug Panel (v2)
 * Live display of all shader uniform values using the new ShaderUniformState schema.
 */

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Bug } from "lucide-react";

function UniformBar({ label, value, color = "bg-primary", scale = 1 }) {
  const adjusted = Math.min(1, Math.max(0, (value ?? 0) * scale));
  const pct = adjusted * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-muted-foreground w-28 shrink-0 text-right truncate">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-150 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">
        {typeof value === "number" ? adjusted.toFixed(2) : "—"}
      </span>
    </div>
  );
}

function ColorSwatch({ label, rgb }) {
  if (!rgb) return null;
  const color = `rgb(${(rgb[0] * 255) | 0}, ${(rgb[1] * 255) | 0}, ${(rgb[2] * 255) | 0})`;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-muted-foreground w-28 shrink-0 text-right">{label}</span>
      <div className="w-6 h-3 rounded border border-border/50" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-mono text-muted-foreground/60">{color}</span>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest pt-1.5 pb-0.5 border-t border-border/20">
      {children}
    </div>
  );
}

export default function DebugPanel({ uniforms, analysis, shaderPreset }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activePreset, setActivePreset] = useState(shaderPreset);
  const u = uniforms || {};
  const scale = activePreset?.barScale ?? 1;

  useEffect(() => {
    setActivePreset(shaderPreset);
  }, [shaderPreset]);

  useEffect(() => {
    const handlePresetChange = (event) => setActivePreset(event.detail);
    window.addEventListener("shader-preset-change", handlePresetChange);
    return () => window.removeEventListener("shader-preset-change", handlePresetChange);
  }, []);

  return (
    <div className="border border-border/50 rounded-lg bg-card/80 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bug className="w-3 h-3 text-primary" />
          <span className="text-[11px] font-mono font-medium text-primary tracking-wider uppercase">
            Shader Uniforms
          </span>
        </div>
        {collapsed ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronUp className="w-3 h-3 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-1">
          <SectionLabel>Live Frame</SectionLabel>
          <UniformBar label="uAudioEnergy"  value={u.uAudioEnergy}  color="bg-green-500" scale={scale} />
          <UniformBar label="uBassEnergy"   value={u.uBassEnergy}   color="bg-blue-400" scale={scale} />
          <UniformBar label="uMidEnergy"    value={u.uMidEnergy}    color="bg-cyan-400" scale={scale} />
          <UniformBar label="uTrebleEnergy" value={u.uTrebleEnergy} color="bg-teal-400" scale={scale} />
          <UniformBar label="uBeatPulse"    value={u.uBeatPulse}    color="bg-amber-400" scale={scale} />

          <SectionLabel>Track Priors</SectionLabel>
          <UniformBar label="uDanceability"     value={u.uDanceability}     color="bg-pink-500" scale={scale} />
          <UniformBar label="uValence"          value={u.uValence}          color="bg-rose-400" scale={scale} />
          <UniformBar label="uTempoBpm"         value={u.uTempoBpm}         color="bg-orange-400" scale={scale} />
          <UniformBar label="uAcousticness"     value={u.uAcousticness}     color="bg-lime-500" scale={scale} />
          <UniformBar label="uInstrumentalness" value={u.uInstrumentalness} color="bg-emerald-500" scale={scale} />
          <UniformBar label="uSpeechiness"      value={u.uSpeechiness}      color="bg-violet-500" scale={scale} />
          <UniformBar label="uLiveness"         value={u.uLiveness}         color="bg-indigo-400" scale={scale} />
          <UniformBar label="uLoudnessNorm"     value={u.uLoudnessNorm}     color="bg-yellow-500" scale={scale} />

          <SectionLabel>Visual Interpretation</SectionLabel>
          <UniformBar label="uBrightness" value={u.uBrightness} color="bg-amber-300" scale={scale} />
          <UniformBar label="uWarmth"     value={u.uWarmth}     color="bg-orange-400" scale={scale} />
          <UniformBar label="uTension"    value={u.uTension}    color="bg-red-500" scale={scale} />
          <UniformBar label="uChaos"      value={u.uChaos}      color="bg-red-400" scale={scale} />
          <UniformBar label="uWarp"       value={u.uWarp}       color="bg-pink-500" scale={scale} />
          <UniformBar label="uDensity"    value={u.uDensity}    color="bg-purple-500" scale={scale} />
          <UniformBar label="uGrain"      value={u.uGrain}      color="bg-slate-400" scale={scale} />

          <SectionLabel>Color Identity</SectionLabel>
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] font-mono text-muted-foreground w-28 text-right">uHue</span>
            <span className="text-[10px] font-mono text-foreground/70">{(u.uHue ?? 0).toFixed(0)}°</span>
          </div>
            <UniformBar label="uSaturation" value={u.uSaturation} color="bg-fuchsia-500" scale={scale} />
          <ColorSwatch label="uColorA" rgb={u.uColorA} />
          <ColorSwatch label="uColorB" rgb={u.uColorB} />

          {analysis?.visualPrompt && (
            <div className="pt-1.5 border-t border-border/30">
              <span className="text-[10px] font-mono text-muted-foreground/50 block mb-0.5">visualPrompt</span>
              <p className="text-[10px] font-mono text-primary/70 leading-relaxed italic">{analysis.visualPrompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
