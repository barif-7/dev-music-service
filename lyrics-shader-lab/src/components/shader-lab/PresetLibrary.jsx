/**
 * LYRIC SHADER LAB — Preset Library
 * Save, name, and toggle between named shader uniform presets.
 */

import React, { useState } from "react";
import { BookMarked, Plus, Trash2, Play, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PresetLibrary({ uniforms, onLoad }) {
  const [presets, setPresets] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [activePresetId, setActivePresetId] = useState(null);

  const savePreset = () => {
    const name = saveName.trim() || `Preset ${presets.length + 1}`;
    const preset = {
      id: Date.now(),
      name,
      uniforms: { ...uniforms },
      savedAt: new Date().toLocaleTimeString(),
    };
    setPresets((p) => [...p, preset]);
    setSaveName("");
  };

  const loadPreset = (preset) => {
    setActivePresetId(preset.id);
    onLoad(preset.uniforms);
  };

  const deletePreset = (id) => {
    setPresets((p) => p.filter((x) => x.id !== id));
    if (activePresetId === id) setActivePresetId(null);
  };

  return (
    <div className="border border-border/50 rounded-lg bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
        <BookMarked className="w-3 h-3 text-primary" />
        <span className="text-[11px] font-mono font-medium text-primary tracking-wider uppercase flex-1">
          Preset Library
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">{presets.length} saved</span>
      </div>

      {/* Save current state */}
      <div className="p-3 border-b border-border/20 flex gap-2">
        <Input
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && savePreset()}
          placeholder="Name this preset..."
          className="h-7 text-[11px] font-mono bg-secondary/40 border-border/40 flex-1"
        />
        <Button
          size="sm"
          onClick={savePreset}
          className="h-7 text-[10px] font-mono px-2 gap-1"
        >
          <Plus className="w-3 h-3" />
          Save
        </Button>
      </div>

      {/* Preset list */}
      <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
        {presets.length === 0 && (
          <p className="text-[10px] font-mono text-muted-foreground/40 text-center py-4">
            No presets saved yet.
          </p>
        )}
        {presets.map((preset) => (
          <div
            key={preset.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-all ${
              activePresetId === preset.id
                ? "bg-primary/10 border-primary/30"
                : "bg-secondary/20 border-transparent hover:bg-secondary/40"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-mono text-foreground truncate">{preset.name}</p>
              <p className="text-[9px] font-mono text-muted-foreground/50">{preset.savedAt}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {activePresetId === preset.id && (
                <Check className="w-3 h-3 text-primary" />
              )}
              <button
                onClick={() => loadPreset(preset)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                title="Load preset"
              >
                <Play className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => deletePreset(preset.id)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete preset"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}