import { useState } from "react";
import { LoaderCircle, Search, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TrackSearch({ onSelect, disabled }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runSearch = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/search?${new URLSearchParams({ query: query.trim(), limit: "5" })}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || `Search failed (${response.status})`);
      setResults(payload);
    } catch (searchError) {
      setError(searchError.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-2xl">
      <form onSubmit={runSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a track to visualize…"
          aria-label="Search tracks"
          className="h-9 bg-secondary/40 border-border/50 font-mono text-xs"
          disabled={disabled}
        />
        <Button type="submit" size="sm" className="h-9" disabled={disabled || loading || !query.trim()}>
          {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
          Search
        </Button>
      </form>
      {error && <p className="mt-1 text-[10px] font-mono text-destructive">{error}</p>}
      {results.length > 0 && (
        <div className="absolute z-50 top-11 left-0 right-0 rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
          {results.map((track) => (
            <button
              type="button"
              key={track.webpage_url}
              onClick={() => { setResults([]); onSelect(track); }}
              className="w-full flex items-center gap-3 p-2 text-left border-b border-border/30 last:border-0 hover:bg-secondary/70"
            >
              {track.thumbnail
                ? <img src={track.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                : <span className="w-10 h-10 rounded bg-secondary flex items-center justify-center"><Waves className="w-4 h-4" /></span>}
              <span className="min-w-0">
                <span className="block text-xs font-mono truncate">{track.title}</span>
                <span className="block text-[10px] font-mono text-muted-foreground truncate">
                  {track.artist || "Unknown artist"} · {Math.floor((track.duration || 0) / 60)}:{String((track.duration || 0) % 60).padStart(2, "0")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
