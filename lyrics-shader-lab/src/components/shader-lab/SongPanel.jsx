/**
 * LYRIC SHADER LAB — Song & Lyrics Panel
 * Displays song info, lyric timeline, playback controls, and scrubbing.
 */

import React, { useRef, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/shader-lab/timelineEngine";
import { ScrollArea } from "@/components/ui/scroll-area";

function SectionBadge({ section }) {
  const colors = {
    intro:  "text-cyan-400/60 border-cyan-400/20",
    verse:  "text-blue-400/60 border-blue-400/20",
    chorus: "text-amber-400/70 border-amber-400/30",
    bridge: "text-violet-400/60 border-violet-400/20",
    outro:  "text-slate-400/60 border-slate-400/20",
  };
  return (
    <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border rounded ${colors[section] || colors.verse}`}>
      {section}
    </span>
  );
}

export default function SongPanel({
  song,
  lyrics,
  activeIndex,
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  onLyricClick,
}) {
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  return (
    <div className="flex flex-col h-full border border-border/50 rounded-lg bg-card/60 backdrop-blur-sm overflow-hidden">
      {/* Song Header */}
      <div className="p-4 border-b border-border/30">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 border border-border/30">
            <Music2 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-mono font-semibold text-sm text-foreground truncate">
              {song.title}
            </h3>
            <p className="text-xs text-muted-foreground font-mono">{song.artist}</p>
            <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
              {song.album} · {song.bpm} BPM · {song.key}
            </p>
          </div>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="px-4 py-3 border-b border-border/30 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onSeek(Math.max(0, currentTime - 10))}
          >
            <SkipBack className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full border-primary/40 text-primary hover:bg-primary/10"
            onClick={onPlayPause}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onSeek(Math.min(duration, currentTime + 10))}
          >
            <SkipForward className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="space-y-1">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration}
            step={0.5}
            onValueChange={([v]) => onSeek(v)}
            className="cursor-pointer"
          />
          <div className="flex justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">
              {formatTime(currentTime)}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>

      {/* Lyrics List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {lyrics.length === 0 && (
            <p className="px-3 py-8 text-center text-[10px] font-mono text-muted-foreground/50">
              Search for a track to load synced lyrics.
            </p>
          )}
          {lyrics.map((line, i) => {
            const isActive = i === activeIndex;
            const isPast = i < activeIndex;
            return (
              <button
                key={i}
                ref={isActive ? activeRef : null}
                onClick={() => onLyricClick(line.time)}
                className={`w-full text-left px-3 py-2 rounded-md transition-all duration-300 flex items-start gap-2 group ${
                  isActive
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-secondary/40 border border-transparent"
                }`}
              >
                <span className={`text-[10px] font-mono shrink-0 mt-0.5 w-8 ${
                  isActive ? "text-primary" : "text-muted-foreground/50"
                }`}>
                  {formatTime(line.time)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-mono leading-relaxed transition-colors duration-300 ${
                    isActive
                      ? "text-primary font-medium"
                      : isPast
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground/70 group-hover:text-muted-foreground"
                  }`}>
                    {line.text || "· · ·"}
                  </p>
                </div>
                <SectionBadge section={line.section} />
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
