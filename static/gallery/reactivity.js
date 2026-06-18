/* Phase · Field — sound-reactivity config (source of truth)
   Per-wallpaper tuning of the iMid/iVocal sound-reactive feature, by focus preset
   + intended BPM. The JS counterpart to the MID_GAIN/VOCAL_GAIN shader defines. */
const reactivityPlugin = {
  default:  'preset',          // 'preset' follows each wallpaper's focus preset
  fallback: 'flow',            // used when a wallpaper has no / unknown preset
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
    const w = (typeof ALTS !== 'undefined') ? ALTS.find(x => x.id === id) : null;
    let name = this.overrides[id] || this.default;
    if((this.profiles[name] || {}).follow) name = (w && w.preset && w.preset.toLowerCase()) || this.fallback;
    const prof = this.profiles[name] || this.profiles[this.fallback];
    const bpm  = (w && w.bpm) || this.bpmRef;
    const bpmTrim = 1 + ((bpm - this.bpmRef) / this.bpmRef) * this.bpmSpan;
    return Math.max(0.4, Math.min(1.5, prof.react * bpmTrim));
  },
};

/* ReccoBeats per-track character — carried over from the player engine. Field's
   wallpaper "tracks" carry no Spotify audio features, so this stays NEUTRAL unless
   trackFeatures is populated; the mappings are kept so the infra is reusable. */
const RECCO = {
  vocalFromSpeech:       0.80,
  vocalFromInstrumental: 0.40,
  hueFromValence:        0.50,
  warpFromDance:         0.20,
  grainFromAcoustic:     0.30,
  intensityFromLiveness: 0.25,
  energyFromLoudness:    0.20,
};
const NEUTRAL_MOD = {vocalGain:1, hueBias:0, warpBias:0, grainBias:0, intensityBias:0, energyBias:0};
let trackFeatures = null;
let trackMod = NEUTRAL_MOD;
function recomputeTrackMod(){
  const f = trackFeatures;
  if(!f){ trackMod = NEUTRAL_MOD; return; }
  const loudNorm = Math.max(0, Math.min(1, ((f.loudness ?? -60) + 60) / 60));
  trackMod = {
    vocalGain:     1 + RECCO.vocalFromSpeech*(f.speechiness||0) + RECCO.vocalFromInstrumental*(1-(f.instrumentalness??1)),
    hueBias:       ((f.valence??0.5)-0.5) * RECCO.hueFromValence,
    warpBias:      RECCO.warpFromDance     * (f.danceability||0),
    grainBias:     RECCO.grainFromAcoustic * (f.acousticness||0),
    intensityBias: RECCO.intensityFromLiveness * (f.liveness||0),
    energyBias:    RECCO.energyFromLoudness    * loudNorm,
  };
}
