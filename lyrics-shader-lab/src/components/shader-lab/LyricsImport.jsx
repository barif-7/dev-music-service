/**
 * LYRIC SHADER LAB — Lyrics File Importer
 * Upload a JSON or CSV file with timestamped lyrics.
 *
 * Expected JSON format:
 *   [{ "time": 4, "text": "Line text", "section": "verse" }, ...]
 *
 * Expected CSV format (header row required):
 *   time,text,section
 *   4,"Line text",verse
 */

import React, { useRef, useState } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, X } from "lucide-react";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    // Basic CSV parser — handles quoted fields
    const cols = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cols.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
}

function normalizeLyrics(raw) {
  return raw
    .map((r) => ({
      time:    parseFloat(r.time ?? r.t ?? 0),
      text:    String(r.text ?? r.lyric ?? r.line ?? "").trim(),
      section: String(r.section ?? r.type ?? "verse").toLowerCase(),
    }))
    .filter((r) => !isNaN(r.time))
    .sort((a, b) => a.time - b.time);
}

export default function LyricsImport({ onImport }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null); // null | "ok" | "error"
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);

  const handleFile = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target.result;
      try {
        let raw;
        if (ext === "json") {
          raw = JSON.parse(text);
          if (!Array.isArray(raw)) throw new Error("JSON must be an array");
        } else if (ext === "csv") {
          raw = parseCSV(text);
        } else {
          throw new Error("Unsupported format. Use .json or .csv");
        }

        const lyrics = normalizeLyrics(raw);
        if (lyrics.length === 0) throw new Error("No valid lyric lines found");

        setPreview(lyrics.slice(0, 3));
        setStatus("ok");
        setMessage(`${lyrics.length} lines loaded from ${file.name}`);
        onImport(lyrics);
      } catch (err) {
        setStatus("error");
        setMessage(err.message);
        setPreview(null);
      }
    };

    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div className="border border-border/50 rounded-lg bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
        <Upload className="w-3 h-3 text-primary" />
        <span className="text-[11px] font-mono font-medium text-primary tracking-wider uppercase flex-1">
          Import Lyrics
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">.json · .csv</span>
      </div>

      {/* Drop zone */}
      <div
        className="m-3 border border-dashed border-border/40 rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <FileText className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
        <p className="text-[10px] font-mono text-muted-foreground/60">
          Drop file here or <span className="text-primary">click to browse</span>
        </p>
        <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">
          time, text, section columns
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Status feedback */}
      {status && (
        <div className={`mx-3 mb-3 px-3 py-2 rounded-lg flex items-start gap-2 ${
          status === "ok"
            ? "bg-green-500/10 border border-green-500/20"
            : "bg-destructive/10 border border-destructive/20"
        }`}>
          {status === "ok"
            ? <CheckCircle2 className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
            : <AlertCircle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-mono ${status === "ok" ? "text-green-300" : "text-destructive"}`}>
              {message}
            </p>
            {preview && (
              <div className="mt-1.5 space-y-0.5">
                {preview.map((l, i) => (
                  <p key={i} className="text-[9px] font-mono text-muted-foreground/60 truncate">
                    [{l.time}s · {l.section}] {l.text || "—"}
                  </p>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { setStatus(null); setPreview(null); }}>
            <X className="w-3 h-3 text-muted-foreground/50 hover:text-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
