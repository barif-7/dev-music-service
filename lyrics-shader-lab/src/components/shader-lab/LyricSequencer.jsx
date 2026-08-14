import { useCallback, useState } from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { ChevronDown, ChevronUp, GripVertical, Layers } from "lucide-react";

export const ENTER_OPTIONS = [
  ["fade-up", "Fade Up"],
  ["fade-down", "Fade Down"],
  ["fade", "Fade"],
  ["zoom-in", "Zoom In"],
  ["slide-left", "Slide Left"],
  ["typewriter", "Typewriter"],
].map(([value, label]) => ({ value, label }));

export const EXIT_OPTIONS = [
  ["fade-up", "Fade Up"],
  ["fade-down", "Fade Down"],
  ["fade", "Fade"],
  ["zoom-out", "Zoom Out"],
  ["slide-left", "Slide Left"],
].map(([value, label]) => ({ value, label }));

export const POSITION_OPTIONS = [
  ["top", "Top"],
  ["center", "Center"],
  ["bottom", "Bottom"],
].map(([value, label]) => ({ value, label }));

export const SIZE_OPTIONS = [
  ["sm", "S"],
  ["md", "M"],
  ["lg", "L"],
  ["xl", "XL"],
].map(([value, label]) => ({ value, label }));

export function defaultOverride() {
  return { enter: "fade-up", exit: "fade-up", position: "center", size: "md" };
}

function OptionPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`min-h-8 rounded px-2 text-[9px] font-mono transition-colors ${value === option.value ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SequencerRow({ item, index, active, override, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const update = useCallback((key, value) => onUpdate(item.id, { ...override, [key]: value }), [item.id, onUpdate, override]);
  const sectionColor = {
    intro: "text-cyan-400/60",
    verse: "text-blue-400/60",
    chorus: "text-amber-400/80",
    bridge: "text-violet-400/70",
    outro: "text-slate-400/60",
  }[item.section] || "text-muted-foreground/50";

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className={`mb-1 rounded-lg border transition-all ${snapshot.isDragging ? "border-primary/60 bg-primary/10 shadow-lg" : active ? "border-primary/40 bg-primary/5" : "border-border/30 bg-card/60"}`}>
          <div className="flex min-h-11 items-center gap-2 px-2 py-1.5">
            <button type="button" {...provided.dragHandleProps} className="grid h-9 w-8 shrink-0 cursor-grab place-items-center text-muted-foreground/40 hover:text-muted-foreground" aria-label={`Reorder lyric at ${item.time} seconds`}>
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 shrink-0 font-mono text-[9px] text-muted-foreground/45">{item.time.toFixed(1)}s</span>
            <span className={`hidden w-12 shrink-0 font-mono text-[9px] uppercase sm:block ${sectionColor}`}>{item.section}</span>
            <span className={`min-w-0 flex-1 truncate font-mono text-[10px] ${active ? "text-primary" : "text-foreground/70"}`}>{item.text || "— silence —"}</span>
            {!expanded && <span className="hidden rounded bg-secondary/40 px-1 font-mono text-[8px] text-muted-foreground/50 md:block">{override.enter} · {override.position} · {override.size}</span>}
            <button type="button" onClick={() => setExpanded((current) => !current)} className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground/50 hover:text-foreground" aria-expanded={expanded} aria-label={`${expanded ? "Close" : "Edit"} animation options`}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          {expanded && (
            <div className="grid gap-3 border-t border-border/20 px-3 pb-3 pt-2 sm:grid-cols-2">
              <label className="space-y-1"><span className="font-mono text-[9px] uppercase text-muted-foreground/45">Enter</span><OptionPills options={ENTER_OPTIONS} value={override.enter} onChange={(value) => update("enter", value)} /></label>
              <label className="space-y-1"><span className="font-mono text-[9px] uppercase text-muted-foreground/45">Exit</span><OptionPills options={EXIT_OPTIONS} value={override.exit} onChange={(value) => update("exit", value)} /></label>
              <label className="space-y-1"><span className="font-mono text-[9px] uppercase text-muted-foreground/45">Position</span><OptionPills options={POSITION_OPTIONS} value={override.position} onChange={(value) => update("position", value)} /></label>
              <label className="space-y-1"><span className="font-mono text-[9px] uppercase text-muted-foreground/45">Size</span><OptionPills options={SIZE_OPTIONS} value={override.size} onChange={(value) => update("size", value)} /></label>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

export default function LyricSequencer({ lyrics, activeIndex, overrides, onOverridesChange, onLyricsReorder }) {
  const [collapsed, setCollapsed] = useState(true);
  const items = lyrics.map((line, index) => ({ ...line, id: line.id || `lyric-${index}-${line.time}` }));
  const updateOverride = useCallback((id, override) => onOverridesChange({ ...overrides, [id]: override }), [onOverridesChange, overrides]);
  const handleDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = Array.from(lyrics);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onLyricsReorder(reordered);
  };

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm">
      <button type="button" onClick={() => setCollapsed((current) => !current)} className="flex min-h-11 w-full items-center justify-between px-3 py-2 hover:bg-secondary/30" aria-expanded={!collapsed}>
        <span className="flex items-center gap-2"><Layers className="h-3.5 w-3.5 text-primary" /><span className="font-mono text-[11px] font-medium uppercase tracking-wider text-primary">Lyric Sequencer</span><span className="font-mono text-[9px] text-muted-foreground/50">{items.length} lines</span></span>
        {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="max-h-[420px] overflow-y-auto px-2 pb-2">
          <p className="border-b border-border/20 px-1 py-2 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/40">Drag to reorder · expand to edit lyric motion</p>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="lyric-sequencer">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {items.map((item, index) => <SequencerRow key={item.id} item={item} index={index} active={index === activeIndex} override={overrides[item.id] || defaultOverride()} onUpdate={updateOverride} />)}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}
    </section>
  );
}
