/* Phase · Field — ShaderMapper.
   The single place that turns (live AudioAnalyzer frame) + (TrackVisualProfile
   prior) into the scalar shader uniforms the engine uploads each frame.

   Contract / design rule:
     • Live Web Audio FFT (AUDIO, audio.js) is the source of frame-by-frame truth
       and DRIVES real-time motion (pulse, energy, intensity, warp, bands).
     • TrackVisualProfile (reactivity.js), built from ReccoBeats-style features,
       only BIASES / CALIBRATES that live signal — it never replaces it.
     • When live audio is unavailable (inactive / paused / silent), the mapper
       falls back to a synthetic idle wave, optionally shaped by the profile's
       tempo/energy/danceability so paused tracks still feel "themselves".

   Everything tunable lives in the T block below — adjust there to retune the
   ReccoBeats→shader relationships without touching the wiring. */
const ShaderMapper = (function(){
  /* ====================================================================== *
   *  TUNING — ReccoBeats-to-shader mapping strengths.                       *
   *  Read each as "how hard does this track-level prior nudge the live      *
   *  signal". Live FFT is always the base; 0 disables a given influence.    *
   * ====================================================================== */
  const T = {
    // global energy / brightness  (energy: global intensity/brightness bias)
    energyBase: 0.28, energyFromLevel: 0.72,
    energyFromTrackEnergy: 0.12,   // ReccoBeats energy → hotter overall
    // intensity (melodic body)
    intensityBase: 0.40, intensityFromMid: 0.60,
    brightFromMode: 0.05,          // mode → major brighter / minor darker
    // warp (spatial distortion + rhythmic sharpness)
    warpBase: 0.25, warpFromTreble: 0.55,
    warpFromDance: 0.20,           // danceability → sharper, more warp
    warpFromAcoustic: 0.18,        // acousticness → softer edges (subtracted)
    // grain (texture / organic noise / ambient space)
    grainBase: 0.18,
    grainFromAcoustic: 0.30,       // acousticness → organic grain
    grainFromLive: 0.18,           // liveness → ambient bloom / space
    // pulse (kick/beat envelope strength + beat confidence)
    pulseFromBassFloor: 0.55,      // live: bass underpins the pulse (see audio.js)
    pulseDanceLo: 0.70, pulseDanceHi: 0.60,  // danceability scales pulse ×0.70..1.30
    pulseSpeechCut: 0.40,          // speechiness → tame over-pulsing
    // vocal-band response
    vocalFromSpeech: 0.80,         // speechiness → emphasize midrange/vocal
    vocalFromInstrum: 0.40,        // low instrumentalness (vocal track) → boost vocal
    // treble detail blend (hi-hats / air → fine detail)
    trebleHighMidMix: 0.30,
    // hue / colour identity (valence: warmth; key/mode: subtle identity)
    hueFromValence: 0.90,          // mood → warm/cool hue rotation (radians)
    hueFromKey: 0.06,              // key → tiny per-pitch-class hue offset
    // loudness gain compensation: quiet tracks still move, loud don't max out
    loudCompAmount: 0.50,          // 0 = off; centred at loud=0.5
    // idle fallback shaping (used when no live audio but a profile exists)
    idleEnergyFromTrack: 0.45, idleWarpFromDance: 0.30, idlePulseFromDance: 0.50,
    // The 5 original shaders read iBass/iTreble/iPulse DIRECTLY and far harder
    // than the designed "cloud" shaders (which lean on the gentler iMid/iVocal),
    // so they react more violently to the same audio. Calm their punchy *live*
    // inputs so the whole set reacts at a comparable level. 1 = no damping.
    builtinBandCalm: 0.55,    // iBass / iTreble for the originals
    builtinPulseCalm: 0.75,   // iPulse (beat flares) for the originals
  };
  /* ids of the 5 original built-in shaders (vs the designed cloud shaders) */
  const BUILTIN_REACTIVE = new Set(['pulse', 'tide', 'cells', 'mercury', 'lattice']);

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  /* loudness compensation: <0.5 loudness boosts, >0.5 attenuates live drive */
  const loudComp = P => P.has ? 1 + (0.5 - P.loud) * T.loudCompAmount : 1;
  const modeBias = P => P.mode === 1 ? 1 : P.mode === 0 ? -1 : 0;

  /* A = AudioAnalyzer (AUDIO), P = TrackVisualProfile, ctx = per-tile context:
       { tSec, nominalBpm, reactScale }
     Returns a flat object of scalar uniform values for engine.js to upload. */
  function map(A, P, ctx){
    const { tSec, nominalBpm, reactScale } = ctx;
    const live = reactivityPlugin.enabled && A.active && !A.silence;
    const u = { live };

    /* ---- track passthrough: raw priors straight to the shaders (neutral when
       !P.has). Shaders may use these as constant per-track character. ---- */
    u.dance = P.dance; u.valence = P.valence; u.acoustic = P.acoustic;
    u.instrum = P.instrum; u.liveness = P.live; u.speech = P.speech;
    u.trackEnergy = P.energy; u.loud = P.loud; u.tempo = P.tempo;

    /* ---- grain: track-level texture, applied in both live + idle ----
       acoustic → organic grain, liveness → ambient space. */
    u.grain = clamp01(T.grainBase + T.grainFromAcoustic*P.acoustic + T.grainFromLive*P.live);

    /* ---- beat grid: live-detected tempo is truth; ReccoBeats tempo is the
       fallback/stabilizer when live BPM is weak; nominal wallpaper bpm last. ---- */
    let bpmHz, beatPhase;
    if(live && A.bpm > 0){ bpmHz = A.bpm/60; beatPhase = A.beatPhase; }
    else if(P.tempo > 0){ bpmHz = P.tempo/60; beatPhase = (tSec * P.tempo/60) % 1; }
    else { bpmHz = nominalBpm/60; beatPhase = (tSec * nominalBpm/60) % 1; }
    u.bpmHz = bpmHz; u.beatPhase = beatPhase;

    if(live){
      const lc = loudComp(P);
      /* pulse: live kick/onset envelope, sharpened by danceability (beat
         confidence) and calmed for speech-heavy tracks; loudness-compensated. */
      let pulse = A.beatPulse * lc;
      pulse *= (T.pulseDanceLo + T.pulseDanceHi * P.dance);
      pulse *= (1 - T.pulseSpeechCut * P.speech);
      u.pulse = clamp01(pulse);

      /* energy: live broadband level is the base; track energy biases hotter. */
      u.energy = clamp01(T.energyBase + T.energyFromLevel*A.level*lc
                         + T.energyFromTrackEnergy*P.energy);
      /* intensity: live melodic body; mode tilts brightness (major↑ / minor↓). */
      u.intensity = clamp01(T.intensityBase + T.intensityFromMid*A.mid
                            + T.brightFromMode*modeBias(P));
      /* warp: live treble + dance sharpness − acoustic softening. */
      u.warp = clamp01(T.warpBase + T.warpFromTreble*A.treble
                       + T.warpFromDance*P.dance - T.warpFromAcoustic*P.acoustic);

      /* iMid/iVocal: live bands × per-wallpaper react scale; vocal lifted by
         speechiness and by low instrumentalness (a vocal-forward track). */
      const vocalGain = 1 + T.vocalFromSpeech*P.speech + T.vocalFromInstrum*(1 - P.instrum);
      u.mid   = clamp01(A.mid   * reactScale);
      u.vocal = clamp01(A.vocal * reactScale * vocalGain);

      /* bands read by the 5 built-in shaders: bass/kick → low response,
         treble (+ a little high-mid) → fine detail / hi-hats. */
      u.bass   = A.bass;
      u.treble = clamp01((1 - T.trebleHighMidMix)*A.treble + T.trebleHighMidMix*A.highMid);

      /* calm the originals' direct band/beat reads so they don't out-punch the
         designed shaders (live only — their idle motion is left at full). */
      if(BUILTIN_REACTIVE.has(ctx.fragId)){
        u.bass   *= T.builtinBandCalm;
        u.treble *= T.builtinBandCalm;
        u.pulse  *= T.builtinPulseCalm;
      }
    } else {
      /* ---- synthetic idle wave (no live audio) ----
         Matches the original preview look when no profile is present; when a
         profile IS present (e.g. paused track) tempo/energy/dance shape it so
         the idle motion still reads as the track — the graceful fallback. */
      const beat = tSec * bpmHz, phase = beat - Math.floor(beat);
      let pulse = Math.max(0, 1 - phase); pulse *= pulse;
      if(P.has) pulse *= (1 + T.idlePulseFromDance*P.dance);
      u.pulse = clamp01(pulse);
      u.energy = P.has
        ? clamp01(0.35 + T.idleEnergyFromTrack*P.energy + 0.10*Math.sin(tSec*0.2))
        : 0.55 + 0.35*Math.sin(tSec*0.2);
      u.intensity = P.has ? clamp01(0.50 + 0.30*P.energy + T.brightFromMode*modeBias(P)) : 0.65;
      u.warp = P.has ? clamp01(0.30 + T.idleWarpFromDance*P.dance) : 0.40;
      u.mid = 0; u.vocal = 0; u.bass = 0; u.treble = 0;
    }

    /* hue: valence sets warmth, key adds a subtle per-track colour identity. */
    u.hue = (P.valence - 0.5) * T.hueFromValence
          + (P.key >= 0 ? (P.key/12 - 0.5) * 2 * T.hueFromKey : 0);

    return u;
  }

  return { map, T };
})();
