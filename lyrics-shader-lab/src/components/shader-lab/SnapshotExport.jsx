/**
 * LYRIC SHADER LAB — Snapshot Export
 * Copies the full VisualEngineSnapshot as JSON for porting into dev-music-service.
 */

import React, { useState } from "react";
import { Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SnapshotExport({ buildSnapshot, uniforms }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const snapshot = buildSnapshot();
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadUniforms = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadJSON(uniforms, `shader-uniforms-${timestamp}.json`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadUniforms}
        title="Download shader uniforms as JSON"
        className="h-7 text-[10px] font-mono border-border/40 text-muted-foreground hover:text-primary hover:border-primary/40 gap-1.5"
      >
        <Download className="w-3 h-3" />
        Uniforms
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="h-7 text-[10px] font-mono border-border/40 text-muted-foreground hover:text-primary hover:border-primary/40 gap-1.5"
      >
        {copied
          ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied</span></>
          : <><Copy className="w-3 h-3" />Snapshot</>
        }
      </Button>
    </div>
  );
}