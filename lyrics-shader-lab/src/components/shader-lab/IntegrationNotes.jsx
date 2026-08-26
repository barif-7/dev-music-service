/**
 * LYRIC SHADER LAB — Integration Notes Panel
 * Developer reference for porting this prototype into dev-music-service.
 */

import React, { useState } from "react";
import { FileCode, Server, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

const MODULES = [
  {
    name: "audio-features/types.js",
    path: "lib/audio-features/types.js",
    desc: "Canonical type definitions: CanonicalAudioFeatures, SelfAnalyzedAudioFeatures, DerivedVisualFeatures, ShaderUniformState.",
  },
  {
    name: "audioFeatureMerger.js",
    path: "lib/audio-features/audioFeatureMerger.js",
    desc: "Merges provider + self-analyzed features with attribution tracking. Never blocks visuals.",
  },
  {
    name: "derivedVisualFeatures.js",
    path: "lib/audio-features/derivedVisualFeatures.js",
    desc: "Maps canonical audio features → DerivedVisualFeatures (warmth, tension, organicness, etc.).",
  },
  {
    name: "devMusicServiceProvider.js",
    path: "lib/providers/devMusicServiceProvider.js",
    desc: "Same-origin canonical track-prior adapter with neutral fallback.",
  },
  {
    name: "shaderUniformMapper.js",
    path: "lib/shader-lab/shaderUniformMapper.js",
    desc: "Full pipeline mapper: canonical + derived + lyric → ShaderUniformState.",
  },
  {
    name: "colorIdentity.js",
    path: "lib/shader-lab/colorIdentity.js",
    desc: "Derives uColorA/uColorB from key, mode, valence, and lyric analysis.",
  },
  {
    name: "timelineEngine.js",
    path: "lib/shader-lab/timelineEngine.js",
    desc: "Pure logic for lyric sync, active line resolution, scrubbing. No React deps.",
  },
  {
    name: "lyricAnalyzer.js",
    path: "lib/shader-lab/lyricAnalyzer.js",
    desc: "Deterministic keyword-based lyric → LyricAnalysis mapping. LLM fallback.",
  },
  {
    name: "shaderPresets.js",
    path: "lib/shader-lab/shaderPresets.js",
    desc: "Canvas2D renderer layers. Replace with WebGL fragment shaders in production.",
  },
  {
    name: "llmProvider.js",
    path: "lib/shader-lab/llmProvider.js",
    desc: "LLM adapter interface. Swap provider for production backend proxy.",
  },
];

const ENDPOINTS = [
  { method: "GET",  path: "/api/search",                desc: "Resolve playable tracks" },
  { method: "GET",  path: "/api/stream",                desc: "Same-origin audio stream" },
  { method: "GET",  path: "/api/lyrics",                desc: "Fetch timestamped lyrics" },
  { method: "GET",  path: "/api/audio-features",        desc: "Canonical track priors with neutral fallback" },
  { method: "POST", path: "/api/visuals/llm-analyze",   desc: "Server-owned lyric visual analysis" },
  { method: "GET",  path: "/api/shaders",               desc: "Available Phase shader metadata" },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="text-muted-foreground/50 hover:text-primary transition-colors">
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function IntegrationNotes() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg bg-card/60 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono font-semibold text-primary tracking-wider uppercase">
            Integration Notes
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/50">
            dev-music-service
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Extractable Modules */}
          <div>
            <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <FileCode className="w-3 h-3" />
              Extractable Modules
            </h4>
            <div className="space-y-1">
              {MODULES.map((m) => (
                <div key={m.name} className="flex items-start gap-2 py-1.5 px-2 rounded bg-secondary/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono text-primary">{m.name}</code>
                      <CopyButton text={m.path} />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Backend Endpoints */}
          <div>
            <h4 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Server className="w-3 h-3" />
              Expected Backend Endpoints
            </h4>
            <div className="space-y-1">
              {ENDPOINTS.map((e) => (
                <div key={e.path} className="flex items-center gap-2 py-1.5 px-2 rounded bg-secondary/20">
                  <span className={`text-[10px] font-mono font-bold w-10 shrink-0 ${
                    e.method === "GET" ? "text-green-400" : "text-amber-400"
                  }`}>
                    {e.method}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/80 flex-1">{e.path}</code>
                  <CopyButton text={e.path} />
                </div>
              ))}
            </div>
          </div>

          {/* Feature Source Priority */}
          <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
            <p className="text-[10px] font-mono text-cyan-400/80 font-semibold mb-1.5 uppercase tracking-wider">
              Feature Source Priority
            </p>
            {[
              "1. Live Web Audio / FFT drives frame motion",
              "2. Spotify-compatible features provide track priors",
              "3. Deterministic lyric analysis shapes color and mood",
              "4. Neutral defaults keep visuals available offline",
            ].map((line, i) => (
              <p key={i} className="text-[10px] font-mono text-cyan-300/70 leading-relaxed">{line}</p>
            ))}
            <p className="text-[10px] font-mono text-cyan-400/50 mt-1.5 italic">
              Shader movement never depends on Spotify availability.
            </p>
          </div>

          {/* Secret handling */}
          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <p className="text-[10px] font-mono text-amber-400/80 leading-relaxed">
              <strong className="text-amber-400">SECRET HANDLING:</strong> All provider and analysis calls are
              same-origin FastAPI requests. No Base44 or model credential is bundled into this application.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
