/* Phase · Field — sound-reactivity config (source of truth)
   Per-wallpaper tuning of the iMid/iVocal sound-reactive feature, by focus preset
   + intended BPM. The JS counterpart to the MID_GAIN/VOCAL_GAIN shader defines. */
const reactivityPlugin = {
  default:  'preset',          // 'preset' follows each wallpaper's focus preset
  fallback: 'flow',            // used when a wallpaper has no / unknown preset
  enabled: true,               // master on/off switch for sound reactivity
  profiles: {
    rest:  { react: 0.55 },    // wind-down · subtle
    flow:  { react: 0.85 },    // deep focus · moderate
    spark: { react: 1.15 },    // task-switching · bright
    drive: { react: 1.30 },    // sprint · punchy
    preset:{ follow: true },   // separate profile: defer to the wallpaper's preset
  },
  overrides: {                 // plug in per-wallpaper deviations, e.g. tunnel: 'drive'
  },
  bpmRef:  96,                 // tempo at which the BPM trim is neutral
  bpmSpan: 0.20,               // ± BPM influence on top of the chosen profile
  /* Resolve a wallpaper id → its reactivity scale (profile · BPM trim, clamped). */
  scaleFor(id){
    if(!this.enabled) return 0;
    const w = (typeof ALTS !== 'undefined') ? ALTS.find(x => x.id === id) : null;
    let name = this.overrides[id] || this.default;
    if((this.profiles[name] || {}).follow) name = (w && w.preset && w.preset.toLowerCase()) || this.fallback;
    const prof = this.profiles[name] || this.profiles[this.fallback];
    const bpm  = (w && w.bpm) || this.bpmRef;
    const bpmTrim = 1 + ((bpm - this.bpmRef) / this.bpmRef) * this.bpmSpan;
    return Math.max(0.4, Math.min(1.5, prof.react * bpmTrim));
  },
};

/* =========================================================================
   TrackVisualProfile — the track-level "visual prior".
   Built ONCE per track from ReccoBeats-style audio features (tempo, energy,
   danceability, valence, acousticness, instrumentalness, speechiness, liveness,
   loudness, key, mode, time_signature). It describes the WHOLE track and is used
   by ShaderMapper only to bias/calibrate the live FFT — never to replace it.

   Stays fully NEUTRAL (has=false) when no features are available, so shaders keep
   working from live audio alone. All numeric fields are normalized for the mapper:
   0..1 except where noted.
   ========================================================================= */
const NEUTRAL_PROFILE = {
  has:      false,   // true once real ReccoBeats features are loaded
  tempo:    0,       // BPM (0 = unknown → mapper falls back to live/nominal)
  energy:   0,       // 0..1 overall intensity of the track
  dance:    0,       // 0..1 danceability → beat confidence / pulse sharpness
  valence:  0.5,     // 0..1 mood (0 dark .. 1 happy); 0.5 = neutral
  acoustic: 0,       // 0..1 acousticness → softer edges, organic grain
  instrum:  0,       // 0..1 instrumentalness → abstract motion vs vocal center
  speech:   0,       // 0..1 speechiness → tame pulsing, lean on midrange
  live:     0,       // 0..1 liveness → ambient bloom / space
  loud:     0.5,     // 0..1 normalized loudness (−60..0 dB → 0..1)
  key:      -1,      // 0..11 pitch class (-1 unknown) → subtle hue identity
  mode:     -1,      // 0 minor / 1 major (-1 unknown) → brightness/mood
  timeSig:  4,       // beats per bar → rhythmic subdivision
};
let trackFeatures = null;                  // raw JSON from /api/focus/track/{id}
let TrackVisualProfile = { ...NEUTRAL_PROFILE };

/* Build the profile from a raw ReccoBeats/Spotify audio-features object.
   Tolerant: any missing field falls back to its neutral value. */
function buildTrackVisualProfile(){
  const f = trackFeatures;
  if(!f){ TrackVisualProfile = { ...NEUTRAL_PROFILE }; return TrackVisualProfile; }
  const loudNorm = Math.max(0, Math.min(1, ((f.loudness ?? -60) + 60) / 60));
  TrackVisualProfile = {
    has:      true,
    tempo:    f.tempo ?? 0,
    energy:   f.energy ?? 0,
    dance:    f.danceability ?? 0,
    valence:  f.valence ?? 0.5,
    acoustic: f.acousticness ?? 0,
    instrum:  f.instrumentalness ?? 0,
    speech:   f.speechiness ?? 0,
    live:     f.liveness ?? 0,
    loud:     loudNorm,
    key:      Number.isFinite(f.key)  ? f.key  : -1,
    mode:     Number.isFinite(f.mode) ? f.mode : -1,
    timeSig:  f.time_signature || 4,
  };
  return TrackVisualProfile;
}
