/* Lyric scene derivation — hoisted out of the reader surface.

   The embedded surface used to infer sections, rescan for the active line each
   tick, analyse the lyric and assemble shader uniforms itself. All of that is
   derivable from state the shell already owns, so it happens once here and the
   surface receives resolved values. The surface derives nothing. */
const LyricScene = {
  /* Deterministic mood heuristics. These mirror services/lyric_visual_service.py;
     that copy stays authoritative for the server-side/LLM path. */
  moodKeywords: {
    calm:       ['quiet', 'still', 'gentle', 'soft', 'peace', 'drift', 'snow', 'silent', 'fades', 'white', 'hollow'],
    euphoric:   ['light', 'sun', 'suns', 'thousand', 'electric', 'burning', 'bright', 'neon', 'glow', 'fire', 'blaze'],
    sad:        ['lost', 'ghost', 'lonely', 'tears', 'broken', 'empty', 'cold', 'shadow', 'shadows', 'grey'],
    aggressive: ['burn', 'crash', 'scream', 'rage', 'smash', 'chains', 'current', 'veins', 'voltage'],
    dreamy:     ['dream', 'float', 'haze', 'cloud', 'mist', 'frequencies', 'tangled', 'web', 'time', 'machine'],
    chaotic:    ['noise', 'chaos', 'static', 'shatter', 'storm', 'dissolving', 'nothing', 'seems'],
  },
  sectionEnergy: { intro:.2, verse:.45, chorus:.85, bridge:.6, outro:.15 },
  moodParams: {
    calm:      { brightness:.3, chaos:.1,  pulse:.2  },
    euphoric:  { brightness:.9, chaos:.4,  pulse:.9  },
    sad:       { brightness:.2, chaos:.15, pulse:.3  },
    aggressive:{ brightness:.7, chaos:.8,  pulse:.95 },
    dreamy:    { brightness:.5, chaos:.25, pulse:.5  },
    chaotic:   { brightness:.6, chaos:.9,  pulse:.7  },
  },

  /* Neutral fallbacks. Derived once from the lab's NEUTRAL_AUDIO_FEATURES and
     its fixed neutral DerivedVisualFeatures, so the surface no longer has to
     pull the whole feature pipeline in to produce ten numbers:
       warp  = motionIntensity*.5 + tension*.3 + (1-organicness)*.2
       chaos = tension*.5 + (1-organicness)*.3 + motionIntensity*.2
       grain = .02 + organicness*.08 + ambience*.05                          */
  neutral: { brightness:.3, chaos:.31, warp:.31, grain:.08, pulse:.3, energy:.5 },

  clamp01(value, fallback = 0){
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  },

  /* Sections are guessed from position and repetition when the source has none. */
  _section(line, index, lines, repetitions){
    if(line.section) return line.section;
    const ratio = lines.length > 1 ? index / (lines.length - 1) : 0;
    const normalized = line.text.trim().toLowerCase();
    if(!normalized || ratio < .06) return 'intro';
    if(ratio > .9) return 'outro';
    if((repetitions.get(normalized) || 0) > 1) return 'chorus';
    if(ratio > .58 && ratio < .76) return 'bridge';
    return 'verse';
  },

  /* player.lyrics (ms) → reader lines (seconds, sectioned). */
  lines(source){
    const raw = Array.isArray(source) ? source : [];
    const prepared = raw.map((line, index)=>{
      const start = Number(line.ms) || 0;
      let end = Number(line.endMs);
      if(!(end > start)){
        const next = raw[index + 1];
        end = next && Number(next.ms) > start ? Number(next.ms) : start + 4000;
      }
      return {
        time:start / 1000,
        endTime:end / 1000,
        text:String(line.text || '').trim(),
        localized:String(line.localized || '').trim(),
      };
    });
    const repetitions = new Map();
    for(const line of prepared){
      const key = line.text.toLowerCase();
      if(key) repetitions.set(key, (repetitions.get(key) || 0) + 1);
    }
    return prepared.map((line, index, all)=>({
      ...line,
      section:this._section(line, index, all, repetitions),
    }));
  },

  /* Last line whose start time has passed, or -1. Kept as a forward-moving
     cursor because playback time is almost always monotonic. */
  _cursor: 0,
  activeIndex(lines, time){
    if(!lines.length) return -1;
    if(this._cursor >= lines.length || lines[this._cursor]?.time > time) this._cursor = 0;
    let active = lines[this._cursor]?.time <= time ? this._cursor : -1;
    for(let i = Math.max(this._cursor, 0); i < lines.length; i++){
      if(lines[i].time <= time){ active = i; this._cursor = i; }
      else break;
    }
    return active;
  },

  analyze(text, section = 'verse'){
    if(!text) return { mood:'calm', energy:this.sectionEnergy[section] ?? .2, brightness:.2, chaos:.05, pulse:.15 };
    const words = String(text).toLowerCase().split(/\s+/);
    let best = 'calm', bestScore = 0;
    for(const [mood, keywords] of Object.entries(this.moodKeywords)){
      let score = 0;
      for(const word of words) if(keywords.some(kw=>word.includes(kw))) score++;
      if(score > bestScore){ best = mood; bestScore = score; }
    }
    const sectionEnergy = this.sectionEnergy[section] ?? .4;
    const energy = Math.min(1, sectionEnergy * .6 + Math.min(1, words.length / 12) * .4);
    const params = this.moodParams[best];
    return { mood:best, energy:Number(energy.toFixed(2)), ...params };
  },

  /* Resolve a wallpaper into the reader's plugin parameters. Parameters only —
     never source — so a visual can be described entirely by data and can never
     fail to compile or stall the renderer. Ported from the lab's
     shaderRecordToPreset so the surface receives these already resolved. */
  preset(wallpaper){
    const mode = String(wallpaper?.preset || '').toLowerCase();
    const bpm = Number(wallpaper?.bpm) || 120;
    const palette = wallpaper?.palette || [];
    return {
      id:wallpaper?.id || 'aurora',
      name:wallpaper?.name || 'Wallpaper',
      renderMode:mode.includes('drive') || bpm >= 132 ? 'warp'
        : mode.includes('rest') || bpm <= 88 ? 'aurora' : 'pulse',
      barScale:.9 + Math.min(.35, Math.max(0, (bpm - 80) / 220)),
      gradientSpread:mode.includes('rest') ? .12 : mode.includes('drive') ? .52 : .28,
      particleCount:Math.round(20 + Math.min(50, bpm / 2)),
      particleBoost:Math.round(16 + Math.min(48, bpm / 3)),
      ringBoost:mode.includes('spark') ? 2.1 : mode.includes('drive') ? 1.6 : 1.2,
      warpStrength:mode.includes('drive') ? 1.5 : mode.includes('spark') ? 1.2 : 1,
      grainEnabled:mode !== 'rest',
      particleHueShift:0,
      colorA:WallpaperPalette.rgb01(palette[0], [.08, .14, .15]),
      colorB:WallpaperPalette.rgb01(palette[1], [.09, .09, .08]),
      sourceShaderId:wallpaper?.id || null,
    };
  },

  /* The ten uniforms the reader actually renders, as [name, components] in
     frame-array order. The surface is handed this at handshake and unpacks
     generically, so the layout can change here without the two sides drifting. */
  uniformKeys: [
    ['uTime', 1], ['uAudioEnergy', 1], ['uBrightness', 1], ['uChaos', 1], ['uGrain', 1],
    ['uLyricEnergy', 1], ['uPulse', 1], ['uWarp', 1], ['uColorA', 3], ['uColorB', 3],
  ],

  /* Write the current uniforms into a reusable Float32Array (14 floats:
     8 scalars then two rgb triples), so the frame pump allocates nothing. */
  writeUniforms(out, { analysis, frame, wallpaper, time }){
    const n = this.neutral;
    const lyricEnergy = this.clamp01(analysis?.energy, n.energy);
    const palette = wallpaper?.palette || [];
    const colorA = WallpaperPalette.rgb01(palette[0], [.08, .14, .15]);
    const colorB = WallpaperPalette.rgb01(palette[1], [.09, .09, .08]);
    const pulse = Math.max(this.clamp01(frame?.pulse), n.pulse * .35);

    out[0]  = time;
    out[1]  = Math.max(lyricEnergy, this.clamp01(frame?.rms), this.clamp01(frame?.level));
    out[2]  = Math.max(n.brightness, this.clamp01(frame?.treble) * .8);
    out[3]  = Math.max(n.chaos, this.clamp01(frame?.spectralFlux) * .75);
    out[4]  = n.grain;
    out[5]  = lyricEnergy;
    out[6]  = pulse;
    out[7]  = n.warp;
    out[8]  = colorA[0]; out[9]  = colorA[1]; out[10] = colorA[2];
    out[11] = colorB[0]; out[12] = colorB[1]; out[13] = colorB[2];
    return out;
  },
};
