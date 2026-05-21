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
function makeProg(gl, fragSrc){
  function compile(type, src){
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('shader', gl.getShaderInfoLog(s));
    return s;
  }
  const v = compile(gl.VERTEX_SHADER, VERT);
  const f = compile(gl.FRAGMENT_SHADER, COMMON + '\n' + fragSrc);
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
    this.prog = makeProg(gl, FRAGS[fragId]);
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
    this.fragId = fragId;
    const gl = this.gl;
    this.prog = makeProg(gl, FRAGS[fragId]);
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
  if(!isNaN(n) && n>=1 && n<=5) setActiveShader(n-1);
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
function setActiveShader(i){
  state.activeIdx = i;
  document.querySelectorAll('.wp').forEach((el,j)=>el.classList.toggle('active', j===i));
  document.getElementById('wpIx').textContent = (i+1)+' / 5';
  state.bpm = WALLS[i].bpm;
  const preset = BPM_PRESETS.find(p=>p.id===WALLS[i].preset);
  [...bpmPresets.children].forEach(c=>c.classList.toggle('on', c.dataset.id===WALLS[i].preset));
  document.getElementById('bpmDescIx').textContent = preset.blurb;
  document.getElementById('bpmBand').textContent = preset.label.toUpperCase();
  document.getElementById('bpmNum').textContent = state.bpm;
  mainR.setFrag(WALLS[i].id);
}

/* ====== Real autocomplete ====== */
const searchInput = document.getElementById('searchInput');
const suggBox = document.getElementById('suggestions');
let acTimer = null;

async function openSuggestions(query){
  if(!query || !query.trim()){ closeSuggestions(); return; }
  clearTimeout(acTimer);
  acTimer = setTimeout(async ()=>{
    try {
      const t0 = performance.now();
      const r = await fetch(`/api/autocomplete?query=${encodeURIComponent(query.trim())}&limit=6`);
      const latMs = Math.round(performance.now()-t0);
      document.getElementById('latAc').textContent = latMs+'ms';
      if(!r.ok) return;
      const pool = await r.json();
      suggBox.innerHTML = '';
      pool.forEach((s,i)=>{
        const conf = Math.min(99,Math.max(20,s.confidence||50));
        const tier = conf>=85?'high':conf>=60?'mid':'low';
        const srcShort = s.artwork_source==='musicbrainz'?'MB':s.artwork_source==='youtube'?'YT':'✷';
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
    } catch(e){ console.warn('autocomplete', e); }
  }, 120);
}
function closeSuggestions(){ suggBox.classList.remove('open'); }
searchInput.addEventListener('focus', ()=>openSuggestions(searchInput.value));
searchInput.addEventListener('input', ()=>openSuggestions(searchInput.value));
searchInput.addEventListener('blur',  ()=>setTimeout(closeSuggestions, 180));

/* ====== Track loading ====== */
async function loadTrack(s){
  document.getElementById('trackTitle').textContent = s.title||'…';
  document.getElementById('trackTitleChrome').textContent = s.title||'…';
  document.getElementById('artistName').textContent = s.artist||'—';
  document.getElementById('albumName').textContent = s.album||'—';
  document.getElementById('releaseYear').textContent = s.release_year||'—';
  artImg.style.display='none'; artImg.src=''; artPlaceholder.style.display='flex';
  setHeroArt(null);

  const query = [s.title, s.artist].filter(Boolean).join(' ');
  try {
    const t0 = performance.now();
    const r = await fetch(`/api/search?query=${encodeURIComponent(query)}&limit=1`);
    document.getElementById('latSr').textContent = Math.round(performance.now()-t0)+'ms';
    if(!r.ok) return;
    const results = await r.json();
    if(!results||!results.length) return;
    const result = results[0];

    state.currentWebpageUrl = result.webpage_url;
    state.duration = result.duration||s.duration||0;
    state.elapsed = 0;

    document.getElementById('trackTitle').textContent = result.title||s.title;
    document.getElementById('trackTitleChrome').textContent = result.title||s.title;
    document.getElementById('artistName').textContent = result.artist||s.artist||'—';
    document.getElementById('albumName').textContent = result.album||s.album||'—';
    document.getElementById('releaseYear').textContent = result.release_year||s.release_year||'—';
    const artSrc = result.artwork_source||s.artwork_source||'';
    document.getElementById('artSrc').textContent =
      artSrc==='musicbrainz'?'MB · cover':artSrc==='youtube'?'YT · thumb':'✷ · gen';

    const thumb = result.thumbnail||result.artwork_url||'';
    if(thumb){ artImg.src=thumb; artImg.style.display='block'; artPlaceholder.style.display='none'; }
    else { artImg.style.display='none'; artImg.src=''; artPlaceholder.style.display='flex'; }
    setHeroArt(thumb||null);

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

const mcp = { state:'stopped', pid:null, startedAt:null, calloutDismissed:false };

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

function renderMcpDrawer(target, st){
  const {state:s, pid, startedAt} = st;
  const labels={stopped:'Stopped',starting:'Starting…',running:'Running'};
  const uptime=s==='running'?fmtUptime(Date.now()-startedAt):null;
  const toolsHtml=s==='running'
    ?MCP_TOOLS.map(t=>`<div class="mcpTool"><div class="name">${t.n}</div><div class="arity ${t.a===0?'':'has'}">${t.a===0?'no params':t.a+' param'+(t.a>1?'s':'')}</div><div class="desc">${t.d}</div></div>`).join('')
    :`<div class="mcpToolsEmpty">${s==='starting'?'— initializing —':'— tools register on start —'}</div>`;
  const calloutHtml=st.calloutDismissed?'':`
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
  try {
    const r=await fetch('/api/mcp/start',{method:'POST'});
    const d=await r.json();
    if(d.running){ mcp.state='running'; mcp.pid=d.pid; mcp.startedAt=Date.now(); }
    else { mcp.state='stopped'; }
  } catch(e){ mcp.state='stopped'; }
  syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
}

async function mcpStop(){
  if(mcp.state!=='running') return;
  try { await fetch('/api/mcp/stop',{method:'POST'}); } catch(e){}
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
      syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
    } else if(!d.running&&mcp.state==='running'){
      mcp.state='stopped'; mcp.pid=null; mcp.startedAt=null;
      syncMcpPill(); renderMcpDrawer(mcpDrawerEl, mcp);
    }
  } catch(e){}
}

const mcpDrawerEl=document.getElementById('mcpDrawer');
const mcpScrim=document.getElementById('mcpScrim');
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
