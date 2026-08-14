/**
 * LYRIC SHADER LAB — Performance Monitor Overlay
 * Tracks FPS and frame time. Overlaid on the visualizer canvas.
 */

import React, { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

const SAMPLE_COUNT = 60;

export default function PerfMonitor({ enabled }) {
  const [stats, setStats] = useState({ fps: 0, frameMs: 0, min: 0, max: 0 });
  const frameTimesRef = useRef([]);
  const lastFrameRef  = useRef(performance.now());
  const rafRef        = useRef(null);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const now = performance.now();
      const delta = now - lastFrameRef.current;
      lastFrameRef.current = now;

      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > SAMPLE_COUNT) {
        frameTimesRef.current.shift();
      }

      const frames = frameTimesRef.current;
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      const min = Math.min(...frames);
      const max = Math.max(...frames);

      setStats({
        fps: Math.round(1000 / avg),
        frameMs: avg.toFixed(1),
        min: min.toFixed(1),
        max: max.toFixed(1),
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  if (!enabled) return null;

  const fpsColor =
    stats.fps >= 55 ? "text-green-400" :
    stats.fps >= 30 ? "text-amber-400" :
                      "text-red-400";

  return (
    <div className="absolute top-3 right-3 z-30 bg-black/70 backdrop-blur-sm border border-border/30 rounded-lg px-3 py-2 space-y-1 pointer-events-none">
      <div className="flex items-center gap-1.5 mb-1">
        <Activity className="w-2.5 h-2.5 text-primary" />
        <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">perf</span>
      </div>
      <div className={`text-[13px] font-mono font-bold ${fpsColor}`}>
        {stats.fps} <span className="text-[9px] font-normal text-muted-foreground">FPS</span>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground/70 space-y-0.5">
        <div>frame <span className="text-foreground/80">{stats.frameMs}ms</span></div>
        <div>min   <span className="text-green-400/70">{stats.min}ms</span></div>
        <div>max   <span className="text-red-400/70">{stats.max}ms</span></div>
      </div>
    </div>
  );
}