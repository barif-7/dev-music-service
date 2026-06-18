/* Phase · Field — WebGL tile engine.
   Drives the bundled shaders with the advanced reactive contract: the design's
   iPulse/iEnergy/iIntensity/iWarp (now fed by AGC + spectral-flux onsets) PLUS
   iMid/iVocal, scaled per-wallpaper by reactivityPlugin (focus mode + BPM).
   The shaders don't author iMid/iVocal, so a uniform brightness term is injected
   at compile time — exactly how the player wired the cloud shaders. */

function injectMidVocal(frag){
  if(/\biMid\b/.test(frag)) return frag;   // already wired (defensive)
  return frag.replace(/(gl_FragColor\s*=\s*vec4\(\s*col)\b/,
    'col *= 1.0 + iMid*MID_GAIN + iVocal*VOCAL_GAIN;\n  $1');
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

const U_NAMES = ['iResolution','iTime','iMouse','iClick','iPulse','iEnergy','iIntensity','iWarp','iGrain','iMid','iVocal'];

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
    this.mouse.x += (this.target.x - this.mouse.x)*0.08;
    this.mouse.y += (this.target.y - this.mouse.y)*0.08;

    let pulse, energy, intensity, warp, mid, vocal;
    const grain = Math.min(1, 0.18 + trackMod.grainBias);
    if (AUDIO.active){
      pulse     = AUDIO.pulse;
      energy    = Math.min(1, 0.28 + 0.72 * AUDIO.level  + trackMod.energyBias);
      intensity = Math.min(1, 0.40 + 0.60 * AUDIO.mid    + trackMod.intensityBias);
      warp      = Math.min(1, 0.25 + 0.55 * AUDIO.treble + trackMod.warpBias);
      // iMid/iVocal flow only with live audio; scaled per-wallpaper by focus/BPM.
      mid   = Math.min(1, AUDIO.mid   * this.reactScale);
      vocal = Math.min(1, AUDIO.vocal * this.reactScale * trackMod.vocalGain);
    } else {
      // synthetic: pulse to the wallpaper's intended tempo, shaders at default look
      const beat = (tSec * this.bpm / 60);
      const phase = beat - Math.floor(beat);
      pulse = Math.max(0, 1 - phase) * Math.max(0, 1 - phase);
      energy = 0.55 + 0.35 * Math.sin(tSec*0.2);
      intensity = 0.65; warp = 0.4;
      mid = 0; vocal = 0;
    }
    this.click *= 0.92;

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.iResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.iTime, tSec);
    gl.uniform2f(this.u.iMouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(this.u.iClick, this.click);
    gl.uniform1f(this.u.iPulse, pulse);
    gl.uniform1f(this.u.iEnergy, energy);
    gl.uniform1f(this.u.iIntensity, intensity);
    gl.uniform1f(this.u.iWarp, warp);
    gl.uniform1f(this.u.iGrain, grain);
    gl.uniform1f(this.u.iMid, mid);
    gl.uniform1f(this.u.iVocal, vocal);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
