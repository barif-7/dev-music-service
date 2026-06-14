/* ====== Theme picker ====== */
const THEME_STORE_KEY = 'phase.theme';
const THEME_PRESETS = new Set(['default', 'sunset', 'ocean', 'forest', 'midnight']);

function hexToRgb(hex){
  const clean = String(hex || '').replace('#', '').trim();
  if(!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const value = parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function haloFromHex(hex, alpha){
  const rgb = hexToRgb(hex);
  if(!rgb) return null;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function readTheme(){
  try {
    return JSON.parse(localStorage.getItem(THEME_STORE_KEY) || '{}');
  } catch(e) {
    return {};
  }
}

function persistTheme(theme){
  localStorage.setItem(THEME_STORE_KEY, JSON.stringify(theme));
}

function applyTheme(theme){
  const selected = theme.name || 'default';
  const body = document.body;
  body.dataset.theme = selected === 'default' ? '' : selected;
  if(selected === 'custom'){
    const accent = theme.accent || '#d7ff3a';
    const glow = theme.glow || '#6ee7a8';
    body.style.setProperty('--custom-accent', accent);
    body.style.setProperty('--custom-glow', glow);
    body.style.setProperty('--custom-halo-a', haloFromHex(accent, .065) || 'rgba(215,255,58,.065)');
    body.style.setProperty('--custom-halo-b', haloFromHex(glow, .045) || 'rgba(110,231,168,.045)');
    document.getElementById('themeAccent').value = accent;
    document.getElementById('themeGlow').value = glow;
  }
  document.querySelectorAll('.themePreset').forEach(btn=>{
    btn.classList.toggle('on', btn.dataset.theme === selected);
  });
  const swatch = document.getElementById('themeBtnSwatch');
  if(swatch && selected === 'custom'){
    swatch.style.background = `linear-gradient(135deg,${theme.accent},${theme.glow})`;
  } else if(swatch) {
    swatch.style.background = '';
  }
}

function openThemeModal(){
  document.getElementById('themeModal').classList.add('open');
  document.getElementById('themeScrim').classList.add('open');
}

function closeThemeModal(){
  document.getElementById('themeModal').classList.remove('open');
  document.getElementById('themeScrim').classList.remove('open');
}

function initThemePicker(){
  const saved = readTheme();
  applyTheme(saved.name ? saved : {name:'default'});
  document.getElementById('themeOpen').addEventListener('click', openThemeModal);
  document.getElementById('themeClose').addEventListener('click', closeThemeModal);
  document.getElementById('themeScrim').addEventListener('click', closeThemeModal);
  document.getElementById('themePresetGrid').addEventListener('click', e=>{
    const btn = e.target.closest('.themePreset');
    if(!btn) return;
    const name = THEME_PRESETS.has(btn.dataset.theme) ? btn.dataset.theme : 'default';
    const next = {name};
    persistTheme(next);
    applyTheme(next);
  });
  document.getElementById('themeCustomApply').addEventListener('click', ()=>{
    const next = {
      name:'custom',
      accent:document.getElementById('themeAccent').value,
      glow:document.getElementById('themeGlow').value,
    };
    persistTheme(next);
    applyTheme(next);
  });
}

initThemePicker();

/* ====== WebGL plumbing ====== */
const VERT = document.getElementById('shader-vert').textContent;
const COMMON = document.getElementById('shader-common').textContent;
const FRAGS = {
  pulse:   document.getElementById('frag-pulse').textContent,
  tide:    document.getElementById('frag-tide').textContent,
  cells:   document.getElementById('frag-cells').textContent,
  mercury: document.getElementById('frag-mercury').textContent,
  lattice: document.getElementById('frag-lattice').textContent,
};
/* GLSL fetched from the Phase · Field API (via the /api/shaders proxy). These
   are complete, self-contained shaders — precision, uniforms and helpers
   included — so they are compiled WITHOUT the inline COMMON prelude. */
const API_FRAGS = {};

/* Resolve a wallpaper id to its fragment source + whether it already carries
   its own prelude. Returns null until an API shader's GLSL has loaded. */
function fragSource(fragId){
  if(fragId in FRAGS)     return { src: FRAGS[fragId],     standalone: false };
  if(fragId in API_FRAGS) return { src: API_FRAGS[fragId], standalone: true  };
  return null;
}

function makeProg(gl, fragId){
  const resolved = fragSource(fragId);
  if(!resolved) return null;
  function compile(type, src){
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('shader', fragId, gl.getShaderInfoLog(s));
    return s;
  }
  const v = compile(gl.VERTEX_SHADER, VERT);
  const f = compile(gl.FRAGMENT_SHADER, resolved.standalone ? resolved.src : (COMMON + '\n' + resolved.src));
  const p = gl.createProgram(); gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
  return p;
}

/* ====== Wallpaper definitions (visual only — track data set by real API) ====== */
const WALLS = [
  {id:'pulse',   name:'Pulse',   preset:'flow',  bpm:72},
  {id:'tide',    name:'Tide',    preset:'rest',  bpm:64},
  {id:'cells',   name:'Cells',   preset:'flow',  bpm:96},
  {id:'mercury', name:'Mercury', preset:'spark', bpm:108},
  {id:'lattice', name:'Lattice', preset:'drive', bpm:128},
];

const BPM_PRESETS = [
  {id:'rest',  label:'Rest',  range:[55,65],  blurb:'wind-down · low stim'},
  {id:'flow',  label:'Flow',  range:[68,84],  blurb:'deep focus band'},
  {id:'spark', label:'Spark', range:[96,112], blurb:'task-switching'},
  {id:'drive', label:'Drive', range:[120,140],blurb:'sprint / energy'},
];

/* ====== State ====== */
const state = {
  activeIdx:0,
  intensity:0.65, warp:0.40, hue:0, grain:0.18,
  bpm:72, playing:false,
  elapsed:0, duration:0,
  mode:'browser',
  currentWebpageUrl:null,
  lyrics:[],  // [{ms, text}]
  targetHue:0,
};

/* ====== Audio element ====== */
const audioEl = document.getElementById('audioEl');
audioEl.addEventListener('play',  () => { state.playing = true;  updatePlayBtn(); });
audioEl.addEventListener('pause', () => { state.playing = false; updatePlayBtn(); });
audioEl.addEventListener('ended', () => { state.playing = false; updatePlayBtn(); });

/* ====== Web Audio analyser ====== */
let audioCtx=null, analyser=null, freqData=null;
let beatHistory=new Float32Array(60), beatIdx=0, lastBeatT=0;
let sBass=0, sTreble=0, sEnergy=0; // smoothed envelopes (asymmetric attack/release)

function setupAnalyser(){
  if(audioCtx) return;
  try{
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    analyser=audioCtx.createAnalyser();
    analyser.fftSize=2048;                // 1024 bins
    analyser.smoothingTimeConstant=0.72;
    const src=audioCtx.createMediaElementSource(audioEl);
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    freqData=new Uint8Array(analyser.frequencyBinCount);
  }catch(e){ console.warn('AudioContext unavailable',e); }
}
audioEl.addEventListener('play',()=>{
  setupAnalyser();
  if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
});

/* ====== Renderer ====== */
class Renderer {
  constructor(canvas, fragId){
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {antialias:false, premultipliedAlpha:false});
    if(!this.gl) return;
    const gl = this.gl;
    this.prog = makeProg(gl, fragId);
    this.fragId = fragId;
    gl.useProgram(this.prog);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    ['iResolution','iTime','iMouse','iDrag','iClick','iPulse','iBass','iTreble',
     'iEnergy','iIntensity','iWarp','iHue','iGrain','iPlaying'].forEach(n=>{
      this.u[n] = gl.getUniformLocation(this.prog, n);
    });
    this.localMouse = {x:0.5,y:0.5};
    this.localClick = 0;
  }
  setFrag(fragId){
    if(this.fragId === fragId) return;
    const prog = makeProg(this.gl, fragId);
    if(!prog) return;   // source not loaded yet — caller should await it first
    this.fragId = fragId;
    const gl = this.gl;
    this.prog = prog;
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    Object.keys(this.u).forEach(n=>{ this.u[n] = gl.getUniformLocation(this.prog, n); });
  }
  resize(){
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    const w = this.canvas.clientWidth * dpr, h = this.canvas.clientHeight * dpr;
    if(this.canvas.width!==w || this.canvas.height!==h){ this.canvas.width=w; this.canvas.height=h; }
  }
  draw(env){
    if(!this.gl) return;
    this.resize();
    const gl = this.gl;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.iResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.iTime, env.t);
    gl.uniform2f(this.u.iMouse, this.localMouse.x, 1.0 - this.localMouse.y);
    gl.uniform2f(this.u.iDrag, 0,0);
    gl.uniform1f(this.u.iClick, this.localClick);
    gl.uniform1f(this.u.iPulse, env.pulse);
    gl.uniform1f(this.u.iBass, env.bass);
    gl.uniform1f(this.u.iTreble, env.treble);
    gl.uniform1f(this.u.iEnergy, env.energy);
    gl.uniform1f(this.u.iIntensity, state.intensity);
    gl.uniform1f(this.u.iWarp, state.warp);
    gl.uniform1f(this.u.iHue, state.hue * Math.PI/180);
    gl.uniform1f(this.u.iGrain, state.grain);
    gl.uniform1f(this.u.iPlaying, state.playing?1:0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.localClick = Math.max(0, this.localClick - env.dt*1.4);
  }
}

/* ====== UI build ====== */
const picker = document.getElementById('picker');
const previewRenderers = [];
WALLS.forEach((w,i)=>{
  const row = document.createElement('div');
  row.className = 'wp' + (i===0?' active':'');
  const preset = BPM_PRESETS.find(p=>p.id===w.preset);
  row.innerHTML = `
    <div class="thumb"><canvas></canvas></div>
    <div class="info"><div class="name">${w.name}</div><div class="sub">${preset.label} · ${w.bpm} bpm</div></div>
    <div class="ix">0${i+1}</div>
  `;
  picker.appendChild(row);
  previewRenderers.push(new Renderer(row.querySelector('canvas'), w.id));
  row.addEventListener('click', ()=>setActiveShader(i));
});

const bpmPresets = document.getElementById('bpmPresets');
BPM_PRESETS.forEach((p,i)=>{
  const b = document.createElement('button');
  b.dataset.id = p.id;
  b.innerHTML = `<b>${p.label}</b><span>${p.range[0]}–${p.range[1]} bpm · ${p.blurb}</span>`;
  if(i===1) b.classList.add('on');
  b.addEventListener('click', ()=>{
    [...bpmPresets.children].forEach(c=>c.classList.remove('on'));
    b.classList.add('on');
    state.bpm = Math.round((p.range[0]+p.range[1])/2);
    document.getElementById('bpmDescIx').textContent = p.blurb;
    document.getElementById('bpmBand').textContent = p.label.toUpperCase();
    document.getElementById('bpmNum').textContent = state.bpm;
  });
  bpmPresets.appendChild(b);
});

/* knobs */
function setupKnob(node, opts){
  const val = node.querySelector('.val');
  const track = node.querySelector('.track i');
  let dragging=false,sy=0,sv=0;
  const fmt = v => opts.fmt? opts.fmt(v) : v.toFixed(2);
  function apply(v){
    v = Math.max(opts.min, Math.min(opts.max, v));
    opts.set(v);
    val.textContent = fmt(v);
    track.style.width = (100*(v-opts.min)/(opts.max-opts.min)).toFixed(1)+'%';
  }
  node.addEventListener('pointerdown', e=>{ dragging=true; sy=e.clientY; sv=opts.get(); node.setPointerCapture(e.pointerId); });
  node.addEventListener('pointermove', e=>{ if(!dragging) return; const dy=(sy-e.clientY)/130*(opts.max-opts.min); apply(sv+dy); });
  node.addEventListener('pointerup', ()=>dragging=false);
  apply(opts.get());
}
setupKnob(document.querySelector('[data-k=intensity]'), {min:0,max:1, get:()=>state.intensity, set:v=>state.intensity=v});
setupKnob(document.querySelector('[data-k=warp]'),      {min:0,max:1, get:()=>state.warp,      set:v=>state.warp=v});
setupKnob(document.querySelector('[data-k=hue]'),       {min:-180,max:180, get:()=>state.hue,  set:v=>{state.hue=v;state.targetHue=v;}, fmt:v=>(v>=0?'+':'')+v.toFixed(0)+'°'});
setupKnob(document.querySelector('[data-k=grain]'),     {min:0,max:1, get:()=>state.grain,     set:v=>state.grain=v});

/* main + art renderer */
const main = document.getElementById('mainCanvas');
const mainR = new Renderer(main, WALLS[0].id);
const artImg = document.getElementById('artImg');
const artPlaceholder = document.getElementById('artPlaceholder');
const heroArt = document.getElementById('heroArt');
const heroArtImg = document.getElementById('heroArtImg');
function setHeroArt(src){
  if(src){ heroArtImg.src = src; heroArt.classList.add('hasImg'); }
  else   { heroArtImg.removeAttribute('src'); heroArt.classList.remove('hasImg'); }
}

main.addEventListener('pointermove', e=>{
  const r = main.getBoundingClientRect();
  mainR.localMouse.x = (e.clientX - r.left)/r.width;
  mainR.localMouse.y = (e.clientY - r.top)/r.height;
});
main.addEventListener('pointerdown', e=>{
  const r = main.getBoundingClientRect();
  mainR.localMouse.x = (e.clientX - r.left)/r.width;
  mainR.localMouse.y = (e.clientY - r.top)/r.height;
  mainR.localClick = 1.0;
});

/* keyboard shortcuts */
window.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT') return;
  const n = parseInt(e.key,10);
  if(!isNaN(n) && n>=1 && n<=Math.min(9, WALLS.length)) setActiveShader(n-1);
  if(e.key===' '){ togglePlay(); e.preventDefault(); }
});
document.addEventListener('keydown', e=>{
  if((e.metaKey||e.ctrlKey) && e.key==='k'){ e.preventDefault(); searchInput.focus(); }
});

/* mode toggle */
document.querySelectorAll('.modeToggle button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.modeToggle button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    state.mode = b.dataset.mode;
    const path = document.getElementById('endpointPath');
    if(state.mode==='browser') path.textContent = ' /api/stream · ';
    else                       path.textContent = ' /api/integrations/openclaw/play · ';
  });
});

/* wallpaper shader switch (visual only) */
async function setActiveShader(i){
  const w = WALLS[i];
  if(!w) return;
  state.activeIdx = i;
  document.querySelectorAll('.wp').forEach((el,j)=>el.classList.toggle('active', j===i));
  document.getElementById('wpIx').textContent = (i+1)+' / '+WALLS.length;
  state.bpm = w.bpm;
  const preset = BPM_PRESETS.find(p=>p.id===w.preset) || BPM_PRESETS[1];
  [...bpmPresets.children].forEach(c=>c.classList.toggle('on', c.dataset.id===w.preset));
  document.getElementById('bpmDescIx').textContent = preset.blurb;
  document.getElementById('bpmBand').textContent = preset.label.toUpperCase();
  document.getElementById('bpmNum').textContent = state.bpm;
  // API shaders load their GLSL lazily; make sure it's compiled before switching.
  if(w.api && !(w.id in API_FRAGS)){
    try { await fetchShaderGLSL(w.id); }
    catch(e){ console.warn('shader unavailable', w.id, e); return; }
  }
  mainR.setFrag(w.id);
}

/* ====== Phase · Field shader catalogue (proxied via /api/shaders) ====== */
const PRESET_MAP = {
  Flow:'flow', Rest:'rest', Spark:'spark', Drive:'drive',
  flow:'flow', rest:'rest', spark:'spark', drive:'drive',
};

async function fetchShaderGLSL(id){
  if(id in API_FRAGS) return API_FRAGS[id];
  const r = await fetch(`/api/shaders/${encodeURIComponent(id)}/source?format=glsl`);
  if(!r.ok) throw new Error('glsl '+r.status);
  API_FRAGS[id] = await r.text();
  return API_FRAGS[id];
}

async function loadApiShaders(){
  let data;
  try {
    const r = await fetch('/api/shaders');
    if(!r.ok) throw new Error('shaders '+r.status);
    data = await r.json();
  } catch(e){ console.warn('Phase · Field API unavailable — keeping built-in wallpapers', e); return; }
  const shaders = (data && data.shaders) || [];
  for(const s of shaders){
    const presetId = PRESET_MAP[s.preset] || 'flow';
    const idx = WALLS.length;
    WALLS.push({ id: s.id, name: s.name, preset: presetId, bpm: s.bpm, api: true });
    const preset = BPM_PRESETS.find(p=>p.id===presetId) || BPM_PRESETS[1];
    const row = document.createElement('div');
    row.className = 'wp';
    row.innerHTML = `
      <div class="thumb"><canvas></canvas></div>
      <div class="info"><div class="name">${s.name}</div><div class="sub">${preset.label} · ${s.bpm} bpm</div></div>
      <div class="ix">${String(idx+1).padStart(2,'0')}</div>
    `;
    picker.appendChild(row);
    row.addEventListener('click', ()=>setActiveShader(idx));
    try {
      await fetchShaderGLSL(s.id);
      previewRenderers.push(new Renderer(row.querySelector('canvas'), s.id));
    } catch(e){
      console.warn('shader preview failed', s.id, e);
      row.classList.add('wp-unavailable');
    }
  }
  document.getElementById('wpIx').textContent = (state.activeIdx+1)+' / '+WALLS.length;
}
loadApiShaders();

/* ====== Real autocomplete ====== */
const searchInput = document.getElementById('searchInput');
const suggBox = document.getElementById('suggestions');
let acTimer = null;
let acInFlight = null;  // AbortController for the latest pending request

// Small LRU keyed on lowercased query. Hit returns instantly without fetch.
const AC_CACHE_MAX = 50;
const acCache = new Map();
function acCacheGet(key){
  if(!acCache.has(key)) return null;
  const v = acCache.get(key);
  acCache.delete(key); acCache.set(key, v);
  return v;
}
function acCacheSet(key, value){
  if(acCache.has(key)) acCache.delete(key);
  acCache.set(key, value);
  if(acCache.size > AC_CACHE_MAX){
    const oldest = acCache.keys().next().value;
    acCache.delete(oldest);
  }
}

function srcShortFor(s){
  const src = s.source || s.artwork_source || '';
  if(src.includes('spotify') && src.includes('musicbrainz')) return '★';
  if(src.includes('spotify')) return 'SP';
  if(src.includes('musicbrainz') || s.artwork_source==='cover_art_archive') return 'MB';
  if(src === 'youtube' || s.artwork_source==='youtube') return 'YT';
  return '✷';
}

function renderSuggestions(pool){
  suggBox.innerHTML = '';
  pool.forEach((s,i)=>{
    const conf = Math.min(99,Math.max(20,s.confidence||50));
    const tier = conf>=85?'high':conf>=60?'mid':'low';
    const srcShort = srcShortFor(s);
    const row = document.createElement('div');
    row.className = 'sugg'+(i===0?' active':'');
    const thumbHtml = s.thumbnail
      ? `<img src="${s.thumbnail}" alt="" loading="lazy">`
      : `<div class="placeholder">♪</div>`;
    row.innerHTML = `
      <div class="sugg-art">${thumbHtml}<div class="src">${srcShort}</div></div>
      <div>
        <div class="name">${s.title||''}</div>
        <div class="meta">
          <span>${s.artist||''}</span>
          <span class="sep">·</span>
          <span>${s.album||'—'}</span>
          <span class="sep">·</span>
          <span class="yr">${s.release_year||'—'}</span>
        </div>
      </div>
      <div class="score ${tier}"><span class="pct">${conf}%</span><span class="lbl">match</span></div>`;
    suggBox.appendChild(row);
    row.addEventListener('click', ()=>{ closeSuggestions(); searchInput.value=''; loadTrack(s); });
  });
  if(pool.length>0) suggBox.classList.add('open');
  else closeSuggestions();
}

async function openSuggestions(query){
  if(!query || !query.trim()){ closeSuggestions(); return; }
  const key = query.trim().toLowerCase();

  // Cache hit → render immediately, no fetch.
  const cached = acCacheGet(key);
  if(cached){ renderSuggestions(cached); return; }

  clearTimeout(acTimer);
  // Cancel any in-flight request — last keystroke wins.
  if(acInFlight){ acInFlight.abort(); acInFlight = null; }

  acTimer = setTimeout(async ()=>{
    const ctrl = new AbortController();
    acInFlight = ctrl;
    try {
      const t0 = performance.now();
      const r = await fetch(
        `/api/autocomplete?query=${encodeURIComponent(key)}&limit=6`,
        { signal: ctrl.signal }
      );
      // Ignore stale responses (controller changed before reply landed).
      if(acInFlight !== ctrl) return;
      const latMs = Math.round(performance.now()-t0);
      document.getElementById('latAc').textContent = latMs+'ms';
      if(!r.ok) return;
      const pool = await r.json();
      acCacheSet(key, pool);
      // Double-check freshness: only render if user hasn't moved on.
      if(searchInput.value.trim().toLowerCase() !== key) return;
      renderSuggestions(pool);
    } catch(e){
      if(e.name !== 'AbortError') console.warn('autocomplete', e);
    } finally {
      if(acInFlight === ctrl) acInFlight = null;
    }
  }, 120);
}
function closeSuggestions(){ suggBox.classList.remove('open'); }
searchInput.addEventListener('focus', ()=>openSuggestions(searchInput.value));
searchInput.addEventListener('input', ()=>openSuggestions(searchInput.value));
searchInput.addEventListener('blur',  ()=>setTimeout(closeSuggestions, 180));

/* ====== Track loading ====== */
function applyPlaybackState(payload, fallback = {}){
  const title = payload?.title || fallback.title || '…';
  const artist = payload?.artist || fallback.artist || '—';
  const album = payload?.album || fallback.album || '—';
  const releaseYear = payload?.release_year || fallback.release_year || '—';
  const duration = payload?.duration || fallback.duration || 0;
  const thumbnail = payload?.thumbnail || fallback.thumbnail || '';
  const artworkSource = payload?.artwork_source || fallback.artwork_source || '';

  state.currentWebpageUrl = payload?.webpage_url || fallback.webpage_url || state.currentWebpageUrl;
  state.duration = duration;
  state.elapsed = 0;

  document.getElementById('trackTitle').textContent = title;
  document.getElementById('trackTitleChrome').textContent = title;
  document.getElementById('artistName').textContent = artist;
  document.getElementById('albumName').textContent = album;
  document.getElementById('releaseYear').textContent = releaseYear;

  document.getElementById('artSrc').textContent =
    artworkSource === 'musicbrainz' ? 'MB · cover' :
    artworkSource === 'youtube' ? 'YT · thumb' :
    artworkSource === 'spotify' ? 'SP · thumb' :
    '✷ · gen';

  if(thumbnail){
    artImg.src = thumbnail;
    artImg.style.display = 'block';
    artPlaceholder.style.display = 'none';
  } else {
    artImg.style.display = 'none';
    artImg.src = '';
    artPlaceholder.style.display = 'flex';
  }
  setHeroArt(thumbnail || null);
}

async function loadTrack(s){
  applyPlaybackState({}, s);
  const query = [s.title, s.artist].filter(Boolean).join(' ');
  try {
    const t0 = performance.now();
    // Pass identity hints so the backend can rerank by duration coherence
    // and prefer official/Topic channels over covers and live takes.
    const params = new URLSearchParams({ query, limit: '1' });
    if(s.duration) params.set('target_duration', String(s.duration));
    if(s.title)    params.set('expected_title', s.title);
    if(s.artist)   params.set('expected_artist', s.artist);
    if(s.album)    params.set('expected_album', s.album);
    if(s.release_year) params.set('expected_year', String(s.release_year));
    const r = await fetch(`/api/search?${params.toString()}`);
    document.getElementById('latSr').textContent = Math.round(performance.now()-t0)+'ms';
    if(!r.ok) return;
    const results = await r.json();
    if(!results||!results.length) return;
    const result = results[0];
    applyPlaybackState(result, s);

    if(state.mode==='browser'){
      const t1 = performance.now();
      const streamUrl = `/api/stream?url=${encodeURIComponent(result.webpage_url)}`;
      audioEl.src = streamUrl;
      audioEl.play().then(()=>{
        document.getElementById('latSt').textContent = Math.round(performance.now()-t1)+'ms';
        document.getElementById('endStatus').textContent = '200 · streaming';
      }).catch(()=>{});
    } else {
      fetch(`/api/integrations/openclaw/play?query=${encodeURIComponent(query)}`);
      state.playing = true;
      updatePlayBtn();
      document.getElementById('endStatus').textContent = 'ffplay · local';
    }

    loadLyrics({title:result.title||s.title, artist:result.artist||s.artist, album:result.album||s.album, duration:state.duration});
  } catch(e){ console.warn('loadTrack', e); }
}

async function loadLyrics(meta){
  state.lyrics = [];
  document.getElementById('lyricsList').innerHTML = '';
  document.getElementById('lyrSync').textContent = '— loading —';
  try {
    const params = new URLSearchParams({title:meta.title||'', artist:meta.artist||''});
    if(meta.album) params.set('album', meta.album);
    if(meta.duration) params.set('duration', Math.round(meta.duration));
    const t0 = performance.now();
    const r = await fetch(`/api/lyrics?${params}`);
    document.getElementById('latLy').textContent = Math.round(performance.now()-t0)+'ms';
    if(!r.ok){ document.getElementById('lyrSync').textContent='— not found —'; return; }
    const data = await r.json();
    let lines = [];
    if(data.synced_lyrics){
      data.synced_lyrics.split('\n').forEach(line=>{
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        if(m){
          const ms = (parseInt(m[1])*60 + parseFloat(m[2]))*1000;
          if(m[3]) lines.push({ms, text:m[3]});
        }
      });
    } else if(data.plain_lyrics){
      lines = data.plain_lyrics.split('\n').filter(l=>l.trim()).map((l,i)=>({ms:i*4000,text:l}));
    }
    state.lyrics = lines;
    const syncType = data.synced_lyrics?'synced':'plain';
    renderLyricsList(lines, syncType);
    document.getElementById('lyrProvider').textContent = `LRCLIB · ${syncType} · `;
    if(lines.length) document.getElementById('lyrCur').textContent = lines[0].text;
  } catch(e){ document.getElementById('lyrSync').textContent='— error —'; }
}

function renderLyricsList(lines, syncType){
  const host = document.getElementById('lyricsList');
  host.innerHTML = '';
  lines.forEach((ln,idx)=>{
    const row = document.createElement('div');
    row.className = 'row'; row.dataset.idx = idx;
    row.innerHTML = `<span class="ts">${msToTs(ln.ms)}</span><span class="ln">${ln.text}</span>`;
    host.appendChild(row);
  });
  document.getElementById('lyrSync').textContent = `${syncType} · ${lines.length} lines`;
}

function msToTs(ms){
  const s=(ms/1000)|0; const mm=(s/60)|0; const ss=s%60;
  const cs=Math.floor((ms%1000)/10);
  return `${mm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`;
}

function updateLyricsOverlay(elapsedMs){
  const lines = state.lyrics;
  if(!lines.length) return;
  let curIdx = 0;
  for(let i=0;i<lines.length;i++){ if(lines[i].ms<=elapsedMs) curIdx=i; }
  const prev = lines[Math.max(0,curIdx-1)];
  const cur  = lines[curIdx];
  const next = lines[Math.min(lines.length-1,curIdx+1)];
  document.getElementById('lyrPrev').textContent = prev&&prev!==cur?prev.text:'';
  document.getElementById('lyrCur').textContent  = cur?cur.text:'';
  document.getElementById('lyrNext').textContent = next&&next!==cur?next.text:'';
  document.getElementById('lyrTs').textContent = msToTs(elapsedMs);
  const rows = document.querySelectorAll('#lyricsList .row');
  rows.forEach((el,i)=>{
    const active = i===curIdx;
    el.classList.toggle('is-cur', active);
    if(active) el.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
}

/* ====== Playback controls ====== */
function updatePlayBtn(){
  document.getElementById('playIcon').innerHTML = state.playing
    ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
}

function togglePlay(){
  if(state.mode==='browser'){
    if(audioEl.src && audioEl.src !== window.location.href){
      if(audioEl.paused){ audioEl.play().catch(()=>{}); }
      else { audioEl.pause(); }
    }
  } else {
    if(state.playing){ fetch('/api/integrations/openclaw/stop'); state.playing=false; }
    else { fetch('/api/integrations/openclaw/resume'); state.playing=true; }
    updatePlayBtn();
  }
}

document.getElementById('playBtn').addEventListener('click', togglePlay);
document.getElementById('nextBtn').addEventListener('click', ()=>setActiveShader((state.activeIdx+1)%5));
document.getElementById('prevBtn').addEventListener('click', ()=>setActiveShader((state.activeIdx+4)%5));

const scrubBar = document.getElementById('scrubBar');
scrubBar.addEventListener('click', e=>{
  const r = scrubBar.getBoundingClientRect();
  const frac = (e.clientX-r.left)/r.width;
  if(state.mode==='browser'&&audioEl.duration&&!isNaN(audioEl.duration)){
    audioEl.currentTime = frac*audioEl.duration;
  } else {
    state.elapsed = frac*state.duration;
  }
});

/* ====== Health check ====== */
async function checkHealth(){
  try {
    const r = await fetch('/health');
    if(!r.ok) return;
    const d = await r.json();
    document.getElementById('runtimeText').textContent =
      `GET /health · ${d.status||'ok'} · ${d.mode||'browser-first'}`;
    document.getElementById('healthIx').textContent =
      `/health · ${d.status||'ok'}`;
  } catch(e){}
}
checkHealth();

/* ====== Spotify import ====== */
const spotify = {
  connected:false,
  loading:false,
  popup:null,
  playlists:[],
  playlistsOffset:0,
  playlistsLimit:10,
  playlistsDone:false,
  playlistsLoading:false,
  likedTracks:[],
  likedOffset:0,
  likedLimit:10,
  likedTotal:0,
  likedDone:false,
  likedLoading:false,
  preview:null,
  view:'playlists',
};

const spotifyConnectLink = document.getElementById('spotifyConnect');
const spotifyConnectBtn = document.getElementById('spotifyConnectBtn');
const spotifyPlaylistsBtn = document.getElementById('spotifyPlaylistsBtn');
const spotifyLikedBtn = document.getElementById('spotifyLikedBtn');
const spotifyList = document.getElementById('plList');
const spotifyIx = document.getElementById('spStat');
const spotifyAccount = document.getElementById('spotifyAccount');
const spotifyScope = document.getElementById('spotifyScope');
const spotifyConnText = document.getElementById('spotifyConnText');
const spotifyConnDot = document.getElementById('spotifyConnDot');

function setSpotifyStatus(label, detail){
  if(spotifyIx) spotifyIx.textContent = label;
  if(spotifyScope) spotifyScope.textContent = detail || label;
}

function setSpotifyConnection(state, text){
  if(spotifyConnectBtn) spotifyConnectBtn.dataset.state = state;
  if(spotifyConnText) spotifyConnText.textContent = text;
  if(spotifyConnDot) spotifyConnDot.className = `dot ${state}`;
}

function setSpotifyEmpty(text){
  if(!spotifyList) return;
  spotifyList.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  spotifyList.appendChild(empty);
}

function clearSpotifyLoadMore(){
  spotifyList?.querySelector('.spotifyLoadMore')?.remove();
}

function setSpotifyLoadMore(text, onClick = null){
  if(!spotifyList) return;
  clearSpotifyLoadMore();
  const more = document.createElement(onClick ? 'button' : 'div');
  more.className = 'spotifyLoadMore';
  more.textContent = text;
  if(onClick){
    more.type = 'button';
    more.addEventListener('click', e=>{
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
  }
  spotifyList.appendChild(more);
}

function setSpotifyView(view){
  spotify.view = view === 'liked' ? 'liked' : 'playlists';
  spotify.preview = null;
  spotifyPlaylistsBtn?.classList.toggle('on', spotify.view === 'playlists');
  spotifyLikedBtn?.classList.toggle('on', spotify.view === 'liked');
  if(spotify.view === 'liked'){
    if(spotifyAccount) spotifyAccount.textContent = 'Liked songs';
    if(spotifyScope) spotifyScope.textContent = 'saved tracks · read-only';
  } else if(spotify.connected) {
    if(spotifyAccount) spotifyAccount.textContent = 'Spotify library';
    if(spotifyScope) spotifyScope.textContent = 'read-only playlist import';
  }
  if(!spotify.connected) return;
  if(spotify.view === 'liked' && spotify.likedLoading){
    setSpotifyEmpty('loading liked songs');
    return;
  }
  if(spotify.view === 'playlists' && spotify.playlistsLoading){
    setSpotifyEmpty('loading playlists');
    return;
  }
  if(spotify.view === 'liked' && spotify.likedTracks.length){
    renderSpotifyLikedTracks(spotify.likedTracks);
  } else if(spotify.view === 'liked') {
    setSpotifyEmpty('select liked songs to load');
  } else if(spotify.view === 'playlists' && spotify.playlists.length){
    renderSpotifyPlaylists(spotify.playlists);
  } else if(spotify.view === 'playlists') {
    setSpotifyEmpty('select playlists to load');
  }
}

function openSpotifyAuth(){
  const w = 520, h = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
  spotify.popup = window.open(
    '/api/import/spotify/start',
    'spotify-import',
    `popup=yes,width=${w},height=${h},left=${left},top=${top}`
  );
  if(!spotify.popup){
    window.location.href = '/api/import/spotify/start';
    return;
  }
  setSpotifyConnection('loading', 'waiting');
  setSpotifyStatus('connecting', 'waiting for spotify');
}

async function refreshSpotifyStatus(){
  try {
    const r = await fetch('/api/import/spotify/status', { cache:'no-store' });
    if(!r.ok) throw new Error('status failed');
    const d = await r.json();
    spotify.connected = !!d.connected;
    if(!d.configured){
      setSpotifyStatus('missing id', 'client id missing');
      setSpotifyConnection('disconnected', 'missing');
      setSpotifyEmpty('spotify client id missing');
      return false;
    }
    if(!d.connected){
      setSpotifyStatus('not connected', 'connect to fetch');
      setSpotifyConnection('disconnected', 'connect');
      if(spotifyAccount) spotifyAccount.textContent = 'Spotify library';
      setSpotifyView('playlists');
      setSpotifyEmpty('connect spotify to fetch playlists');
      return false;
    }
    setSpotifyConnection('connected', 'linked');
    setSpotifyStatus('connected · scope read', 'read-only playlist import');
    setSpotifyView(spotify.view);
    return true;
  } catch(e) {
    setSpotifyStatus('error', 'status failed');
    setSpotifyConnection('disconnected', 'error');
    setSpotifyEmpty('spotify status failed');
    return false;
  }
}

function createSpotifyPlaylistRow(pl){
  const row = document.createElement('div');
  row.className = 'plRow';
  row.dataset.playlistId = pl.id;

  const meta = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'pl-name';
  name.textContent = pl.name || 'Untitled playlist';
  const sub = document.createElement('div');
  sub.className = 'pl-sub';
  const owner = pl.owner ? ` · ${pl.owner}` : '';
  sub.textContent = `${pl.track_count || 0} tracks${owner}`;
  meta.append(name, sub);

  const match = document.createElement('div');
  match.className = 'match';
  const badge = document.createElement('span');
  badge.className = 'ok';
  badge.textContent = 'preview';
  match.appendChild(badge);

  row.append(meta, match);
  row.addEventListener('click', ()=>previewSpotifyPlaylist(row, pl));
  return row;
}

function renderSpotifyPlaylistsPage(playlists, { append = false } = {}){
  spotify.preview = null;
  if(!append){
    spotifyList.innerHTML = '';
    clearSpotifyLoadMore();
  }
  if(!playlists.length && !append){
    setSpotifyEmpty('no playlists found');
    return;
  }
  playlists.forEach(pl=>spotifyList.appendChild(createSpotifyPlaylistRow(pl)));
}

function updateSpotifyPlaylistsFooter(){
  clearSpotifyLoadMore();
  if(spotify.view !== 'playlists' || spotify.preview) return;
  if(spotify.playlistsLoading){
    setSpotifyLoadMore('loading more playlists');
  } else if(!spotify.playlistsDone && spotify.playlists.length){
    setSpotifyLoadMore('load next 10 playlists', ()=>fetchSpotifyPlaylists({ append:true }));
  }
}

function renderSpotifyPlaylists(playlists){
  renderSpotifyPlaylistsPage(playlists, { append: false });
  updateSpotifyPlaylistsFooter();
}

function renderSpotifyTrackRows(tracks, options = {}){
  const {
    headline = '',
    subline = '',
    emptyText = 'no tracks found',
    onBack = null,
    backLabel = 'Back',
  } = options;

  spotifyList.innerHTML = '';

  if(headline || subline || onBack){
    const head = document.createElement('div');
    head.className = 'spotifyPreviewHead';

    if(onBack){
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'spotifyBack';
      back.textContent = backLabel;
      back.addEventListener('click', e=>{
        e.preventDefault();
        e.stopPropagation();
        onBack();
      });
      head.appendChild(back);
    }

    const meta = document.createElement('div');
    meta.className = 'spotifyPreviewMeta';
    if(headline){
      const title = document.createElement('div');
      title.className = 'spotifyPreviewTitle';
      title.textContent = headline;
      meta.appendChild(title);
    }
    if(subline){
      const sub = document.createElement('div');
      sub.className = 'spotifyPreviewSub';
      sub.textContent = subline;
      meta.appendChild(sub);
    }
    head.appendChild(meta);
    spotifyList.appendChild(head);
  }

  if(!tracks.length){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = emptyText;
    spotifyList.appendChild(empty);
    return;
  }

  tracks.forEach(item=>{
    const track = item.source || {};
    const match = item.musicbrainz || {};
    const conf = Math.min(99, Math.max(20, match.confidence || 0));
    const tier = conf >= 85 ? 'high' : conf >= 60 ? 'mid' : 'low';
    const playable = conf >= 80;
    const row = document.createElement('div');
    row.className = `likedRow${playable ? ' playable' : ''}`;
    row.title = playable ? 'Play this well-matched track' : 'Track is not matched well enough to play directly';

    const meta = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = match.title || track.title || 'Untitled track';
    const sub = document.createElement('div');
    sub.className = 'meta';
    const artist = (match.artist || (track.artist_names || []).join(', ')) || '—';
    const album = match.album || track.album || '—';
    sub.innerHTML = `<span>${artist}</span><span class="sep">·</span><span>${album}</span>`;
    meta.append(title, sub);

    const matchCol = document.createElement('div');
    matchCol.className = 'match';
    const good = document.createElement('span');
    good.className = tier;
    good.textContent = `${conf}%`;
    matchCol.appendChild(good);

    const saved = document.createElement('div');
    saved.className = 'saved';
    saved.textContent = match.match_reason === 'unmatched' ? 'unmatched' : (match.match_reason || 'linked');

    const hint = document.createElement('div');
    hint.className = 'playHint';
    hint.textContent = playable ? 'Play' : 'Match low';

    row.append(meta, matchCol, saved, hint);
    if(playable){
      row.addEventListener('click', ()=>playSpotifyExportedTrack(item));
    }
    spotifyList.appendChild(row);
  });
}

function createSpotifyLikedRow(item){
  const track = item.source || {};
  const match = item.musicbrainz || {};
  const conf = Math.min(99, Math.max(20, match.confidence || 0));
  const tier = conf >= 85 ? 'high' : conf >= 60 ? 'mid' : 'low';
  const playable = conf >= 80;
  const row = document.createElement('div');
  row.className = `likedRow${playable ? ' playable' : ''}`;
  row.title = playable ? 'Play this well-matched track' : 'Track is not matched well enough to play directly';

  const meta = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = match.title || track.title || 'Untitled track';
  const sub = document.createElement('div');
  sub.className = 'meta';
  const artist = (match.artist || (track.artist_names || []).join(', ')) || '—';
  const album = match.album || track.album || '—';
  sub.innerHTML = `<span>${artist}</span><span class="sep">·</span><span>${album}</span>`;
  meta.append(title, sub);

  const matchCol = document.createElement('div');
  matchCol.className = 'match';
  const good = document.createElement('span');
  good.className = tier;
  good.textContent = `${conf}%`;
  matchCol.appendChild(good);

  const saved = document.createElement('div');
  saved.className = 'saved';
  saved.textContent = match.match_reason === 'unmatched' ? 'unmatched' : (match.match_reason || 'linked');

  const hint = document.createElement('div');
  hint.className = 'playHint';
  hint.textContent = playable ? 'Play' : 'Match low';

  row.append(meta, matchCol, saved, hint);
  if(playable){
    row.addEventListener('click', ()=>playSpotifyExportedTrack(item));
  }
  return row;
}

function renderSpotifyLikedTracksPage(tracks, { append = false } = {}){
  spotify.preview = null;
  if(!append){
    spotifyList.innerHTML = '';
    clearSpotifyLoadMore();
  }
  if(!tracks.length && !append){
    setSpotifyEmpty('no liked songs found');
    return;
  }
  tracks.forEach(item=>spotifyList.appendChild(createSpotifyLikedRow(item)));
}

function updateSpotifyLikedFooter(){
  clearSpotifyLoadMore();
  if(spotify.view !== 'liked' || spotify.preview) return;
  if(spotify.likedLoading){
    setSpotifyLoadMore('loading more liked songs');
  } else if(!spotify.likedDone && spotify.likedTracks.length){
    setSpotifyLoadMore('load next 10 liked songs', ()=>fetchSpotifyLikedTracks({ append:true }));
  }
}

function renderSpotifyLikedTracks(tracks){
  renderSpotifyLikedTracksPage(tracks, { append: false });
  updateSpotifyLikedFooter();
}

function renderSpotifyPlaylistPreview(data, playlist){
  spotify.preview = {playlist, data};
  const tracks = data.tracks || [];
  const subline = `${data.matched_count || 0} ok · ${data.low_confidence_count || 0} low · ${data.unmatched_count || 0} unmatched`;
  renderSpotifyTrackRows(tracks, {
    headline: playlist.name || 'Playlist preview',
    subline,
    emptyText: 'no matched tracks found',
    backLabel: 'Back to playlists',
    onBack: ()=>{
      spotify.preview = null;
      renderSpotifyPlaylists(spotify.playlists);
      if(spotifyAccount) spotifyAccount.textContent = 'Spotify library';
      if(spotifyScope) spotifyScope.textContent = 'read-only playlist import';
      setSpotifyStatus(`connected · ${spotify.playlists.length} lists`, `${spotify.playlists.length} loaded · read-only`);
    },
  });
  if(spotifyAccount) spotifyAccount.textContent = playlist.name || 'Playlist preview';
  setSpotifyStatus('previewed', playlist.name || 'playlist');
}

async function playSpotifyExportedTrack(item){
  const track = item?.source || {};
  const match = item?.musicbrainz || {};
  const queryParts = [match.title || track.title, match.artist || (track.artist_names || []).join(', ')].filter(Boolean);
  const query = queryParts.join(' ');
  const fallback = {
    title: match.title || track.title || 'Untitled track',
    artist: match.artist || (track.artist_names || []).join(', ') || '—',
    album: match.album || track.album || undefined,
    duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : undefined,
    thumbnail: match.artwork_url || track.artwork_url || undefined,
    artwork_source: match.artwork_url ? 'musicbrainz' : (track.artwork_url ? 'spotify' : undefined),
    release_year: match.release_year || undefined,
  };
  applyPlaybackState({}, fallback);
  try {
    await loadTrack({
      title: fallback.title,
      artist: fallback.artist,
      album: fallback.album,
      duration: fallback.duration,
      thumbnail: fallback.thumbnail,
      artwork_source: fallback.artwork_source,
      release_year: fallback.release_year,
    });
    if(query) document.getElementById('searchInput').value = query;
  } catch(e) {
    console.warn('spotify playback', e);
    setSpotifyStatus('playback failed', String(e?.message || e || 'resolve failed'));
    document.getElementById('endStatus').textContent = 'resolve failed';
    if(query) document.getElementById('searchInput').value = query;
  }
}

async function fetchSpotifyLikedTracks({ reset = false, append = false } = {}){
  if(spotify.likedLoading) return;
  if(reset){
    spotify.likedOffset = 0;
    spotify.likedTotal = 0;
    spotify.likedDone = false;
    spotify.likedTracks = [];
    spotifyList.innerHTML = '';
    clearSpotifyLoadMore();
  }
  spotify.likedLoading = true;
  spotify.loading = true;
  setSpotifyView('liked');
  setSpotifyStatus('loading', append ? 'loading more liked songs' : 'fetching liked songs');
  updateSpotifyLikedFooter();
  try {
    const connected = await refreshSpotifyStatus();
    if(!connected) return;
    const limit = spotify.likedLimit || 5;
    const offset = reset ? 0 : spotify.likedOffset;
    const r = await fetch(`/api/import/spotify/liked-tracks?limit=${limit}&offset=${offset}`, { cache:'no-store' });
    if(!r.ok) throw new Error(await r.text());
    const payload = await r.json();
    const page = payload.tracks || [];
    spotify.likedTotal = payload.total || 0;
    spotify.likedOffset = (payload.offset || offset) + page.length;
    spotify.likedDone = !page.length || spotify.likedOffset >= spotify.likedTotal;
    spotify.likedTracks = reset ? page : spotify.likedTracks.concat(page);
    renderSpotifyLikedTracksPage(page, { append });
    updateSpotifyLikedFooter();
    setSpotifyStatus(
      `connected · ${spotify.likedOffset}/${payload.total || spotify.likedTracks.length} liked`,
      `${payload.matched_count || 0} linked · ${payload.low_confidence_count || 0} low · ${payload.unmatched_count || 0} unmatched`
    );
    if(spotifyAccount) spotifyAccount.textContent = 'Liked songs';
  } catch(e) {
    console.warn('spotify liked tracks', e);
    const msg = String(e?.message || e || '').toLowerCase();
    if(msg.includes('scope') || msg.includes('reconnect')){
      setSpotifyStatus('reconnect spotify', 'liked songs needs new scope');
      setSpotifyConnection('disconnected', 'reconnect');
      setSpotifyEmpty('reconnect spotify to load liked songs');
    } else {
      setSpotifyStatus('error', 'liked tracks failed');
      setSpotifyConnection('disconnected', 'retry');
      setSpotifyEmpty('liked tracks failed');
    }
  } finally {
    spotify.likedLoading = false;
    spotify.loading = false;
    updateSpotifyLikedFooter();
  }
}

async function fetchSpotifyPlaylists({ reset = false, append = false } = {}){
  if(spotify.playlistsLoading) return;
  if(reset){
    spotify.playlistsOffset = 0;
    spotify.playlistsDone = false;
    spotify.playlists = [];
    spotifyList.innerHTML = '';
    clearSpotifyLoadMore();
  }
  spotify.playlistsLoading = true;
  spotify.loading = true;
  setSpotifyView('playlists');
  setSpotifyStatus('loading', append ? 'loading more playlists' : 'fetching playlists');
  updateSpotifyPlaylistsFooter();
  try {
    const connected = await refreshSpotifyStatus();
    if(!connected) return;
    const limit = spotify.playlistsLimit || 10;
    const offset = reset ? 0 : spotify.playlistsOffset;
    const r = await fetch(`/api/import/spotify/playlists?limit=${limit}&offset=${offset}`, { cache:'no-store' });
    if(!r.ok) throw new Error(await r.text());
    const page = await r.json();
    spotify.playlistsOffset = offset + page.length;
    spotify.playlistsDone = page.length < limit;
    spotify.playlists = reset ? page : spotify.playlists.concat(page);
    renderSpotifyPlaylistsPage(page, { append });
    updateSpotifyPlaylistsFooter();
    setSpotifyStatus(`connected · ${spotify.playlists.length} lists`, `${spotify.playlists.length} loaded · read-only`);
    if(spotifyAccount) spotifyAccount.textContent = 'Spotify library';
  } catch(e) {
    console.warn('spotify playlists', e);
    setSpotifyStatus('error', 'playlist fetch failed');
    setSpotifyConnection('disconnected', 'retry');
    setSpotifyEmpty('playlist fetch failed');
  } finally {
    spotify.playlistsLoading = false;
    spotify.loading = false;
    updateSpotifyPlaylistsFooter();
  }
}

async function previewSpotifyPlaylist(row, playlist){
  try {
    const r = await fetch(`/api/import/spotify/playlists/${encodeURIComponent(playlist.id)}/preview?limit=25`);
    if(!r.ok) throw new Error(await r.text());
    const data = await r.json();
    renderSpotifyPlaylistPreview(data, playlist);
  } catch(e) {
    console.warn('spotify preview', e);
    setSpotifyStatus('error', 'preview failed');
  }
}

function wireSpotifyImport(){
  if(!spotifyList) return;
  spotifyConnectLink?.addEventListener('click', e=>{ e.preventDefault(); openSpotifyAuth(); });
  spotifyConnectBtn?.addEventListener('click', ()=>{
    if(spotify.connected) (spotify.view === 'liked' ? fetchSpotifyLikedTracks({ reset:true }) : fetchSpotifyPlaylists({ reset:true }));
    else openSpotifyAuth();
  });
  spotifyPlaylistsBtn?.addEventListener('click', ()=>{
    setSpotifyView('playlists');
    if(spotify.connected && !spotify.playlists.length) fetchSpotifyPlaylists({ reset:true });
  });
  spotifyLikedBtn?.addEventListener('click', ()=>{
    setSpotifyView('liked');
    if(spotify.connected && !spotify.likedTracks.length) fetchSpotifyLikedTracks({ reset:true });
    else openSpotifyAuth();
  });
  spotifyList?.addEventListener('scroll', ()=>{
    if(!spotify.connected || spotify.preview) return;
    const threshold = 28;
    if(spotifyList.scrollTop + spotifyList.clientHeight < spotifyList.scrollHeight - threshold) return;
    if(spotify.view === 'liked' && !spotify.likedLoading && !spotify.likedDone){
      fetchSpotifyLikedTracks({ append:true });
    } else if(spotify.view === 'playlists' && !spotify.playlistsLoading && !spotify.playlistsDone){
      fetchSpotifyPlaylists({ append:true });
    }
  });
  window.addEventListener('message', e=>{
    if(e.origin !== window.location.origin) return;
    if(e.data && e.data.type === 'spotify-connected') {
      (spotify.view === 'liked' ? fetchSpotifyLikedTracks({ reset:true }) : fetchSpotifyPlaylists({ reset:true }));
    }
  });
  refreshSpotifyStatus().then(connected=>{
    if(!connected) return;
    if(spotify.view === 'liked') fetchSpotifyLikedTracks({ reset:true });
    else fetchSpotifyPlaylists({ reset:true });
  });
}
wireSpotifyImport();

/* ====== Equalizer ====== */
const eqOpts = {style:'bars', bands:32, palette:'lime', scale:'linear', peaks:true};
let eqLevels = new Float32Array(eqOpts.bands);
let eqPeaks  = new Float32Array(eqOpts.bands);
function setBands(n){ if(n===eqLevels.length) return; eqLevels=new Float32Array(n); eqPeaks=new Float32Array(n); }

const eqPalettes = {
  lime:  {base:'rgba(215,255,58,0.06)',  mid:'rgba(215,255,58,0.45)',  hot:'rgba(215,255,58,0.95)',  peak:'rgba(255,255,255,0.75)', solid:'#d7ff3a'},
  ice:   {base:'rgba(122,217,255,0.06)', mid:'rgba(122,217,255,0.45)', hot:'rgba(220,245,255,0.95)', peak:'rgba(255,255,255,0.75)', solid:'#7ad9ff'},
  magma: {base:'rgba(255,106,61,0.06)',  mid:'rgba(255,106,61,0.55)',  hot:'rgba(255,210,120,0.95)', peak:'rgba(255,240,210,0.8)',  solid:'#ff6a3d'},
  mono:  {base:'rgba(244,244,245,0.06)', mid:'rgba(244,244,245,0.40)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', solid:'#f4f4f5'},
};
const eqOverlayPalettes = {
  lime:  {base:'rgba(215,255,58,0.10)',  mid:'rgba(215,255,58,0.55)',  hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)'},
  ice:   {base:'rgba(122,217,255,0.12)', mid:'rgba(122,217,255,0.55)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)'},
  magma: {base:'rgba(255,106,61,0.12)',  mid:'rgba(255,106,61,0.60)',  hot:'rgba(255,230,150,0.95)', peak:'rgba(255,240,210,0.85)'},
  mono:  {base:'rgba(244,244,245,0.10)', mid:'rgba(244,244,245,0.45)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)'},
};

function updateEqLevels(t, env){
  const N=eqLevels.length;
  if(analyser && freqData && state.playing){
    /* map 1024 FFT bins → N bands on a log frequency scale (40Hz–18kHz) */
    const binCount=freqData.length;
    const nyquist=audioCtx.sampleRate/2;
    const binHz=nyquist/binCount;
    const logMin=Math.log10(40), logMax=Math.log10(18000);
    for(let i=0;i<N;i++){
      const f0=Math.pow(10,logMin+(i/N)*(logMax-logMin));
      const f1=Math.pow(10,logMin+((i+1)/N)*(logMax-logMin));
      const b0=Math.max(0,Math.floor(f0/binHz));
      const b1=Math.min(binCount-1,Math.ceil(f1/binHz));
      let sum=0,count=0;
      for(let b=b0;b<=b1;b++){sum+=freqData[b];count++;}
      const raw=count>0?sum/count/255:0;
      const v=Math.min(1,raw*(1+state.intensity));
      const prev=eqLevels[i];
      eqLevels[i]=prev+(v-prev)*(v>prev?0.65:0.14);
      eqPeaks[i]=Math.max(eqLevels[i],eqPeaks[i]-0.008);
    }
  } else {
    /* idle: gentle decay to zero */
    for(let i=0;i<N;i++){
      eqLevels[i]*=0.88;
      eqPeaks[i]=Math.max(eqLevels[i],eqPeaks[i]-0.005);
    }
  }
}

function shapeLevel(v){ return eqOpts.scale==='log'?Math.max(0,Math.min(1,Math.log10(1+v*9))):v; }

function drawEq(canvas, levels, peaks, opts){
  const ctx=canvas.getContext('2d');
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=canvas.clientWidth*dpr, h=canvas.clientHeight*dpr;
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
  ctx.clearRect(0,0,w,h);
  const n=levels.length;
  const style=opts.style||'bars';
  const showPeaks=(opts.peaks!==false)&&eqOpts.peaks;
  const gap=Math.max(1*dpr,w*0.003);
  const bw=(w-gap*(n-1))/n;
  if(style==='wave'||style==='ribbon'||style==='dots'){
    const pts=[];
    for(let i=0;i<n;i++){
      const v=shapeLevel(levels[i]);
      pts.push([i*(bw+gap)+bw/2, h-Math.max(2*dpr,v*h*0.94)]);
    }
    if(style==='wave'){
      ctx.lineWidth=Math.max(1.5*dpr,2*dpr); ctx.strokeStyle=opts.hot;
      ctx.shadowColor=opts.mid; ctx.shadowBlur=6*dpr;
      ctx.beginPath(); pts.forEach((p,i)=>{ if(i===0) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); }); ctx.stroke();
      ctx.shadowBlur=0;
      const grad=ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0,opts.mid); grad.addColorStop(1,opts.base);
      ctx.fillStyle=grad; ctx.beginPath(); ctx.moveTo(0,h);
      pts.forEach(p=>ctx.lineTo(p[0],p[1])); ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
    } else if(style==='ribbon'){
      const mid=h/2; ctx.fillStyle=opts.mid; ctx.beginPath();
      pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; if(i===0) ctx.moveTo(p[0],mid-dy); else ctx.lineTo(p[0],mid-dy); });
      for(let i=pts.length-1;i>=0;i--){ const p=pts[i]; const dy=(h-p[1])*0.5; ctx.lineTo(p[0],mid+dy); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle=opts.hot; ctx.lineWidth=1*dpr;
      ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; if(i===0) ctx.moveTo(p[0],mid-dy); else ctx.lineTo(p[0],mid-dy); }); ctx.stroke();
      ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; if(i===0) ctx.moveTo(p[0],mid+dy); else ctx.lineTo(p[0],mid+dy); }); ctx.stroke();
    } else {
      ctx.fillStyle=opts.hot; const r=Math.max(1.5*dpr,bw*0.35);
      pts.forEach(p=>{ ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fill(); });
      ctx.fillStyle=opts.base; pts.forEach(p=>{ ctx.fillRect(p[0]-bw/2+gap/2,p[1]+r,bw-gap,h-p[1]-r); });
    }
    return;
  }
  for(let i=0;i<n;i++){
    const v=shapeLevel(levels[i]); const pv=shapeLevel(peaks[i]); const x=i*(bw+gap);
    if(style==='mirror'){
      const mid=h/2; const bh=Math.max(1.5*dpr,v*mid*0.94); const yTop=mid-bh;
      const grad=ctx.createLinearGradient(0,mid,0,0); grad.addColorStop(0,opts.base); grad.addColorStop(0.6,opts.mid); grad.addColorStop(1,opts.hot);
      ctx.fillStyle=grad; ctx.fillRect(x,yTop,bw,bh);
      const grad2=ctx.createLinearGradient(0,mid,0,h); grad2.addColorStop(0,opts.base); grad2.addColorStop(0.6,opts.mid); grad2.addColorStop(1,opts.hot);
      ctx.fillStyle=grad2; ctx.fillRect(x,mid,bw,bh);
      if(showPeaks){ const ph=pv*mid*0.94; ctx.fillStyle=opts.peak; ctx.fillRect(x,mid-ph-1*dpr,bw,1.2*dpr); ctx.fillRect(x,mid+ph,bw,1.2*dpr); }
      continue;
    }
    const bh=Math.max(2*dpr,v*h*0.96); const y=h-bh;
    const grad=ctx.createLinearGradient(0,h,0,y); grad.addColorStop(0,opts.base); grad.addColorStop(0.55,opts.mid); grad.addColorStop(1,opts.hot);
    ctx.fillStyle=grad; ctx.fillRect(x,y,bw,bh);
    if(showPeaks){ const py=h-pv*h*0.96; ctx.fillStyle=opts.peak; ctx.fillRect(x,py-2*dpr,bw,1.5*dpr); }
  }
}

function setEqLabel(){ document.getElementById('eqMode').textContent=`${eqOpts.style} · ${eqLevels.length} · ${eqOpts.palette}`; }
(function wireEqControls(){
  const root=document.getElementById('eqControls'); if(!root) return;
  root.addEventListener('click', e=>{
    const chip=e.target.closest('.eqChip'); if(!chip) return;
    const group=chip.parentElement; const key=group.dataset.key; const v=chip.dataset.v;
    if(key==='peaks'){ eqOpts.peaks=!eqOpts.peaks; chip.classList.toggle('on',eqOpts.peaks); return; }
    group.querySelectorAll('.eqChip').forEach(c=>c.classList.toggle('on',c===chip));
    if(key==='bands'){ const n=parseInt(v,10); eqOpts.bands=n; setBands(n); }
    else { eqOpts[key]=v; }
    setEqLabel();
  });
})();

/* ====== Animation loop ====== */
let lastT=performance.now();
let pulse=0, nextBeat=0;
function fmt(s){ s=Math.max(0,s|0); const m=(s/60)|0,ss=s%60; return m.toString().padStart(2,'0')+':'+ss.toString().padStart(2,'0'); }

function loop(now){
  const dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
  const t=now/1000;

  /* sync audio state */
  if(state.mode==='browser' && audioEl.duration && !isNaN(audioEl.duration)){
    state.elapsed = audioEl.currentTime;
    state.duration = audioEl.duration;
    if(!audioEl.paused && !audioEl.ended) state.playing = true;
  }
  if(state.mode!=='browser' && state.playing) state.elapsed=Math.min(state.duration,state.elapsed+dt);

  /* ---- real audio feature extraction ---- */
  let bass,treble,energy;
  if(analyser && freqData && state.playing){
    if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    analyser.getByteFrequencyData(freqData);
    const binCount=freqData.length;
    const binHz=(audioCtx.sampleRate/2)/binCount;
    const bEnd =Math.floor(250/binHz);
    const tStart=Math.floor(3500/binHz), tEnd=Math.floor(12000/binHz);
    let bSum=0,bN=0, tSum=0,tN=0, eSum=0;
    for(let i=1;i<binCount;i++){
      const v=freqData[i]/255;
      if(i<bEnd){bSum+=v;bN++;}
      if(i>=tStart&&i<tEnd){tSum+=v;tN++;}
      eSum+=v*v;
    }
    const rawBass  =bN>0?Math.min(1,(bSum/bN)*2.8):0;
    const rawTreble=tN>0?Math.min(1,(tSum/tN)*4.2):0;
    const rawEnergy=Math.min(1,Math.sqrt(eSum/binCount)*4.8);
    /* asymmetric envelope — moderate attack so spikes don't overdrive shaders */
    sBass  +=( rawBass   - sBass  )*(rawBass   > sBass  ? 0.45 : 0.18);
    sTreble+=( rawTreble - sTreble)*(rawTreble > sTreble? 0.45 : 0.18);
    sEnergy+=( rawEnergy - sEnergy)*(rawEnergy > sEnergy? 0.45 : 0.20);
    /* gentle compression: pow(x, 1.3) tames mid-range without flattening peaks */
    bass  = Math.pow(sBass,   1.3);
    treble= Math.pow(sTreble, 1.3);
    energy= Math.pow(sEnergy, 1.3);
    /* onset / beat detection: bass spike above running average */
    beatHistory[beatIdx%beatHistory.length]=rawBass;
    beatIdx++;
    let avg=0; for(let i=0;i<beatHistory.length;i++) avg+=beatHistory[i]; avg/=beatHistory.length;
    if(rawBass>avg*1.4 && rawBass>0.08 && t-lastBeatT>0.18){ pulse=1.0; lastBeatT=t; }
  } else {
    /* no analyser — BPM-locked metronome fallback; decay smooth envelopes */
    sBass*=0.92; sTreble*=0.92; sEnergy*=0.92;
    if(state.playing){
      const bi=60/state.bpm;
      if(t>=nextBeat){ pulse=1.0; nextBeat=t+bi; }
    }
    bass  =state.playing?0.15:0.04;
    treble=state.playing?0.10:0.03;
    energy=state.playing?0.13:0.04;
  }
  pulse=Math.max(0,pulse-dt*3.0);

  const heart=document.getElementById('bpmHeart');
  heart.style.transform=`scale(${1+pulse*0.6})`; heart.style.opacity=String(0.6+0.4*pulse);

  document.getElementById('elapsed').textContent=fmt(state.elapsed);
  document.getElementById('duration').textContent=fmt(state.duration);
  const pct=state.duration>0?state.elapsed/state.duration:0;
  document.getElementById('scrubFill').style.width=(pct*100).toFixed(2)+'%';
  document.getElementById('scrubHead').style.left=(pct*100).toFixed(2)+'%';

  updateLyricsOverlay(state.elapsed*1000);

  const env={t,dt,pulse,bass,treble,energy};
  updateEqLevels(t,env);

  /* smooth hue transition toward album-art target */
  const hueDiff = state.targetHue - state.hue;
  if(Math.abs(hueDiff) > 0.05){
    state.hue += hueDiff * Math.min(1, dt * 1.5);
    document.getElementById('kHue').textContent = (state.hue>=0?'+':'')+state.hue.toFixed(0)+'°';
    document.getElementById('tHue').style.width = (100*(state.hue+180)/360).toFixed(1)+'%';
  }

  const pOv=eqOverlayPalettes[eqOpts.palette]||eqOverlayPalettes.lime;
  const pSd=eqPalettes[eqOpts.palette]||eqPalettes.lime;
  drawEq(document.getElementById('eqCanvas'),eqLevels,eqPeaks,{...pOv,segments:(eqOpts.style==='bars'),style:eqOpts.style});
  drawEq(document.getElementById('eqSideCanvas'),eqLevels,eqPeaks,{...pSd,segments:false,style:eqOpts.style});

  const mini=document.getElementById('miniEq').children;
  const N=eqLevels.length;
  const samples=[eqLevels[Math.floor(N*0.06)],eqLevels[Math.floor(N*0.28)],eqLevels[Math.floor(N*0.55)],eqLevels[Math.floor(N*0.84)]];
  const miniColor=pSd.solid;
  for(let i=0;i<4;i++){
    mini[i].style.background=miniColor;
    mini[i].style.transform=`scaleY(${Math.max(0.08,samples[i])})`;
    mini[i].style.opacity=String(0.55+0.45*samples[i]);
  }
  let peak=0; for(let i=0;i<N;i++) peak=Math.max(peak,eqPeaks[i]);
  const db=peak>0.001?(20*Math.log10(peak)).toFixed(1):'−∞';
  document.getElementById('eqPeak').textContent=db;

  mainR.draw(env);
  previewRenderers.forEach((r,i)=>{
    r.localMouse.x=0.5+0.15*Math.sin(t*0.4+i);
    r.localMouse.y=0.5+0.15*Math.cos(t*0.3+i*1.3);
    r.draw({...env,t:t+i*1.7});
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
setActiveShader(0);

/* ====== MCP Server Panel (real API) ====== */
const MCP_TOOLS = [
  {n:'music_health_check',   d:'Ping the music backend and return version info.',        a:0},
  {n:'music_search',         d:'MusicBrainz-first autocomplete with YouTube fallback.',  a:1},
  {n:'music_get_stream_url', d:'Resolve a playable audio URL for a track id.',           a:1},
  {n:'music_get_metadata',   d:'Return release year, album art source, durations.',      a:1},
  {n:'music_get_lyrics',     d:'Fetch LRCLIB synced lyrics for the current track.',      a:1},
  {n:'music_play',           d:'Start terminal playback via ffplay.',                    a:1},
  {n:'music_stop',           d:'Halt the active ffplay stream.',                         a:0},
  {n:'music_resume',         d:'Resume from the last persisted position.',               a:0},
];

const mcp = {
  state:'stopped',
  pid:null,
  startedAt:null,
  calloutDismissed:false,
  log:[],
  width:'360',
};

function fmtUptime(ms){
  if(!ms||ms<0) return '—';
  const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60);
  if(h>=1) return h+'h '+(m%60)+'m';
  if(m>=1) return m+'m '+(s%60)+'s';
  return s+'s';
}
function nowHMS(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}

function fmtArity(n){ return n===0 ? 'no params' : (n===1 ? '1 param' : n+' params'); }

function addMcpLog(name, ok=true){
  mcp.log.unshift({ts:nowHMS(), n:name, ok});
  mcp.log = mcp.log.slice(0, 5);
}

function renderMcpDrawer(target, st, opts={}){
  const {state:s, pid, startedAt} = st;
  const labels={stopped:'Stopped',starting:'Starting…',running:'Running'};
  const uptime=s==='running'?fmtUptime(Date.now()-startedAt):null;
  const compact=!!opts.compact;
  const toolsHtml=s==='running'
    ?MCP_TOOLS.map(t=>`<div class="mcpTool"><div class="name">${t.n}</div><div class="arity ${t.a===0?'zero':'has'}">${fmtArity(t.a)}</div>${compact?'':`<div class="desc">${t.d}</div>`}</div>`).join('')
    :`<div class="mcpToolsEmpty">${s==='starting'?'— initializing —':'— tools register on start —'}</div>`;
  const logHtml=st.log.length
    ?st.log.map(l=>`<div class="mcpLogRow"><span class="ts">${l.ts}</span><span class="nm">${l.n}</span><span class="bd ${l.ok?'ok':'err'}">${l.ok?'ok':'err'}</span></div>`).join('')
    :`<div style="font-family:var(--mono);font-size:10.5px;color:var(--ink-faint);text-align:center;padding:10px">— no calls yet —</div>`;
  const calloutHtml=(st.calloutDismissed||compact)?'':`
    <div class="mcpSection"><div class="mcpCallout">
      <span class="ic">!</span>
      <span class="tx"><b>Restart Claude Code</b> after toggling to reload the tool list.</span>
      <button data-act="dismiss-callout" aria-label="Dismiss">×</button>
    </div></div>`;
  target.innerHTML=`
    <div class="mcpHead">
      <div><div class="crumb">dev-music-service · integrations</div><h2>MCP Server</h2></div>
      <button class="mcpClose" data-act="close" aria-label="Close">×</button>
    </div>
    <div class="mcpBody">
      <div class="mcpSection">
        <div class="mcpStatus ${s}">
          <div class="big"><span class="mcpDot ${s}"></span></div>
          <div>
            <div class="lbl">${labels[s]}</div>
            <div class="meta">
              ${pid?`<span><b>pid</b> ${pid}</span><span class="sep">·</span>`:''}
              ${uptime?`<span><b>up</b> ${uptime}</span>`:(s==='starting'?'<span>spawning…</span>':'<span>not running</span>')}
            </div>
          </div>
        </div>
        <div class="mcpCtrls">
          ${s==='running'
            ?`<button class="mcpBtn stop" data-act="stop">Stop</button><button class="mcpBtn" data-act="restart">Restart</button>`
            :`<button class="mcpBtn start" data-act="start" ${s==='starting'?'disabled':''}>${s==='starting'?'Starting…':'Start server'}</button><button class="mcpBtn" data-act="restart" disabled>Restart</button>`}
        </div>
      </div>
      <div class="mcpSection">
        <div class="h"><span>Connection</span><span>stdio</span></div>
        <dl class="mcpKv">
          <dt>transport</dt><dd>stdio <span class="tag">local</span></dd>
          <dt>config</dt><dd>.mcp.json</dd>
          <dt>entry</dt><dd>mcp-server/dist/index.js</dd>
        </dl>
      </div>
      <div class="mcpSection">
        <div class="h"><span>Tools</span><span>${s==='running'?MCP_TOOLS.length+' registered':'—'}</span></div>
        <div class="mcpTools">${toolsHtml}</div>
      </div>
      <div class="mcpSection">
        <div class="h"><span>Activity</span><span>last 5</span></div>
        <div class="mcpLog">${logHtml}</div>
      </div>
      <div class="mcpSection">
        <div class="h"><span>Tweaks</span><span>drawer</span></div>
        <div class="mcpTweakRow">
          <span>Accent</span>
          <span class="mcpTweakGroup">
            <button class="mcpSwatch" data-mcp-accent="#d7ff3a" style="background:#d7ff3a" aria-label="Lime accent"></button>
            <button class="mcpSwatch" data-mcp-accent="#7ad9ff" style="background:#7ad9ff" aria-label="Ice accent"></button>
            <button class="mcpSwatch" data-mcp-accent="#ff6a3d" style="background:#ff6a3d" aria-label="Magma accent"></button>
            <button class="mcpSwatch" data-mcp-accent="#c79bff" style="background:#c79bff" aria-label="Violet accent"></button>
          </span>
        </div>
        <div class="mcpTweakRow" style="margin-top:10px">
          <span>Width</span>
          <span class="mcpTweakGroup">
            ${['320','360','420'].map(w=>`<button class="mcpWidthBtn ${st.width===w?'on':''}" data-mcp-width="${w}">${w}</button>`).join('')}
          </span>
        </div>
      </div>
      ${calloutHtml}
    </div>`;
}

function syncMcpPill(){
  const dot=document.getElementById('mcpPillDot');
  const stat=document.getElementById('mcpPillStat');
  dot.className='mcpDot '+mcp.state;
  stat.textContent=mcp.state==='running'?`running · ${fmtUptime(Date.now()-mcp.startedAt)}`:(mcp.state==='starting'?'starting…':'stopped');
}

async function mcpStart(){
  if(mcp.state!=='stopped') return;
  mcp.state='starting'; syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
  addMcpLog('mcp_start', true);
  try {
    const r=await fetch('/api/mcp/start',{method:'POST'});
    const d=await r.json();
    if(d.running){ mcp.state='running'; mcp.pid=d.pid; mcp.startedAt=Date.now(); addMcpLog('music_health_check', true); }
    else { mcp.state='stopped'; addMcpLog('mcp_start', false); }
  } catch(e){ mcp.state='stopped'; addMcpLog('mcp_start', false); }
  syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
}

async function mcpStop(){
  if(mcp.state!=='running') return;
  try { await fetch('/api/mcp/stop',{method:'POST'}); addMcpLog('mcp_stop', true); } catch(e){ addMcpLog('mcp_stop', false); }
  mcp.state='stopped'; mcp.pid=null; mcp.startedAt=null;
  syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
}

async function mcpRestart(){ await mcpStop(); setTimeout(()=>mcpStart(),200); }

async function pollMcpStatus(){
  try {
    const r=await fetch('/api/mcp/status');
    const d=await r.json();
    if(d.running&&mcp.state!=='running'){
      mcp.state='running'; mcp.pid=d.pid; if(!mcp.startedAt) mcp.startedAt=Date.now();
      addMcpLog('mcp_status', true);
      syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
    } else if(!d.running&&mcp.state==='running'){
      mcp.state='stopped'; mcp.pid=null; mcp.startedAt=null;
      addMcpLog('mcp_status', true);
      syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
    }
  } catch(e){ addMcpLog('mcp_status', false); }
}

const mcpDrawerEl=document.getElementById('mcpDrawer');
const mcpScrim=document.getElementById('mcpScrim');
document.documentElement.style.setProperty('--mcp-w', mcp.width+'px');
renderMcpDrawer(mcpDrawerEl, mcp);
syncMcpPill();
pollMcpStatus();
setInterval(pollMcpStatus, 15000);
setInterval(()=>{ if(mcp.state==='running') syncMcpPill(); }, 1000);

document.getElementById('mcpOpen').addEventListener('click', ()=>{
  mcpDrawerEl.classList.add('open'); mcpScrim.classList.add('open');
});
mcpScrim.addEventListener('click', ()=>{ mcpDrawerEl.classList.remove('open'); mcpScrim.classList.remove('open'); });
mcpDrawerEl.addEventListener('click', e=>{
  const accent=e.target.closest('[data-mcp-accent]');
  if(accent){
    document.documentElement.style.setProperty('--accent', accent.dataset.mcpAccent);
    renderMcpDrawer(mcpDrawerEl,mcp);
    return;
  }
  const width=e.target.closest('[data-mcp-width]');
  if(width){
    mcp.width=width.dataset.mcpWidth;
    document.documentElement.style.setProperty('--mcp-w', mcp.width+'px');
    renderMcpDrawer(mcpDrawerEl,mcp);
    return;
  }
  const b=e.target.closest('[data-act]'); if(!b) return;
  const act=b.dataset.act;
  if(act==='close'){ mcpDrawerEl.classList.remove('open'); mcpScrim.classList.remove('open'); }
  else if(act==='start') mcpStart();
  else if(act==='stop')  mcpStop();
  else if(act==='restart') mcpRestart();
  else if(act==='dismiss-callout'){ mcp.calloutDismissed=true; renderMcpDrawer(mcpDrawerEl,mcp); }
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'&&mcpDrawerEl.classList.contains('open')){
    mcpDrawerEl.classList.remove('open'); mcpScrim.classList.remove('open');
  }
});

/* ====== Focus panel helpers ====== */
function escapeHtml(s){
  const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML;
}
function escapeAttr(s){
  return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function focusArtMarkup(track, size){
  size=size||40;
  if(track.thumbnail){
    return `<div class="focus-art" style="width:${size}px;height:${size}px;"><img src="${escapeAttr(track.thumbnail)}" alt="" loading="lazy"><div class="ph">♪</div></div>`;
  }
  return `<div class="focus-art" style="width:${size}px;height:${size}px;"><div class="ph">♪</div></div>`;
}
function focusSkeleton(){
  return '<div class="focus-skeleton">Loading…</div>';
}

/* ====== Focus panel state ====== */
let focusPanelOpen = false;
let currentTimeRange = 'medium_term';
let currentFocusData = null;

function toggleFocusPanel() {
  focusPanelOpen = !focusPanelOpen;
  document.getElementById('focusPanel').classList.toggle('visible', focusPanelOpen);
  if (focusPanelOpen) {
    loadProfile();
    checkFocusSpotifyStatus();
  }
}

function syncEnergyLabel() {
  const lo = parseFloat(document.getElementById('energyMin').value).toFixed(2);
  const hi = parseFloat(document.getElementById('energyMax').value).toFixed(2);
  document.getElementById('energyVal').textContent = `${lo} – ${hi}`;
}

async function loadProfile() {
  try {
    const r = await fetch('/api/focus/profile');
    if (!r.ok) return;
    const p = await r.json();
    document.getElementById('bpmMin').value = p.bpm_min;
    document.getElementById('bpmMax').value = p.bpm_max;
    document.getElementById('instrMin').value = p.instrumentalness_min;
    document.getElementById('instrVal').textContent = parseFloat(p.instrumentalness_min).toFixed(2);
    document.getElementById('energyMin').value = p.energy_min;
    document.getElementById('energyMax').value = p.energy_max;
    syncEnergyLabel();
  } catch (_) {}
}

async function saveProfile() {
  const profile = {
    bpm_min: parseInt(document.getElementById('bpmMin').value),
    bpm_max: parseInt(document.getElementById('bpmMax').value),
    instrumentalness_min: parseFloat(document.getElementById('instrMin').value),
    energy_min: parseFloat(document.getElementById('energyMin').value),
    energy_max: parseFloat(document.getElementById('energyMax').value),
    valence_min: 0.0,
    valence_max: 1.0,
  };
  try {
    const r = await fetch('/api/focus/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (r.ok && currentFocusData) {
      analyseTopTracks();
    }
  } catch (_) {}
}

async function resetProfile() {
  await fetch('/api/focus/profile/reset', { method: 'POST' });
  await loadProfile();
  if (currentFocusData) analyseTopTracks();
}

async function checkFocusSpotifyStatus() {
  try {
    const r = await fetch('/api/import/spotify/status');
    if (!r.ok) return;
    const s = await r.json();
    const btn = document.getElementById('analyseTopBtn');
    const status = document.getElementById('focusSpotifyStatus');
    if (s.connected) {
      btn.disabled = false;
      status.textContent = 'Spotify connected';
    } else {
      btn.disabled = true;
      status.textContent = s.configured ? 'Connect Spotify to begin' : 'Spotify not configured';
    }
  } catch(_){}
}

async function analyseTopTracks() {
  document.getElementById('focusEmpty').style.display = 'none';
  document.getElementById('focusTracks').innerHTML = focusSkeleton();
  document.getElementById('focusStats').style.display = 'none';
  document.getElementById('timeTabs').style.display = 'none';
  document.getElementById('focusTrackHead').style.display = 'none';
  document.getElementById('rejectedSection').style.display = 'none';
  document.getElementById('bpmInsight').classList.remove('visible');

  try {
    const r = await fetch(`/api/focus/top-tracks?time_range=${currentTimeRange}`);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      document.getElementById('focusTracks').innerHTML = '';
      document.getElementById('focusEmpty').style.display = '';
      document.getElementById('focusEmpty').textContent = e.detail || 'Failed to load top tracks.';
      return;
    }
    currentFocusData = await r.json();
    renderFocusData(currentFocusData);
  } catch (err) {
    document.getElementById('focusTracks').innerHTML = '';
    document.getElementById('focusEmpty').style.display = '';
    document.getElementById('focusEmpty').textContent = err.message || 'Request failed.';
  }
}

function setTimeRange(range, btn) {
  currentTimeRange = range;
  document.querySelectorAll('.time-tab').forEach(t => t.classList.toggle('active', t === btn));
  analyseTopTracks();
}

function renderFocusData(data) {
  document.getElementById('focusStats').style.display = '';
  const covered = data.features_covered ?? 0;
  const total = data.features_total ?? data.total_top_tracks ?? 0;
  const noData = data.no_data_tracks || [];
  document.getElementById('statFocus').textContent = data.focus_tracks_count;
  document.getElementById('statTotal').textContent = `${covered} / ${total}`;
  document.getElementById('statAvgBpm').textContent = data.bpm_insight ? data.bpm_insight.mean : '—';
  const topScore = data.focus_tracks[0] ? data.focus_tracks[0].focus_score : 0;
  document.getElementById('statTopScore').textContent = topScore ? topScore.toFixed(0) : '—';

  if (data.bpm_insight) {
    const ins = document.getElementById('bpmInsight');
    ins.innerHTML = `<b>Your listening BPM: avg ${data.bpm_insight.mean}, range ${data.bpm_insight.min}–${data.bpm_insight.max}.</b> ${escapeHtml(data.bpm_insight.suggestion)}`;
    ins.classList.add('visible');
  }

  document.getElementById('timeTabs').style.display = '';
  const container = document.getElementById('focusTracks');
  container.innerHTML = '';

  // Coverage banner — features come from ReccoBeats, which has no data for some tracks.
  const srcKey = (data.source || 'reccobeats').toLowerCase();
  const srcLabel = { reccobeats: 'ReccoBeats', essentia: 'Essentia' }[srcKey] || srcKey;
  const coverage = document.createElement('div');
  coverage.className = 'focus-coverage';
  coverage.innerHTML = `Audio features for <b>${covered}</b> of <b>${total}</b> tracks · `
    + `<span class="source-tag ${srcKey}">${escapeHtml(srcLabel)}</span>`
    + (noData.length ? ` · <span class="nodata-count">${noData.length} without data</span>` : '');
  container.appendChild(coverage);

  document.getElementById('focusTrackHead').style.display = data.focus_tracks.length ? '' : 'none';
  if (!data.focus_tracks.length) {
    const empty = document.createElement('div');
    empty.className = 'focus-skeleton';
    empty.textContent = covered
      ? 'No tracks with audio data matched your focus profile. Try widening the BPM range or lowering the instrumentalness threshold.'
      : 'ReccoBeats had no audio data for these tracks. Try a different time range.';
    container.appendChild(empty);
  } else {
    data.focus_tracks.forEach(track => {
      const row = document.createElement('div');
      row.className = 'focus-track';
      const scoreWidth = Math.round(track.focus_score);
      row.innerHTML = `
        ${focusArtMarkup({ title: track.title, artist: track.artist, thumbnail: track.thumbnail }, 36)}
        <div><div class="t">${escapeHtml(track.title)}</div><div class="a">${escapeHtml(track.artist)}${track.album ? ' · ' + escapeHtml(track.album) : ''}</div></div>
        <div class="bpm-pill">${track.tempo}</div>
        <div class="feat-val">${(track.instrumentalness * 100).toFixed(0)}%</div>
        <div class="feat-val">${(track.energy * 100).toFixed(0)}%</div>
        <div class="feat-val">
          <div style="margin-bottom:3px;">${track.focus_score.toFixed(0)}</div>
          <div class="focus-bar-wrap"><div class="focus-bar-fill" style="width:${scoreWidth}%"></div></div>
        </div>
        <button class="btn" style="font-size:10px;padding:4px 8px;" onclick="playFocusTrack(event, ${JSON.stringify(escapeAttr(track.title))}, ${JSON.stringify(escapeAttr(track.artist))})">Play</button>
      `;
      container.appendChild(row);
    });
  }

  // Tracks ReccoBeats has no data for — surfaced honestly, never as 0-score rows.
  if (noData.length) {
    const head = document.createElement('div');
    head.className = 'nodata-head';
    head.textContent = `No audio data (${data.no_data_count ?? noData.length})`;
    container.appendChild(head);
    noData.forEach(track => {
      const row = document.createElement('div');
      row.className = 'focus-track nodata';
      row.innerHTML = `
        ${focusArtMarkup({ title: track.title, artist: track.artist, thumbnail: track.thumbnail }, 36)}
        <div><div class="t">${escapeHtml(track.title)}</div><div class="a">${escapeHtml(track.artist)}${track.album ? ' · ' + escapeHtml(track.album) : ''}</div></div>
        <div class="bpm-pill" style="color:var(--ink-faint);">—</div>
        <div class="feat-val">—</div>
        <div class="feat-val">—</div>
        <div class="feat-val"><span class="nodata-chip">no audio data</span></div>
        <button class="btn" style="font-size:10px;padding:4px 8px;" onclick="playFocusTrack(event, ${JSON.stringify(escapeAttr(track.title))}, ${JSON.stringify(escapeAttr(track.artist))})">Play</button>
      `;
      container.appendChild(row);
    });
  }

  if (data.rejected && data.rejected.length) {
    document.getElementById('rejectedSection').style.display = '';
    document.getElementById('rejectedLabel').textContent = `Show ${data.rejected_tracks} filtered-out tracks`;
    const rejList = document.getElementById('rejectedList');
    rejList.innerHTML = '';
    data.rejected.forEach(track => {
      const row = document.createElement('div');
      row.className = 'rejected-track';
      const reason = rejectReason(track);
      row.innerHTML = `
        ${focusArtMarkup({ title: track.title, artist: track.artist, thumbnail: track.thumbnail }, 32)}
        <div><div class="t">${escapeHtml(track.title)}</div><div class="a">${escapeHtml(track.artist)}</div></div>
        <div class="bpm-pill" style="color:var(--ink-faint);">${track.tempo}</div>
        <div class="reject-reason">${reason}</div>
      `;
      rejList.appendChild(row);
    });
  }
}

function rejectReason(track) {
  const p = currentFocusData?.profile;
  if (!p) return 'filtered';
  if (track.tempo < p.bpm_min) return `${track.tempo} bpm — too slow`;
  if (track.tempo > p.bpm_max) return `${track.tempo} bpm — too fast`;
  if (track.instrumentalness < p.instrumentalness_min) return `${(track.instrumentalness*100).toFixed(0)}% instr.`;
  return 'filtered';
}

function toggleRejected() {
  const list = document.getElementById('rejectedList');
  const arrow = document.getElementById('rejectedArrow');
  const showing = list.classList.toggle('visible');
  arrow.textContent = showing ? '▾' : '▸';
}

async function playFocusTrack(evt, title, artist) {
  evt.stopPropagation();
  const query = `${artist} - ${title}`;
  document.getElementById('searchInput').value = query;
  await loadTrack({title, artist});
}
