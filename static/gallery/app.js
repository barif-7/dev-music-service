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
// Player hero: idle-wave orbit when audio is inactive/paused, with only a subtle
// secondary drift during active playback (real audio features dominate then).
heroes.forEach((h, i)=>{ h.idleWave = true; h.idleWaveAuto = true; h.idlePhase = i * 1.7; });
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
  d.addEventListener('click', ()=> Wallpaper.go(i));
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
  if(!t){                                   // baked shaders with no demo pairing (track:null)
    infoEl.innerHTML =
      `<div class="i-track">${escHtml(w.name)}</div>`+
      `<div class="i-meta">${escHtml(w.desc||'')}</div>`+
      `<div class="i-src">${escHtml(w.pairFrom)} · ${escHtml(w.preset)} · ${w.bpm} BPM</div>`;
    return;
  }
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
  playerControls.renderTrack(track, status);
  wake();
}

/* ---- now-playing player bar ---- */
const playerControls = new PlayerControls({
  player,
  bar:$('#nowbar'),
  playButton:$('#nbPlay'),
  playIcon:$('#nbPlayIcon'),
  previousButton:$('#nbPrev'),
  nextButton:$('#nbNext'),
  scrubber:$('#nbScrub'),
  fill:$('#nbFill'),
  time:$('#nbTime'),
  title:$('#nbTitle'),
  subtitle:$('#nbSub'),
  artwork:$('#nbArt'),
  artworkImage:$('#nbImg'),
  onPrevious:()=>Wallpaper.go(state.index-1),
  onNext:()=>Wallpaper.go(state.index+1),
  onTrackRendered:track=>{
    if(typeof syncSpotifySaveButton === 'function') syncSpotifySaveButton(track);
  },
}).bind();

/* ---- ambient FFT spectrum (rendered by the EQ module; controls in eq.js) ---- */
const eqCanvas = $('#eqCanvas');

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

/* ---- Wallpaper: the SINGLE owner of the active shader. Every switch — dots,
   edge zones, keys, player prev/next, grid cells — routes through here. A switch
   requested while a transition is mid-flight is coalesced (latest target wins)
   and applied when the transition settles, so the crossfade can never double-swap
   `front`. Subscribers are broadcast on every committed change. ---- */
const Wallpaper = {
  _subs: [],
  _pending: null,                       // queued request while a transition runs
  get index(){ return state.index; },
  norm(i){ return ((i % ALTS.length) + ALTS.length) % ALTS.length; },
  subscribe(fn){ this._subs.push(fn); return ()=>{ const k=this._subs.indexOf(fn); if(k>=0) this._subs.splice(k,1); }; },
  _emit(){ const w=ALTS[state.index]; for(const fn of this._subs){ try{ fn(state.index, w); }catch(e){ console.warn('wallpaper sub', e); } } },
  _busy(){ return state.crossfading || state.transitioning; },
  _drain(){
    const p=this._pending; if(!p) return; this._pending=null;
    if(p.t==='grid')           this.openGrid();
    else if(p.t==='immersive') this.openImmersive(p.i, p.cell);
    else                       this.go(p.i);
  },

  /* switch wallpaper within immersive (crossfade); from grid → open immersive */
  go(i){
    i = this.norm(i);
    if(this._busy()){ this._pending = {t:'go', i}; return; }
    if(state.mode === 'grid'){ this.openImmersive(i); return; }
    if(i === state.index) return;
    state.index = i;
    this._crossfade(ALTS[i]);
    this._emit();
  },

  openGrid(){
    if(this._busy()){ this._pending = {t:'grid'}; return; }
    if(state.mode === 'grid') return;
    buildGrid();
    state.mode = 'grid';
    setGridVisible(true);
    toggleInfo(false);
    document.body.classList.add('grid-mode');
    stage.classList.remove('idle');
    gridTiles.forEach((g,i)=> g.cell.classList.toggle('current', i===state.index));
    this._flip(gridTiles[state.index].cell, false);
  },

  openImmersive(i, cell){
    i = (i==null) ? state.index : this.norm(i);
    if(this._busy()){ this._pending = {t:'immersive', i, cell}; return; }
    const w = ALTS[i];
    cell = cell || (gridTiles[i] && gridTiles[i].cell);
    state.index = i;
    heroes[front].load(w.id, w.bpm);
    heroes[front].draw();
    heroEls[front].style.opacity = 1;
    heroEls[1-front].style.opacity = 0;
    state.mode = 'immersive';
    this._flip(cell, true);
    this._emit();
  },

  _crossfade(w){
    const inc = heroes[1-front], incEl = heroEls[1-front];
    inc.load(w.id, w.bpm); inc.draw();
    incEl.style.zIndex = 2; heroEls[front].style.zIndex = 1;
    state.crossfading = true;
    const finish = ()=>{ heroEls[front].style.opacity = 0; front = 1-front; state.crossfading = false; this._drain(); };
    if(RM){ incEl.style.transition='none'; incEl.style.opacity=1; finish(); }
    else {
      incEl.style.transition = 'opacity .9s cubic-bezier(.4,0,.15,1)';
      incEl.style.opacity = 0; void incEl.offsetWidth; incEl.style.opacity = 1;
      setTimeout(finish, 920);
    }
    wake();
  },

  /* FLIP the hero layer between a cell rect and fullscreen */
  _flip(cell, open){
    const vw=window.innerWidth, vh=window.innerHeight;
    const r = cell ? cell.getBoundingClientRect() : {left:vw*0.5, top:vh*0.5, width:1, height:1};
    const cellT = `translate(${r.left}px,${r.top}px) scale(${r.width/vw},${r.height/vh})`;
    const fullT = 'translate(0px,0px) scale(1,1)';
    const dur = RM ? 0 : 720;
    state.transitioning = true;
    document.body.classList.add('flying');
    heroLayer.style.transformOrigin = 'top left';
    if(open){
      document.body.classList.remove('grid-mode');
      heroLayer.style.transition='none'; heroLayer.style.transform=cellT; heroLayer.style.borderRadius='14px'; heroLayer.style.opacity=1;
      if(cell) cell.classList.add('lift');
      void heroLayer.offsetWidth;
      heroLayer.style.transition = RM?'none':`transform ${dur}ms cubic-bezier(.55,0,.1,1), border-radius ${dur}ms ease`;
      heroLayer.style.transform=fullT; heroLayer.style.borderRadius='0px';
      setTimeout(()=>{
        state.transitioning=false; document.body.classList.remove('flying');
        heroLayer.style.transition='none';
        gridTiles.forEach(g=> g.cell.classList.remove('lift'));
        setGridVisible(false); wake(); this._drain();
      }, dur+30);
    } else {
      document.body.classList.add('grid-mode');
      if(cell) cell.classList.add('lift');
      heroLayer.style.transition='none'; heroLayer.style.transform=fullT; heroLayer.style.borderRadius='0px'; heroLayer.style.opacity=1;
      void heroLayer.offsetWidth;
      heroLayer.style.transition = RM?'none':`transform ${dur}ms cubic-bezier(.55,0,.1,1), border-radius ${dur}ms ease, opacity ${dur}ms ease`;
      heroLayer.style.transform=cellT; heroLayer.style.borderRadius='14px'; heroLayer.style.opacity=0;
      setTimeout(()=>{
        state.transitioning=false; document.body.classList.remove('flying');
        heroLayer.style.opacity=1; heroLayer.style.transition='none'; heroLayer.style.transform=fullT; heroLayer.style.borderRadius='0px';
        if(cell) cell.classList.remove('lift');
        this._drain();
      }, dur+30);
    }
  },
};

/* subscribers: reflect the active wallpaper into the caption/dots + grid marker */
Wallpaper.subscribe(()=> reflect());
Wallpaper.subscribe(()=>{ if(state.gridReady) gridTiles.forEach((g,i)=> g.cell.classList.toggle('current', i===state.index)); });

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
    cell.addEventListener('click', ()=> Wallpaper.openImmersive(i, cell));
    gridEl.appendChild(cell);
    const t = new Tile(cell.querySelector('canvas'), w.id, w.bpm, 1.0);
    // Grid previews always orbit (idle wave) — they have no live audio context.
    t.idleWave = true; t.idlePhase = i * 1.7;
    gridTiles.push({tile:t, cell});
  });
  state.gridReady = true;
}

/* openGrid / openImmersive / FLIP now live on the Wallpaper singleton above. */

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
$('#zoneL').addEventListener('click', ()=>{ if(state.mode==='immersive') Wallpaper.go(state.index-1); });
$('#zoneR').addEventListener('click', ()=>{ if(state.mode==='immersive') Wallpaper.go(state.index+1); });

window.addEventListener('keydown', (e)=>{
  if(state.searchOpen) return;
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  switch(e.key){
    case 'ArrowRight': case ' ': if(state.mode==='immersive'){ e.preventDefault(); Wallpaper.go(state.index+1);} break;
    case 'ArrowLeft':  if(state.mode==='immersive') Wallpaper.go(state.index-1); break;
    case 'Escape':     if(state.mode==='immersive') Wallpaper.openGrid(); else Wallpaper.openImmersive(state.index); break;
    case 'g': case 'G': if(state.mode==='immersive') Wallpaper.openGrid(); else Wallpaper.openImmersive(state.index); break;
    case 'i': case 'I': if(state.mode==='immersive') toggleInfo(); break;
    default:
      if(/^[1-9]$/.test(e.key)){ const n=+e.key-1; if(n<ALTS.length) Wallpaper.go(n); }
      if(e.key==='0' && ALTS.length>=10) Wallpaper.go(9);
  }
  wake();
});

// tool buttons
$('#btnGrid').addEventListener('click', ()=> Wallpaper.openGrid());
$('#btnInfo').addEventListener('click', ()=> toggleInfo());
$('#btnClose').addEventListener('click', ()=> Wallpaper.openImmersive(state.index));
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
const reactToggle = $('#reactToggle');
function refreshReactScales(){
  heroes.forEach(h=> h.reactScale = reactivityPlugin.scaleFor(h.fragId));
  if(state.gridReady) gridTiles.forEach(g=> g.tile.reactScale = reactivityPlugin.scaleFor(g.tile.fragId));
}
function setReactEnabled(on){
  reactivityPlugin.enabled = !!on;
  reactToggle.classList.toggle('on', reactivityPlugin.enabled);
  reactToggle.textContent = reactivityPlugin.enabled ? 'On' : 'Off';
  reactToggle.setAttribute('aria-pressed', reactivityPlugin.enabled ? 'true' : 'false');
  refreshReactScales();
}
function setReactProfile(p){
  reactivityPlugin.default = p;                 // 'preset' (auto) or a fixed profile
  if(!reactivityPlugin.enabled) setReactEnabled(true);
  refreshReactScales();
}
reactToggle.addEventListener('click', ()=> setReactEnabled(!reactivityPlugin.enabled));
$('#reactPicker').addEventListener('click', (e)=>{
  const b = e.target.closest('button'); if(!b) return;
  [...$('#reactPicker').children].forEach(x=> x.classList.toggle('on', x===b));
  setReactProfile(b.dataset.p);
});
setReactEnabled(true);
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
$('#fileInput').addEventListener('change', (e)=>{
  if(e.target.files[0]) AUDIO.useFile(e.target.files[0], playbackRules);
});

/* ---- render loop ---- */
function frame(now){
  AUDIO.update(now/1000);
  playerControls.update();
  if(typeof EQ==='object'){ EQ.update(); EQ.draw(eqCanvas); }
  // ambient centered lyric — persists over the shader while a track streams in
  // the immersive view; hidden in grid/search/spotify or when not streaming.
  if(nowPlaying && AUDIO.mode==='stream' && state.mode==='immersive'
     && !state.searchOpen && typeof currentLyric==='function'){
    setCenterLyric(currentLyric(player.currentTime*1000));
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
