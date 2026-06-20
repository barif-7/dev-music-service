/* Phase · Field — WebGL tile engine.
   Drives the bundled shaders with the advanced reactive contract: the design's
   iPulse/iEnergy/iIntensity/iWarp (now fed by AGC + spectral-flux onsets) PLUS
   iMid/iVocal, scaled per-wallpaper by reactivityPlugin (focus mode + BPM).
   The shaders don't author iMid/iVocal, so a uniform brightness term is injected
   at compile time — exactly how the player wired the cloud shaders. */

/* Inject the audio + ReccoBeats response into every shader's final colour:
   - iMid/iVocal: live melodic/vocal brightness
   - iDance: danceable tracks read a touch brighter
   - iValence: mood tints warm (happy) ↔ cool (sad) */
function injectMidVocal(frag){
  if(/\biMid\b/.test(frag)) return frag;   // already wired (defensive)
  return frag.replace(/(gl_FragColor\s*=\s*vec4\(\s*col)\b/,
    'col *= 1.0 + iMid*MID_GAIN + iVocal*VOCAL_GAIN + iDance*0.05;\n'+
    '  col.rb *= vec2(1.0 + (iValence-0.5)*0.10, 1.0 - (iValence-0.5)*0.10);\n'+
    '  col *= mix(vec3(1.0), iAccent, 0.16);\n'+   // pull toward album-art colour
    '  $1');
}

function compileProg(gl, fragSrc){
  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s), src);
    return s;
  }
  const v = compile(gl.VERTEX_SHADER, VERT);
  const f = compile(gl.FRAGMENT_SHADER, COMMON + '\n' + injectMidVocal(fragSrc));
  const p = gl.createProgram();
  gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  return p;
}

const U_NAMES = ['iResolution','iTime','iMouse','iClick','iPulse','iEnergy','iIntensity','iWarp','iGrain','iMid','iVocal',
                'iBass','iTreble','iHue','iPlaying',
                'iDance','iValence','iAcoustic','iInstrum','iLive','iSpeech','iTrackEnergy','iLoud',
                'iTempo','iBpm','iBeat','iProgress','iAccent'];

class Tile {
  constructor(canvas, fragId, presetBPM, maxDpr){
    this.canvas = canvas;
    this.maxDpr = maxDpr || 1.75;
    this.reactScale = 1;
    this.gl = canvas.getContext('webgl', {antialias:false, premultipliedAlpha:false});
    if(!this.gl){ canvas.style.background = '#181a20'; return; }
    const gl = this.gl;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    this.mouse = {x:0.5, y:0.5};
    this.target = {x:0.5, y:0.5};
    // Idle wave: cursor auto-orbits in a gentle sinusoid (matching how main
    // renders its shader previews). `idlePhase` offsets the wave per tile.
    // `idleWaveAuto` (player hero) limits the full orbit to when audio is NOT
    // live; during playback the real pointer drives with only a subtle drift.
    this.idleWave = false;
    this.idleWaveAuto = false;
    this.idlePhase = 0;
    this.click = 0;
    this.start = performance.now();
    this.load(fragId, presetBPM);

    canvas.addEventListener('pointermove', (e)=>{
      const r = canvas.getBoundingClientRect();
      this.target.x = (e.clientX - r.left)/r.width;
      this.target.y = 1 - (e.clientY - r.top)/r.height;
    });
    canvas.addEventListener('pointerleave', ()=>{ this.target.x = 0.5; this.target.y = 0.5; });
    canvas.addEventListener('pointerdown', ()=>{ this.click = 1; });
  }
  load(fragId, presetBPM){
    if(!this.gl) return;
    const gl = this.gl;
    if(this.prog) gl.deleteProgram(this.prog);
    this.fragId = fragId;
    this.bpm = presetBPM;
    this.reactScale = reactivityPlugin.scaleFor(fragId);   // focus/BPM-tuned mid/vocal scale
    this.prog = compileProg(gl, FRAGS[fragId]);
    gl.useProgram(this.prog);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    U_NAMES.forEach(n => this.u[n] = gl.getUniformLocation(this.prog, n));
  }
  resize(){
    if(!this.gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if(this.canvas.width !== w || this.canvas.height !== h){
      this.canvas.width = w; this.canvas.height = h;
      this.gl.viewport(0,0,w,h);
    }
  }
  draw(){
    if(!this.gl) return;
    this.resize();
    const gl = this.gl;
    const tSec = (performance.now() - this.start)/1000;

    /* Combine the live AudioAnalyzer frame with the track-level prior into the
       shader uniform set. Live FFT dominates; the profile only biases it. */
    const m = ShaderMapper.map(AUDIO, TrackVisualProfile, {
      tSec, nominalBpm: this.bpm, reactScale: this.reactScale, fragId: this.fragId,
    });

    /* ---- cursor: real pointer, or the synthetic "idle wave" orbit ----
       Idle-wave rule:
       • grid previews (idleWaveAuto=false) always orbit.
       • the player hero (idleWaveAuto=true) only orbits when audio is NOT live;
         during active playback it tracks the real pointer with a *subtle*
         secondary drift so the motion still breathes. */
    const i = this.idlePhase;
    if(this.idleWave && (!this.idleWaveAuto || !m.live)){
      this.target.x = this.mouse.x = 0.5 + 0.15*Math.sin(tSec*0.4 + i);
      this.target.y = this.mouse.y = 0.5 + 0.15*Math.cos(tSec*0.3 + i*1.3);
    } else {
      this.mouse.x += (this.target.x - this.mouse.x)*0.08;
      this.mouse.y += (this.target.y - this.mouse.y)*0.08;
      if(this.idleWave && this.idleWaveAuto){   // subtle secondary drift over live pointer
        this.mouse.x += 0.03*Math.sin(tSec*0.4 + i);
        this.mouse.y += 0.03*Math.cos(tSec*0.3 + i*1.3);
      }
    }
    this.click *= 0.92;

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.iResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.iTime, tSec);
    gl.uniform2f(this.u.iMouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(this.u.iClick, this.click);
    gl.uniform1f(this.u.iPulse, m.pulse);
    gl.uniform1f(this.u.iEnergy, m.energy);
    gl.uniform1f(this.u.iIntensity, m.intensity);
    gl.uniform1f(this.u.iWarp, m.warp);
    gl.uniform1f(this.u.iGrain, m.grain);
    gl.uniform1f(this.u.iMid, m.mid);
    gl.uniform1f(this.u.iVocal, m.vocal);
    // extra uniforms the 5 built-in shaders use (null/no-op for the cloud shaders)
    gl.uniform1f(this.u.iBass, m.bass);
    gl.uniform1f(this.u.iTreble, m.treble);
    gl.uniform1f(this.u.iHue, m.hue);      // mood (valence) + key → hue shift
    gl.uniform1f(this.u.iPlaying, 1);      // always live in the immersive gallery
    // ReccoBeats per-track features, plugged straight in (neutral without a track)
    gl.uniform1f(this.u.iDance,       m.dance);
    gl.uniform1f(this.u.iValence,     m.valence);
    gl.uniform1f(this.u.iAcoustic,    m.acoustic);
    gl.uniform1f(this.u.iInstrum,     m.instrum);
    gl.uniform1f(this.u.iLive,        m.liveness);
    gl.uniform1f(this.u.iSpeech,      m.speech);
    gl.uniform1f(this.u.iTrackEnergy, m.trackEnergy);
    gl.uniform1f(this.u.iLoud,        m.loud);
    gl.uniform1f(this.u.iTempo,    m.tempo);
    gl.uniform1f(this.u.iBpm,      m.bpmHz);
    gl.uniform1f(this.u.iBeat,     m.beatPhase);
    gl.uniform1f(this.u.iProgress, (typeof player==='object' ? player.progress : 0) || 0);
    const ac = (typeof player==='object' && player.accent) ? player.accent : [1,1,1];
    if(this.u.iAccent != null) gl.uniform3f(this.u.iAccent, ac[0], ac[1], ac[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
