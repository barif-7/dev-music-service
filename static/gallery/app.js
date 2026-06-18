/* Phase · Field — minimal immersive gallery
   State: 'immersive' (one wallpaper fills screen) | 'grid' (overview switcher)
   Heroes: two stacked fullscreen canvases for crossfade. Grid tiles are lazy. */

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r=document) => r.querySelector(s);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

const state = {
  index: 0,
  mode: 'immersive',
  gridReady: false,
  crossfading: false,
  transitioning: false,
  infoOpen: false,
  idle: false,
  searchOpen: false,
};

/* ---- heroes (two layers for crossfade) ---- */
const heroLayer = $('#heroLayer');
const heroEls = [$('#heroA'), $('#heroB')];
const heroes = heroEls.map(c => new Tile(c, ALTS[0].id, ALTS[0].bpm, 1.75));
let front = 0; // index into heroes that is currently shown

/* ---- chrome refs ---- */
const stage = $('#stage');
const capNum = $('#capNum'), capName = $('#capName');
const dotsWrap = $('#dots');
const infoEl = $('#info');
const gridEl = $('#grid');
const gridScrim = $('#gridScrim');

/* ---- build dot rail ---- */
ALTS.forEach((w,i)=>{
  const d = document.createElement('button');
  d.className = 'dot';
  d.setAttribute('aria-label', w.name);
  d.addEventListener('click', ()=> goTo(i));
  dotsWrap.appendChild(d);
});
const dots = [...dotsWrap.children];

/* ---- caption + dots reflect current ---- */
function reflect(){
  const w = ALTS[state.index];
  capNum.textContent = w.n;
  capName.textContent = w.name;
  dots.forEach((d,i)=> d.classList.toggle('on', i===state.index));
  // the caption name stays the wallpaper; the info panel shows the real now-playing
  // track when one is loaded, otherwise the wallpaper's demo pairing.
  if(nowPlaying) renderNowPlaying(nowPlaying); else renderInfo(w);
}

/* ---- info (track + lyric) as floating text, no modal ---- */
const SRC = { mb:'MusicBrainz', yt:'YouTube', pl:'playlist' };
const escHtml = s => (s==null?'':String(s)).replace(/[&<>]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
function renderInfo(w){
  const t = w.track;
  infoEl.innerHTML =
    `<div class="i-track">${t.title}</div>`+
    `<div class="i-meta">${t.artist} · ${t.album} · ${t.year}</div>`+
    `<div class="i-lyric">“${w.lyric}”</div>`+
    `<div class="i-src">paired from ${w.pairFrom} · ${w.preset} · ${w.bpm} BPM · ${SRC[t.src]||t.src}</div>`;
}

/* ---- now-playing: real track resolved by service.js / spotify.js ---- */
let nowPlaying = null;
function renderNowPlaying(track, status){
  nowPlaying = track;
  const meta = [track.artist, track.album, track.release_year].filter(Boolean).map(escHtml).join(' · ');
  infoEl.innerHTML =
    `<div class="i-track">${escHtml(track.title || 'Untitled')}</div>`+
    `<div class="i-meta">${meta || '—'}</div>`+
    `<div class="i-src">${escHtml(status || 'streaming')} · reacting live</div>`;
  infoEl.classList.add('show'); state.infoOpen = true;
  paintNowbar(track, status);
  wake();
}

/* ---- now-playing player bar ---- */
const PLAY_ICON  = '<path d="M8 5v14l11-7z"/>';
const PAUSE_ICON = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
function paintNowbar(track, status){
  const bar = $('#nowbar'); if(!bar) return;
  bar.dataset.empty = '0';
  $('#nbTitle').textContent = track.title || 'Untitled';
  $('#nbSub').textContent = [track.artist, track.album].filter(Boolean).join(' · ') || status || '';
  const art = $('#nbArt'), img = $('#nbImg');
  if(track.thumbnail){ img.src = track.thumbnail; art.classList.add('has'); }
  else { art.classList.remove('has'); img.removeAttribute('src'); }
}
function fmtTime(s){ s = Math.max(0, s|0); return `${(s/60)|0}:${String(s%60).padStart(2,'0')}`; }
function updateNowbar(){
  const icon = $('#nbPlayIcon');
  if(icon) icon.innerHTML = (streamEl.src && !streamEl.paused && !streamEl.ended) ? PAUSE_ICON : PLAY_ICON;
  const d = streamEl.duration || 0, t = streamEl.currentTime || 0;
  const fill = $('#nbFill'); if(fill) fill.style.width = d ? (t/d*100).toFixed(1)+'%' : '0%';
  const time = $('#nbTime'); if(time) time.textContent = fmtTime(t);
}
$('#nbPlay').addEventListener('click', ()=>{
  if(!streamEl.src) return;
  if(streamEl.paused) streamEl.play().catch(()=>{}); else streamEl.pause();
});
$('#nbPrev').addEventListener('click', ()=> goTo(state.index-1));
$('#nbNext').addEventListener('click', ()=> goTo(state.index+1));
$('#nbScrub').addEventListener('click', (e)=>{
  if(!streamEl.duration) return;
  const r = $('#nbScrub').getBoundingClientRect();
  streamEl.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left)/r.width)) * streamEl.duration;
});

/* ---- ambient FFT spectrum strip ---- */
const eqCanvas = $('#eqCanvas'), eqCtx = eqCanvas.getContext('2d');
const EQ_N = 72; const eqSmooth = new Float32Array(EQ_N);
function drawEq(){
  const live = AUDIO.active && AUDIO.freq;
  eqCanvas.classList.toggle('live', !!live);
  if(!live) return;
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const w = eqCanvas.clientWidth, h = eqCanvas.clientHeight;
  if(eqCanvas.width !== Math.round(w*dpr)){ eqCanvas.width = Math.round(w*dpr); eqCanvas.height = Math.round(h*dpr); }
  const ctx = eqCtx; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  ctx.fillStyle = 'rgba(138,255,196,0.5)';
  const freq = AUDIO.freq, bins = freq.length, bw = w/EQ_N;
  for(let i=0;i<EQ_N;i++){
    const idx = Math.min(bins-1, Math.floor(Math.pow(i/EQ_N, 1.9) * bins * 0.6) + 1);  // log-ish
    const v = (freq[idx]||0)/255;
    eqSmooth[i] += (v - eqSmooth[i]) * 0.35;
    const bh = eqSmooth[i] * h * 0.92;
    ctx.fillRect(i*bw + 1, h - bh, bw - 2, bh);
  }
}

/* ---- ambient centered lyric layer ---- */
const lyricStage = $('#lyricStage'), lyricLineEl = $('#lyricLine');
let lyricLast = null, lyricSwap = null;
function setCenterLyric(line){
  if(line === lyricLast) return;
  lyricLast = line;
  clearTimeout(lyricSwap);
  if(line){
    lyricStage.classList.add('show');
    if(lyricLineEl.textContent){           // cross-fade out → swap → in
      lyricLineEl.style.opacity = '0';
      lyricLineEl.style.transform = 'translateY(7px)';
      lyricSwap = setTimeout(()=>{
        lyricLineEl.textContent = line;
        lyricLineEl.style.opacity = '';    // back to CSS .16
        lyricLineEl.style.transform = '';
      }, 240);
    } else {                                // first line — just fade the layer in
      lyricLineEl.textContent = line;
      lyricLineEl.style.opacity = '';
      lyricLineEl.style.transform = '';
    }
  } else {
    lyricStage.classList.remove('show');    // gap / no lyric / not immersive
    lyricSwap = setTimeout(()=>{ if(lyricLast==='') lyricLineEl.textContent = ''; }, 1100);
  }
}
function toggleInfo(force){
  state.infoOpen = force===undefined ? !state.infoOpen : force;
  infoEl.classList.toggle('show', state.infoOpen);
  wake();
}

/* ---- crossfade switch within immersive ---- */
function goTo(i, opts={}){
  i = (i + ALTS.length) % ALTS.length;
  if(i === state.index && !opts.force) { if(state.mode==='grid') openImmersive(i); return; }
  const w = ALTS[i];
  state.index = i;

  if(state.mode === 'grid'){ openImmersive(i); return; }

  const incoming = heroes[1-front];
  const incomingEl = heroEls[1-front];
  incoming.load(w.id, w.bpm);
  incoming.draw();
  // place incoming on top, fade it in over current
  incomingEl.style.zIndex = 2;
  heroEls[front].style.zIndex = 1;
  state.crossfading = true;
  if(RM){
    incomingEl.style.transition = 'none';
    incomingEl.style.opacity = 1;
    heroEls[front].style.opacity = 0;
    front = 1-front; state.crossfading = false;
  } else {
    incomingEl.style.transition = 'opacity .9s cubic-bezier(.4,0,.15,1)';
    incomingEl.style.opacity = 0;
    void incomingEl.offsetWidth; // force reflow
    incomingEl.style.opacity = 1;
    setTimeout(()=>{
      heroEls[front].style.opacity = 0;
      front = 1-front;
      state.crossfading = false;
    }, 920);
  }
  reflect();
  wake();
}

/* ---- grid (overview switcher) ---- */
let gridTiles = [];
function buildGrid(){
  if(state.gridReady) return;
  ALTS.forEach((w,i)=>{
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.style.setProperty('--d', (i*42)+'ms');
    cell.innerHTML =
      `<canvas></canvas>`+
      `<div class="cell-tag"><span class="c-num">${w.n}</span><span class="c-name">${w.name}</span></div>`;
    cell.addEventListener('click', ()=> openImmersive(i, cell));
    gridEl.appendChild(cell);
    const t = new Tile(cell.querySelector('canvas'), w.id, w.bpm, 1.0);
    gridTiles.push({tile:t, cell});
  });
  state.gridReady = true;
}

function openGrid(){
  if(state.transitioning) return;
  buildGrid();
  state.mode = 'grid';
  setGridVisible(true);
  toggleInfo(false);
  document.body.classList.add('grid-mode');
  stage.classList.remove('idle');
  // mark the cell matching current
  gridTiles.forEach((g,i)=> g.cell.classList.toggle('current', i===state.index));
  // collapse animation: hero shrinks toward its cell
  const target = gridTiles[state.index].cell;
  flipHeroToCell(target, /*open=*/false);
}

function openImmersive(i, fromCell){
  if(state.transitioning) return;
  const w = ALTS[i];
  const cell = fromCell || (gridTiles[i] && gridTiles[i].cell);
  state.index = i;
  // load the front hero with target shader (so it matches the cell)
  heroes[front].load(w.id, w.bpm);
  heroes[front].draw();
  heroEls[front].style.opacity = 1;
  heroEls[1-front].style.opacity = 0;
  reflect();
  state.mode = 'immersive';
  flipHeroToCell(cell, /*open=*/true);
}

/* FLIP: animate the hero layer between a cell rect and fullscreen.
   open=true  -> from cell rect to full (expand, entering immersive)
   open=false -> from full to cell rect (collapse, entering grid) */
function flipHeroToCell(cell, open){
  const vw = window.innerWidth, vh = window.innerHeight;
  const r = cell ? cell.getBoundingClientRect() : {left:vw*0.5, top:vh*0.5, width:1, height:1};
  const sx = r.width / vw, sy = r.height / vh;
  const tx = r.left, ty = r.top;
  const cellT = `translate(${tx}px,${ty}px) scale(${sx},${sy})`;
  const fullT = 'translate(0px,0px) scale(1,1)';

  const dur = RM ? 0 : 720;
  state.transitioning = true;
  document.body.classList.add('flying');
  heroLayer.style.transformOrigin = 'top left';

  if(open){
    document.body.classList.remove('grid-mode'); // start fading grid out
    heroLayer.style.transition = 'none';
    heroLayer.style.transform = cellT;
    heroLayer.style.borderRadius = '14px';
    heroLayer.style.opacity = 1;
    if(cell) cell.classList.add('lift');
    void heroLayer.offsetWidth; // force reflow so the next change animates
    heroLayer.style.transition = RM ? 'none' :
      `transform ${dur}ms cubic-bezier(.55,0,.1,1), border-radius ${dur}ms ease`;
    heroLayer.style.transform = fullT;
    heroLayer.style.borderRadius = '0px';
    setTimeout(()=>{
      state.transitioning = false;
      document.body.classList.remove('flying');
      heroLayer.style.transition = 'none';
      gridTiles.forEach(g=> g.cell.classList.remove('lift'));
      setGridVisible(false); // grid fully gone once we've landed in immersive
      wake();
    }, dur+30);
  } else {
    // collapse: hero shrinks into cell, grid fades in beneath
    document.body.classList.add('grid-mode');
    if(cell) cell.classList.add('lift');
    heroLayer.style.transition = 'none';
    heroLayer.style.transform = fullT;
    heroLayer.style.borderRadius = '0px';
    heroLayer.style.opacity = 1;
    void heroLayer.offsetWidth; // force reflow
    heroLayer.style.transition = RM ? 'none' :
      `transform ${dur}ms cubic-bezier(.55,0,.1,1), border-radius ${dur}ms ease, opacity ${dur}ms ease`;
    heroLayer.style.transform = cellT;
    heroLayer.style.borderRadius = '14px';
    heroLayer.style.opacity = 0;
    setTimeout(()=>{
      state.transitioning = false;
      document.body.classList.remove('flying');
      heroLayer.style.opacity = 1;
      heroLayer.style.transition = 'none';
      heroLayer.style.transform = fullT;
      heroLayer.style.borderRadius = '0px';
      if(cell) cell.classList.remove('lift');
    }, dur+30);
  }
}

/* show/hide the grid overlay deterministically (visibility doesn't depend on a transition timer) */
function setGridVisible(v){
  [gridScrim, $('#gridScroll'), $('#gridHead')].forEach(el=>{
    if(el) el.style.visibility = v ? 'visible' : 'hidden';
  });
}

/* ---- idle / auto-hide chrome ---- */
let idleTimer = null;
function wake(){
  state.idle = false;
  stage.classList.remove('idle');
  clearTimeout(idleTimer);
  if(state.searchOpen) return;
  if(state.mode !== 'immersive') return;
  idleTimer = setTimeout(()=>{
    if(state.transitioning || state.crossfading) { wake(); return; }
    state.idle = true;
    stage.classList.add('idle');
  }, 2800);
}

/* ---- input ---- */
window.addEventListener('pointermove', wake, {passive:true});
window.addEventListener('pointerdown', wake, {passive:true});

// edge click zones for prev/next in immersive
$('#zoneL').addEventListener('click', ()=>{ if(state.mode==='immersive') goTo(state.index-1); });
$('#zoneR').addEventListener('click', ()=>{ if(state.mode==='immersive') goTo(state.index+1); });

window.addEventListener('keydown', (e)=>{
  if(state.searchOpen) return;
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  switch(e.key){
    case 'ArrowRight': case ' ': if(state.mode==='immersive'){ e.preventDefault(); goTo(state.index+1);} break;
    case 'ArrowLeft':  if(state.mode==='immersive') goTo(state.index-1); break;
    case 'Escape':     if(state.mode==='immersive') openGrid(); else openImmersive(state.index); break;
    case 'g': case 'G': if(state.mode==='immersive') openGrid(); else openImmersive(state.index); break;
    case 'i': case 'I': if(state.mode==='immersive') toggleInfo(); break;
    default:
      if(/^[1-9]$/.test(e.key)){ const n=+e.key-1; if(n<ALTS.length) goTo(n); }
      if(e.key==='0' && ALTS.length>=10) goTo(9);
  }
  wake();
});

// tool buttons
$('#btnGrid').addEventListener('click', openGrid);
$('#btnInfo').addEventListener('click', ()=> toggleInfo());
$('#btnClose').addEventListener('click', ()=> openImmersive(state.index));
$('#capClick').addEventListener('click', ()=> toggleInfo());

/* ---- Spotify library panel ---- */
function openSpotifyPanel(){
  state.searchOpen = true;                 // suppress idle/auto-hide while open
  $('#spotifyPanel').classList.add('show');
  document.body.classList.add('spotify-mode');
}
function closeSpotifyPanel(){
  $('#spotifyPanel').classList.remove('show');
  document.body.classList.remove('spotify-mode');
  state.searchOpen = false;
  wake();
}
$('#btnSpotify').addEventListener('click', openSpotifyPanel);
$('#spotifyClose').addEventListener('click', closeSpotifyPanel);
$('#spotifyCloseBtn').addEventListener('click', closeSpotifyPanel);

/* ---- Focus mode panel ---- */
function openFocusPanel(){
  state.searchOpen = true;
  $('#focusPanel').classList.add('show');
  document.body.classList.add('focus-mode-panel');
  if(typeof focusOnOpen === 'function') focusOnOpen();
}
function closeFocusPanel(){
  $('#focusPanel').classList.remove('show');
  document.body.classList.remove('focus-mode-panel');
  state.searchOpen = false;
  wake();
}
$('#btnFocus').addEventListener('click', openFocusPanel);
$('#focusClose').addEventListener('click', closeFocusPanel);
$('#focusCloseBtn').addEventListener('click', closeFocusPanel);

/* ---- reactivity preset picker: Auto follows each wallpaper, else force one ---- */
function setReactProfile(p){
  reactivityPlugin.default = p;                 // 'preset' (auto) or a fixed profile
  heroes.forEach(h=> h.reactScale = reactivityPlugin.scaleFor(h.fragId));
  if(state.gridReady) gridTiles.forEach(g=> g.tile.reactScale = reactivityPlugin.scaleFor(g.tile.fragId));
}
$('#reactPicker').addEventListener('click', (e)=>{
  const b = e.target.closest('button'); if(!b) return;
  [...$('#reactPicker').children].forEach(x=> x.classList.toggle('on', x===b));
  setReactProfile(b.dataset.p);
});
// dedicated handler: S opens the panel, Esc closes it (main handler early-returns
// while the panel is up because state.searchOpen is set).
window.addEventListener('keydown', (e)=>{
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName||'');
  const spOpen = $('#spotifyPanel').classList.contains('show');
  const fcOpen = $('#focusPanel').classList.contains('show');
  if(e.key==='Escape'){ if(spOpen) closeSpotifyPanel(); if(fcOpen) closeFocusPanel(); return; }
  if(typing || state.searchOpen) return;
  if(e.key==='s'||e.key==='S'){ openSpotifyPanel(); }
  if(e.key==='f'||e.key==='F'){ openFocusPanel(); }
});

/* ---- audio UI (single quiet control) ---- */
const audioWrap = $('#audio');
const audioLabel = $('#audioLabel');
function setStatus(text, live){
  audioLabel.textContent = text;
  audioWrap.classList.toggle('live', !!live);
}
function reflectButtons(){
  audioWrap.classList.toggle('mic', AUDIO.mode==='mic');
  audioWrap.classList.toggle('file', AUDIO.mode==='file');
}
$('#aMic').addEventListener('click', (e)=>{ e.stopPropagation(); AUDIO.useMic(); });
$('#aFile').addEventListener('click', (e)=>{ e.stopPropagation(); $('#fileInput').click(); });
$('#aStop').addEventListener('click', (e)=>{ e.stopPropagation(); AUDIO.stop(); });
$('#fileInput').addEventListener('change', (e)=>{ if(e.target.files[0]) AUDIO.useFile(e.target.files[0]); });

/* ---- render loop ---- */
function frame(now){
  AUDIO.update(now/1000);
  updateNowbar();
  drawEq();
  // ambient centered lyric — persists over the shader while a track streams in
  // the immersive view; hidden in grid/search/spotify or when not streaming.
  if(nowPlaying && AUDIO.mode==='stream' && state.mode==='immersive'
     && !state.searchOpen && typeof currentLyric==='function'){
    setCenterLyric(currentLyric((streamEl.currentTime||0)*1000));
    // glow breathes with the audio across the active lyric line's time range
    if(lyricLast){
      const g = Math.min(1, AUDIO.vocal*0.65 + AUDIO.level*0.45 + AUDIO.pulse*0.25);
      lyricLineEl.style.textShadow =
        `0 2px 40px rgba(0,0,0,.5), 0 0 ${(10 + g*48).toFixed(1)}px rgba(255,255,255,${(0.12 + g*0.55).toFixed(3)})`;
    }
  } else {
    setCenterLyric('');
  }
  if(state.mode==='immersive' || state.transitioning){
    heroes[front].draw();
    if(state.crossfading || state.transitioning) heroes[1-front].draw();
  }
  if(state.mode==='grid' || state.transitioning){
    if(state.gridReady) gridTiles.forEach(g=> g.tile.draw());
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', ()=>{
  heroes.forEach(h=> h.resize());
  if(state.gridReady) gridTiles.forEach(g=> g.tile.resize());
});

/* ---- boot ---- */
setGridVisible(false);
reflect();
heroEls[front].style.opacity = 1;
heroEls[1-front].style.opacity = 0;
setStatus('synthetic', false);
requestAnimationFrame(frame);
wake();
