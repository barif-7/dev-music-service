import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Columns2, Cpu, GraduationCap, LoaderCircle, Settings2, Sparkles } from "lucide-react";

import BilingualTimeline from "@/components/bilingual/BilingualTimeline";
import LanguageSelect from "@/components/bilingual/LanguageSelect";
import LearnControls from "@/components/bilingual/LearnControls";
import LiveAnnouncer from "@/components/bilingual/LiveAnnouncer";
import VocabularyCard from "@/components/bilingual/VocabularyCard";
import DebugPanel from "@/components/shader-lab/DebugPanel";
import FeatureAttributionPanel from "@/components/shader-lab/FeatureAttributionPanel";
import IntegrationNotes from "@/components/shader-lab/IntegrationNotes";
import LLMToggle from "@/components/shader-lab/LLMToggle";
import LyricSequencer, { defaultOverride } from "@/components/shader-lab/LyricSequencer";
import LyricsImport from "@/components/shader-lab/LyricsImport";
import PresetLibrary from "@/components/shader-lab/PresetLibrary";
import ReaderOptions from "@/components/shader-lab/ReaderOptions";
import SnapshotExport from "@/components/shader-lab/SnapshotExport";
import SongPanel from "@/components/shader-lab/SongPanel";
import TrackSearch from "@/components/shader-lab/TrackSearch";
import VisualizerPanel from "@/components/shader-lab/VisualizerPanel";
import { Button } from "@/components/ui/button";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { mergeAudioFeatures } from "@/lib/audio-features/audioFeatureMerger";
import { deriveDerivedVisualFeatures } from "@/lib/audio-features/derivedVisualFeatures";
import { NEUTRAL_AUDIO_FEATURES } from "@/lib/audio-features/types";
import { createCaptionLocalizerProvider } from "@/lib/bilingual/captionLocalizerProvider";
import { getLanguage } from "@/lib/bilingual/languages";
import { cacheKey, getCached, TRANSLATION_STATES } from "@/lib/bilingual/translationService";
import { useBilingualReader } from "@/lib/bilingual/useBilingualReader";
import { devMusicServiceProvider } from "@/lib/providers/devMusicServiceProvider";
import { analyzeLyricLocal, getDefaultAnalysis } from "@/lib/shader-lab/lyricAnalyzer";
import { analyzeLyricWithLLM, devMusicServiceAnalysisProvider } from "@/lib/shader-lab/llmProvider";
import {
  buildRuntimeShaderCatalog,
  normalizeShaderPreset,
  shaderRecordToPreset,
} from "@/lib/shader-lab/shaderPresets";
import { buildShaderUniforms, getDefaultUniforms, lerpUniforms } from "@/lib/shader-lab/shaderUniformMapper";
import { getActiveLyricIndex } from "@/lib/shader-lab/timelineEngine";

const EMPTY_SONG = {
  title: "Choose a track",
  artist: "Search dev-music-service to begin",
  album: "Phase",
  duration: 180,
  bpm: 120,
  key: "—",
  stream_url: null,
};

const IS_EMBEDDED = new URLSearchParams(window.location.search).get("embedded") === "1";
const LAB_PREFERENCES_KEY = "phaseField.lyricLabPreferences";
const LAB_PRACTICE_KEY = "phaseField.lyricLabPractice";

function defaultLabPreferences() {
  return {
    windowShape: "rounded",
    windowAppearance: "window",
    layout: "stacked",
    originalSize: "standard",
    translationSize: "standard",
    lineSpacing: "normal",
    highContrast: false,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false,
    dyslexiaFont: false,
    srAnnouncements: true,
    showLabels: true,
    showTransliteration: true,
    textPlate: false,
    spectrumVisible: true,
    wordGlow: false,
    lyricsBehindShader: false,
  };
}

function readLabPreferences() {
  const defaults = defaultLabPreferences();
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(LAB_PREFERENCES_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function sectionForLine(line, index, lines, repetitions) {
  const ratio = lines.length > 1 ? index / (lines.length - 1) : 0;
  const normalized = line.text.trim().toLowerCase();
  if (!normalized || ratio < 0.06) return "intro";
  if (ratio > 0.9) return "outro";
  if ((repetitions.get(normalized) || 0) > 1) return "chorus";
  if (ratio > 0.58 && ratio < 0.76) return "bridge";
  return "verse";
}

function normalizeLyrics(payload) {
  const rawLines = Array.isArray(payload?.lines) ? payload.lines : [];
  const prepared = rawLines.map((line) => ({
    id: `lyric-${line.start_time_ms || 0}-${String(line.text || "").slice(0, 24)}`,
    time: Math.max(0, Number(line.start_time_ms || 0) / 1000),
    endTime: line.end_time_ms == null ? undefined : Number(line.end_time_ms) / 1000,
    text: String(line.text || "").trim(),
    localized: String(line.localized_text || "").trim(),
  }));
  const repetitions = prepared.reduce((counts, line) => {
    const key = line.text.toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  return prepared.map((line, index, lines) => ({
    ...line,
    section: sectionForLine(line, index, lines, repetitions),
  }));
}

function keyLabel(key, mode) {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return key >= 0 && key < names.length ? `${names[key]} ${mode === 0 ? "minor" : "major"}` : "—";
}

function trackFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title");
  const streamUrl = params.get("stream");
  if (!title || !streamUrl) return null;
  return {
    title,
    artist: params.get("artist") || "Unknown artist",
    album: params.get("album") || "",
    duration: Number(params.get("duration") || 0),
    thumbnail: params.get("thumbnail"),
    spotify_id: params.get("spotify_id"),
    stream_url: streamUrl,
  };
}

export default function LyricShaderLab() {
  const audioRef = useRef(null);
  const uniformsRef = useRef(getDefaultUniforms());
  const prevUniformsRef = useRef(getDefaultUniforms());
  const targetUniformsRef = useRef(getDefaultUniforms());
  const transitionStartRef = useRef(0);
  const lastAnalyzedIndexRef = useRef(-1);
  const initialTrackRef = useRef(trackFromQuery());
  const { frameRef, connect: connectAnalyser } = useAudioAnalyser(audioRef);

  const [song, setSong] = useState(EMPTY_SONG);
  const [lyrics, setLyrics] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  const [canonicalFeatures, setCanonicalFeatures] = useState(NEUTRAL_AUDIO_FEATURES);
  const [featureAttribution, setFeatureAttribution] = useState({});
  const [derivedFeatures, setDerivedFeatures] = useState(null);
  const [derivedAttribution, setDerivedAttribution] = useState({});
  const [lyricAnalysis, setLyricAnalysis] = useState(getDefaultAnalysis());
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [uniforms, setUniforms] = useState(getDefaultUniforms());
  const [frozenUniforms, setFrozenUniforms] = useState(null);
  const [showPerf, setShowPerf] = useState(false);
  const [shaderIndex, setShaderIndex] = useState(0);
  const [runtimeShaderCatalog, setRuntimeShaderCatalog] = useState(buildRuntimeShaderCatalog());
  const [shaderCatalogLoading, setShaderCatalogLoading] = useState(true);
  const [sequencerOverrides, setSequencerOverrides] = useState({});
  const [readerMode, setReaderMode] = useState("visual");
  const [targetLocale, setTargetLocale] = useState("");
  const [preferences, setPreferences] = useState(readLabPreferences);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [translationRevealed, setTranslationRevealed] = useState(true);
  const [vocabularyWord, setVocabularyWord] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [practiceLines, setPracticeLines] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAB_PRACTICE_KEY) || "[]"); }
    catch { return []; }
  });

  const duration = song.duration || lyrics.at(-1)?.endTime || lyrics.at(-1)?.time + 6 || 1;
  const activeLyric = activeIndex >= 0 ? lyrics[activeIndex] : null;
  const shaderPreset = normalizeShaderPreset(runtimeShaderCatalog[shaderIndex] || runtimeShaderCatalog[0], shaderIndex);
  const trackId = song.spotify_id || song.stream_url || `${song.title}:${song.artist}`;
  const sourceLocale = song.language || "auto";
  const targetLanguage = getLanguage(targetLocale, "Translation");
  const activeLyricId = activeLyric?.id || (activeLyric ? `lyric-${activeIndex}-${activeLyric.time}` : null);
  const activeSequencerOverride = activeLyricId ? (sequencerOverrides[activeLyricId] || defaultOverride()) : null;

  const displayedSong = useMemo(() => ({
    ...song,
    bpm: Math.round(canonicalFeatures.tempo || song.bpm || 120),
    key: keyLabel(canonicalFeatures.key, canonicalFeatures.mode),
  }), [canonicalFeatures, song]);
  const localizerProvider = useMemo(() => createCaptionLocalizerProvider(song), [song]);
  const handleAnnounce = useCallback((message) => {
    if (preferences.srAnnouncements) setAnnouncement(message);
  }, [preferences.srAnnouncements]);
  const { lineState, retry: retryTranslation } = useBilingualReader({
    trackId,
    lyrics,
    activeIndex,
    sourceLocale,
    targetLocale,
    provider: localizerProvider,
    onAnnounce: handleAnnounce,
  });

  useEffect(() => {
    try { localStorage.setItem(LAB_PREFERENCES_KEY, JSON.stringify(preferences)); } catch {}
  }, [preferences]);

  useEffect(() => {
    setTranslationRevealed(preferences.layout !== "focus" || readerMode !== "learn");
  }, [activeIndex, preferences.layout, readerMode, targetLocale]);

  useEffect(() => {
    if (!preferences.srAnnouncements || !activeLyric?.text) return;
    setAnnouncement(
      lineState.state === TRANSLATION_STATES.AVAILABLE && lineState.text
        ? `Original: ${activeLyric.text}. ${targetLanguage.name}: ${lineState.text}`
        : activeLyric.text,
    );
  }, [activeLyric, lineState, preferences.srAnnouncements, targetLanguage.name]);

  const translationFor = useCallback((line, index) => {
    if (!targetLocale || !line?.text) return { state: TRANSLATION_STATES.NOT_REQUESTED, text: "" };
    if (index === activeIndex) return lineState;
    if (line.localized) return { state: TRANSLATION_STATES.AVAILABLE, text: line.localized };
    return getCached(cacheKey(trackId, index, line.text, sourceLocale, targetLocale))
      || { state: TRANSLATION_STATES.NOT_REQUESTED, text: "" };
  }, [activeIndex, lineState, sourceLocale, targetLocale, trackId]);

  useEffect(() => {
    let cancelled = false;
    const loadShaders = async () => {
      setShaderCatalogLoading(true);
      try {
        const response = await fetch("/api/shaders");
        if (!response.ok) throw new Error(`Shader catalogue request failed (${response.status})`);
        const payload = await response.json();
        const shaders = Array.isArray(payload?.shaders) ? payload.shaders : Array.isArray(payload) ? payload : [];
        if (!cancelled && shaders.length) {
          const mapped = shaders.map((shader, index) => shaderRecordToPreset(shader, index));
          setRuntimeShaderCatalog(mapped);
          setShaderIndex(0);
        }
      } catch (error) {
        console.warn("[LyricsShaderLab] Using bundled visual presets:", error.message);
      } finally {
        if (!cancelled) setShaderCatalogLoading(false);
      }
    };
    loadShaders();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const result = deriveDerivedVisualFeatures(canonicalFeatures);
    setDerivedFeatures(result.derived);
    setDerivedAttribution(result.attribution);
  }, [canonicalFeatures]);

  const loadTrack = useCallback(async (track) => {
    const normalizedTrack = {
      ...track,
      artist: track.artist || "Unknown artist",
      album: track.album || "",
      duration: Number(track.duration || 0),
      stream_url: track.stream_url || track.streamUrl,
    };
    if (!normalizedTrack.stream_url) return;

    setTrackLoading(true);
    setTrackError("");
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveIndex(-1);
    setLyrics([]);
    setSequencerOverrides({});
    setFrozenUniforms(null);
    lastAnalyzedIndexRef.current = -1;
    audioRef.current.pause();
    audioRef.current.src = normalizedTrack.stream_url;
    audioRef.current.load();
    setSong(normalizedTrack);

    try {
      let spotifyId = normalizedTrack.spotify_id;
      if (!spotifyId) {
        try {
          const metadataParams = new URLSearchParams({
            query: `${normalizedTrack.title} ${normalizedTrack.artist}`,
            limit: "1",
            fields: "spotify_id",
          });
          const metadataResponse = await fetch(`/api/autocomplete?${metadataParams}`);
          if (metadataResponse.ok) spotifyId = (await metadataResponse.json())[0]?.spotify_id;
        } catch {
          // Metadata enrichment is optional; live Web Audio remains authoritative.
        }
      }

      const lyricsParams = new URLSearchParams({
        title: normalizedTrack.title,
        artist: normalizedTrack.artist,
      });
      if (normalizedTrack.album) lyricsParams.set("album", normalizedTrack.album);
      if (normalizedTrack.duration) lyricsParams.set("duration", String(Math.round(normalizedTrack.duration)));

      const [lyricsResult, providerData] = await Promise.all([
        fetch(`/api/lyrics?${lyricsParams}`).then(async (response) => {
          if (!response.ok) throw new Error(`Lyrics unavailable (${response.status})`);
          return response.json();
        }).catch(() => null),
        devMusicServiceProvider.getAudioFeatures({
          title: normalizedTrack.title,
          artist: normalizedTrack.artist,
          spotify_id: spotifyId,
          duration_ms: normalizedTrack.duration ? normalizedTrack.duration * 1000 : undefined,
        }),
      ]);

      const mappedLyrics = normalizeLyrics(lyricsResult);
      setLyrics(mappedLyrics);
      const merged = mergeAudioFeatures(providerData, null);
      setCanonicalFeatures(merged.merged);
      setFeatureAttribution(merged.attribution);
    } catch (error) {
      setTrackError(error.message);
    } finally {
      setTrackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTrackRef.current) loadTrack(initialTrackRef.current);
  }, [loadTrack]);

  useEffect(() => {
    const handleParentMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "lyrics-shader-lab:pause") audioRef.current?.pause();
    };
    window.addEventListener("message", handleParentMessage);
    return () => window.removeEventListener("message", handleParentMessage);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const syncTime = () => setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const syncDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setSong((current) => ({ ...current, duration: audio.duration }));
      }
    };
    const onPlay = () => {
      setIsPlaying(true);
      if (IS_EMBEDDED && window.parent !== window) {
        window.parent.postMessage({ type: "lyrics-shader-lab:playing" }, window.location.origin);
      }
    };
    const onPause = () => setIsPlaying(false);
    const onError = () => setTrackError("The selected stream could not be played.");
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    setActiveIndex(getActiveLyricIndex(lyrics, currentTime));
  }, [currentTime, lyrics]);

  const runAnalysis = useCallback(async (index) => {
    if (index === lastAnalyzedIndexRef.current) return;
    lastAnalyzedIndexRef.current = index;
    const lyric = index >= 0 ? lyrics[index] : null;
    if (!lyric?.text) {
      setLyricAnalysis(getDefaultAnalysis(lyric?.section || "intro"));
      return;
    }
    if (!llmEnabled) {
      setLyricAnalysis(analyzeLyricLocal(lyric.text, lyric.section));
      return;
    }
    setIsAnalyzing(true);
    const result = await analyzeLyricWithLLM(devMusicServiceAnalysisProvider, {
      songTitle: song.title,
      artist: song.artist,
      lyricLine: lyric.text,
      section: lyric.section,
    });
    setLyricAnalysis(result);
    setIsAnalyzing(false);
  }, [llmEnabled, lyrics, song.artist, song.title]);

  useEffect(() => { runAnalysis(activeIndex); }, [activeIndex, runAnalysis]);

  useEffect(() => {
    if (!derivedFeatures || frozenUniforms) return;
    const time = audioRef.current?.currentTime || 0;
    prevUniformsRef.current = { ...uniformsRef.current };
    targetUniformsRef.current = buildShaderUniforms(canonicalFeatures, derivedFeatures, lyricAnalysis, time);
    transitionStartRef.current = performance.now();
  }, [canonicalFeatures, derivedFeatures, frozenUniforms, lyricAnalysis]);

  useEffect(() => {
    let raf;
    const tick = () => {
      const time = audioRef.current?.currentTime || 0;
      const base = frozenUniforms || lerpUniforms(
        prevUniformsRef.current,
        targetUniformsRef.current,
        Math.min(1, (performance.now() - transitionStartRef.current) / 900),
      );
      const frame = frameRef.current;
      const live = frame.available ? {
        ...base,
        uTime: time,
        uAudioEnergy: frame.rms,
        uBassEnergy: frame.bassEnergy,
        uMidEnergy: frame.midEnergy,
        uTrebleEnergy: frame.trebleEnergy,
        uBeatPulse: Math.min(1, frame.onsetStrength * 1.4),
      } : { ...base, uTime: time };
      uniformsRef.current = live;
      setUniforms(live);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frameRef, frozenUniforms]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio?.src) return;
    if (audio.paused) {
      try {
        await connectAnalyser();
        await audio.play();
      } catch (error) {
        setTrackError(error.message || "Playback could not start.");
      }
    } else {
      audio.pause();
    }
  };

  const handleSeek = (time) => {
    const nextTime = Math.max(0, Math.min(duration, time));
    if (audioRef.current?.src) audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
    lastAnalyzedIndexRef.current = -1;
    setFrozenUniforms(null);
  };

  const handleLyricsImport = (importedLyrics) => {
    setLyrics(importedLyrics.map((line, index) => ({
      ...line,
      id: line.id || `imported-${index}-${line.time}`,
      localized: line.localized || "",
    })));
    setSequencerOverrides({});
    handleSeek(0);
    setActiveIndex(-1);
  };

  const handlePreference = (key, value) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleLanguageChange = (locale) => {
    setTargetLocale(locale);
    setTranslationRevealed(false);
  };

  const handleReplayPrevious = () => {
    const previous = lyrics[Math.max(0, activeIndex - 1)];
    if (previous) handleSeek(previous.time);
  };

  const handleSlowPlayback = () => {
    if (audioRef.current) audioRef.current.playbackRate = 0.75;
    setAnnouncement("Playback speed set to seventy-five percent.");
  };

  const handlePractice = (line = activeLyric, index = activeIndex) => {
    if (!line?.text) return;
    const id = line.id || `lyric-${index}-${line.time}`;
    setPracticeLines((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { localStorage.setItem(LAB_PRACTICE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setAnnouncement("Practice list updated.");
  };

  const handleVocabularyOpen = () => {
    const firstWord = activeLyric?.text?.split(/\s+/).find(Boolean) || "";
    setVocabularyWord(firstWord.replace(/[^\p{L}\p{N}']/gu, ""));
  };

  const handleSaveVocabulary = (entry) => {
    try {
      const key = "phaseField.lyricVocabulary";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([...existing, { ...entry, track: song, locale: targetLocale, savedAt: new Date().toISOString() }].slice(-200)));
    } catch {}
    setVocabularyWord("");
    setAnnouncement("Word saved for practice.");
  };

  const changeShader = useCallback((direction) => {
    setShaderIndex((current) => {
      const catalog = runtimeShaderCatalog.length ? runtimeShaderCatalog : buildRuntimeShaderCatalog();
      return (current + direction + catalog.length) % catalog.length;
    });
  }, [runtimeShaderCatalog]);

  const buildSnapshot = () => ({
    generatedAt: new Date().toISOString(),
    song,
    lyric: activeLyric,
    canonicalAudioFeatures: canonicalFeatures,
    selfAnalyzedAudioFeatures: frameRef.current,
    derivedVisualFeatures: derivedFeatures,
    shaderUniforms: uniforms,
    featureAttribution,
  });

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <audio ref={audioRef} preload="metadata" />
      <header className="border-b border-border/30 px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-3">
          {!IS_EMBEDDED && (
            <a href="/" className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center" title="Back to Phase">
              <ArrowLeft className="w-4 h-4 text-primary" />
            </a>
          )}
          <div className="mr-auto">
            <h1 className="font-mono font-bold text-sm tracking-wide">LYRICS SHADER LAB</h1>
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider">{IS_EMBEDDED ? "modal workspace" : "embedded"} · real audio · dev-music-service</p>
          </div>
          <TrackSearch onSelect={loadTrack} disabled={trackLoading} />
          <div className="w-44">
            <LanguageSelect value={targetLocale} onChange={handleLanguageChange} disabled={!lyrics.length} allowOriginal />
          </div>
          <div role="group" aria-label="Lyrics view" className="flex items-center gap-1 rounded-md bg-secondary/40 p-1">
            {[
              ["visual", "Visual", Sparkles],
              ["timeline", "Timeline", Columns2],
              ["learn", "Learn", GraduationCap],
            ].map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => setReaderMode(value)} aria-pressed={readerMode === value} className={`reader-control inline-flex h-9 items-center gap-1.5 rounded px-2.5 font-mono text-[10px] ${readerMode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setOptionsOpen((current) => !current)} aria-expanded={optionsOpen} aria-controls="readerOptionsPanel" className={`reader-control inline-flex h-11 items-center gap-2 rounded-md px-3 font-mono text-[10px] ${optionsOpen ? "bg-primary/15 text-primary" : "bg-secondary/40 text-muted-foreground hover:text-foreground"}`}>
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Reading
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setShowPerf(!showPerf)} className={showPerf ? "h-7 text-primary bg-primary/10" : "h-7 text-muted-foreground"}>
              <Activity className="w-3 h-3" /> Perf
            </Button>
            <SnapshotExport buildSnapshot={buildSnapshot} uniforms={uniforms} />
            <LLMToggle enabled={llmEnabled} onToggle={setLlmEnabled} isAnalyzing={isAnalyzing} />
          </div>
        </div>
      </header>

      <ReaderOptions open={optionsOpen} preferences={preferences} onChange={handlePreference} onClose={() => setOptionsOpen(false)} />

      {(trackLoading || trackError) && (
        <div className={`max-w-[1600px] mx-auto px-5 pt-3 text-[11px] font-mono ${trackError ? "text-destructive" : "text-primary"}`}>
          {trackLoading ? <span className="inline-flex items-center gap-2"><LoaderCircle className="w-3 h-3 animate-spin" /> Loading stream, lyrics, and track priors…</span> : trackError}
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-4 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[calc(100vh-130px)] lg:h-[calc(100vh-130px)]">
          <div className="lg:col-span-3 min-h-[420px] lg:min-h-0 overflow-hidden">
            <SongPanel
              song={displayedSong}
              lyrics={lyrics}
              activeIndex={activeIndex}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onLyricClick={handleSeek}
            />
          </div>

          <div className={`relative lg:col-span-6 min-h-[420px] lg:min-h-0 reader-shape-${preferences.windowShape} ${preferences.windowAppearance === "textOnly" ? "reader-text-only" : ""} ${preferences.windowAppearance === "shareSheet" ? "reader-share-sheet" : ""}`}>
            {readerMode === "timeline" ? (
              <BilingualTimeline
                lyrics={lyrics}
                activeIndex={activeIndex}
                currentTime={currentTime}
                duration={duration}
                prefs={preferences}
                targetLocale={targetLocale}
                targetLabel={targetLanguage.name}
                backgroundVisible={preferences.windowAppearance !== "textOnly"}
                onSeek={handleSeek}
                onReplay={(line) => handleSeek(line.time)}
                onPractice={handlePractice}
                translationFor={translationFor}
              />
            ) : (
              <VisualizerPanel
                uniforms={uniforms}
                lyricText={activeLyric?.text || (song.stream_url ? "Press play" : "Search for a track")}
                mood={lyricAnalysis.mood}
                energy={lyricAnalysis.energy}
                section={activeLyric?.section || "intro"}
                showPerf={showPerf}
                shaderPreset={shaderPreset}
                onPreviousShader={() => changeShader(-1)}
                onNextShader={() => changeShader(1)}
                shaderCatalogLoading={shaderCatalogLoading}
                backgroundVisible={preferences.windowAppearance !== "textOnly"}
                lyricsBehindShader={preferences.lyricsBehindShader}
                sequencerOverride={activeSequencerOverride}
                bilingual={{
                  originalLocale: sourceLocale === "auto" ? "" : sourceLocale,
                  originalLabel: "Original",
                  targetLocale,
                  targetLabel: targetLanguage.name,
                  lineState,
                  preferences,
                  onRetry: retryTranslation,
                  onWordSelect: setVocabularyWord,
                  learnMode: readerMode === "learn",
                  translationRevealed,
                  onRevealTranslation: () => setTranslationRevealed(true),
                  currentTime,
                  lineStartTime: activeLyric?.time,
                  lineEndTime: activeLyric?.endTime,
                }}
              />
            )}
            {readerMode === "learn" && (
              <LearnControls
                onRepeat={() => activeLyric && handleSeek(activeLyric.time)}
                onReplayPrevious={handleReplayPrevious}
                onSlow={handleSlowPlayback}
                onPractice={() => handlePractice()}
                onVocabulary={handleVocabularyOpen}
                hasOriginal={Boolean(activeLyric?.text)}
                canUseVocabulary={Boolean(targetLocale)}
              />
            )}
          </div>

          <div className="lg:col-span-3 space-y-3 overflow-y-auto min-h-0">
            <div className="border border-primary/20 rounded-lg bg-primary/5 p-3 flex gap-2">
              <Cpu className="w-4 h-4 text-primary shrink-0" />
              <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                Playback, lyrics, track priors, and shader metadata are loaded from this Phase server. Live movement comes from the playing audio stream.
              </p>
            </div>
            <LyricSequencer lyrics={lyrics} activeIndex={activeIndex} overrides={sequencerOverrides} onOverridesChange={setSequencerOverrides} onLyricsReorder={setLyrics} />
            {practiceLines.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-card/60 p-3">
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Saved for practice · {practiceLines.length}</h3>
                <p className="text-[10px] leading-relaxed text-muted-foreground/70">Practice marks are saved locally and stay available when the lab is reopened.</p>
              </div>
            )}
            <PresetLibrary uniforms={uniforms} onLoad={setFrozenUniforms} />
            <LyricsImport onImport={handleLyricsImport} />
            <DebugPanel uniforms={uniforms} analysis={lyricAnalysis} shaderPreset={shaderPreset} />
            <FeatureAttributionPanel
              canonicalFeatures={canonicalFeatures}
              derivedFeatures={derivedFeatures}
              uniforms={uniforms}
              featureAttribution={featureAttribution}
              derivedAttribution={derivedAttribution}
              shaderPreset={shaderPreset}
            />
            <IntegrationNotes />
          </div>
        </div>
      </main>
      <LiveAnnouncer enabled={preferences.srAnnouncements} message={announcement} />
      {vocabularyWord && targetLocale && (
        <VocabularyCard word={vocabularyWord} sourceLanguage={sourceLocale} targetLanguage={targetLocale} provider={localizerProvider} onSave={handleSaveVocabulary} onClose={() => setVocabularyWord("")} />
      )}
    </div>
  );
}
