/**
 * LYRIC SHADER LAB — Feature Attribution Panel
 * Shows where each visual-driving value originated.
 * Critical for debugging and trusting the visual pipeline.
 */

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

const SOURCE_COLORS = {
  reccobeats:      "text-cyan-400",
  spotify_legacy:  "text-green-400",
  neutral_default: "text-slate-500",
  self_analyzed:   "text-green-400",
  live_fft:        "text-lime-400",
  self_chroma:     "text-emerald-400",
  derived:         "text-violet-400",
  shader_mapper:   "text-blue-400",
  mock:            "text-amber-500",
};

const SOURCE_ABBREV = {
  reccobeats:      "reccobeats",
  spotify_legacy:  "spotify",
  neutral_default: "default",
  self_analyzed:   "self_analyzed",
  live_fft:        "live_fft",
  self_chroma:     "self_chroma",
  derived:         "derived",
  shader_mapper:   "shader",
  mock:            "mock",
};

function AttributionRow({ label, value, source, unit = "", scale = 1 }) {
  const colorClass = SOURCE_COLORS[source] || "text-slate-400";
  const abbrev = SOURCE_ABBREV[source] || source;
  const adjusted = typeof value === "number" ? Math.min(1, Math.max(0, value * scale)) : value;
  return (
    <div className="grid grid-cols-[120px_1fr_90px] items-center gap-1 py-0.5">
      <span className="text-[10px] font-mono text-muted-foreground truncate">{label}</span>
      <span className="text-[10px] font-mono text-foreground/80 truncate">
        {typeof value === "number" ? adjusted.toFixed(typeof unit === "string" && unit === "BPM" ? 0 : 2) : value}
        {unit ? <span className="text-muted-foreground/50 ml-1">{unit}</span> : null}
      </span>
      <span className={`text-[9px] font-mono ${colorClass} truncate text-right`}>
        {abbrev}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest py-1 border-b border-border/20 mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

export default function FeatureAttributionPanel({
  canonicalFeatures,
  derivedFeatures,
  uniforms,
  featureAttribution,
  derivedAttribution,
  shaderPreset,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activePreset, setActivePreset] = useState(shaderPreset);

  const f = canonicalFeatures || {};
  const d = derivedFeatures || {};
  const u = uniforms || {};
  const fa = featureAttribution || {};
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
          <ShieldCheck className="w-3 h-3 text-primary" />
          <span className="text-[11px] font-mono font-medium text-primary tracking-wider uppercase">
            Feature Attribution
          </span>
        </div>
        {collapsed
          ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
          : <ChevronUp   className="w-3 h-3 text-muted-foreground" />
        }
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3">
          {/* Column headers */}
          <div className="grid grid-cols-[120px_1fr_90px] text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider pt-1">
            <span>feature</span>
            <span>value</span>
            <span className="text-right">source</span>
          </div>

          <Section title="Track-Level (Canonical)">
            <AttributionRow label="tempo"           value={f.tempo}           unit="BPM" source={fa.tempo           || f.source || "mock"} />
            <AttributionRow label="energy"          value={f.energy}                     source={fa.energy          || f.source || "mock"} />
            <AttributionRow label="valence"         value={f.valence}                    source={fa.valence         || f.source || "mock"} />
            <AttributionRow label="danceability"    value={f.danceability}               source={fa.danceability    || f.source || "mock"} />
            <AttributionRow label="acousticness"    value={f.acousticness}               source={fa.acousticness    || f.source || "mock"} />
            <AttributionRow label="speechiness"     value={f.speechiness}                source={fa.speechiness     || f.source || "mock"} />
            <AttributionRow label="instrumentalness" value={f.instrumentalness}           source={fa.instrumentalness || f.source || "mock"} />
            <AttributionRow label="liveness"        value={f.liveness}                   source={fa.liveness        || f.source || "mock"} />
            <AttributionRow label="loudness"        value={f.loudness}        unit="dB"  source={fa.loudness        || f.source || "mock"} />
            <AttributionRow label="key"             value={f.key}                        source={fa.key             || f.source || "mock"} />
          </Section>

          <Section title="Live Frame (Web Audio)">
            <AttributionRow label="uAudioEnergy"   value={u.uAudioEnergy}    source="live_fft" scale={scale} />
            <AttributionRow label="uBassEnergy"    value={u.uBassEnergy}     source="live_fft" scale={scale} />
            <AttributionRow label="uMidEnergy"     value={u.uMidEnergy}      source="live_fft" scale={scale} />
            <AttributionRow label="uTrebleEnergy"  value={u.uTrebleEnergy}   source="live_fft" scale={scale} />
            <AttributionRow label="uBeatPulse"     value={u.uBeatPulse}      source="live_fft" scale={scale} />
          </Section>

          <Section title="Derived Visual">
            <AttributionRow label="brightness"       value={d.brightness}       source="derived" scale={scale} />
            <AttributionRow label="warmth"           value={d.warmth}           source="derived" scale={scale} />
            <AttributionRow label="tension"          value={d.tension}          source="derived" scale={scale} />
            <AttributionRow label="rhythmicStability" value={d.rhythmicStability} source="derived" scale={scale} />
            <AttributionRow label="motionIntensity"  value={d.motionIntensity}  source="derived" scale={scale} />
            <AttributionRow label="organicness"      value={d.organicness}      source="derived" scale={scale} />
            <AttributionRow label="vocalPresence"    value={d.vocalPresence}    source="derived" scale={scale} />
            <AttributionRow label="ambience"         value={d.ambience}         source="derived" scale={scale} />
          </Section>

          <Section title="Shader Uniforms">
            <AttributionRow label="uWarp"       value={u.uWarp}       source="shader_mapper" scale={scale} />
            <AttributionRow label="uChaos"      value={u.uChaos}      source="shader_mapper" scale={scale} />
            <AttributionRow label="uGrain"      value={u.uGrain}      source="shader_mapper" scale={scale} />
            <AttributionRow label="uBrightness" value={u.uBrightness} source="shader_mapper" scale={scale} />
            <AttributionRow label="uWarmth"     value={u.uWarmth}     source="shader_mapper" scale={scale} />
            <AttributionRow label="uHue"        value={u.uHue}        unit="°"  source="shader_mapper" scale={scale} />
            <AttributionRow label="uSaturation" value={u.uSaturation}           source="shader_mapper" scale={scale} />
          </Section>

          {/* Source legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 border-t border-border/20">
            {Object.entries(SOURCE_COLORS).map(([src, cls]) => (
              <span key={src} className={`text-[9px] font-mono ${cls}`}>
                ● {SOURCE_ABBREV[src]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
