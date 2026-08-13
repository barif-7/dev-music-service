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
// Declared before feature initialization because persisted preferences (for
// example the lyric language) may call wake() while this script is still booting.
let idleTimer = null;

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

/* ---- live shader catalogue -------------------------------------------------
   The bundled sources guarantee an instant/offline gallery. The same-origin
   API marks which designs are distribution-ready, and its GLSL is loaded only
   when a wallpaper is viewed so opening the page never creates a request storm. */
const shaderApi = { online:false, ids:new Set(), loading:new Map() };

function refreshShaderApiUi(){
  const status = $('#shaderApiStatus');
  const apiCount = ALTS.filter(item=>item.apiAvailable).length;
  const bundledCount = Math.max(0, ALTS.length - apiCount);
  if(status){
    status.textContent = shaderApi.online
      ? `${ALTS.length} living shaders · ${apiCount} live from API · ${bundledCount} bundled`
      : `${ALTS.length} living shaders · bundled fallback · API offline`;
  }
  if(typeof gridTiles !== 'undefined'){
    gridTiles.forEach((entry,index)=>{
      const available = !!ALTS[index]?.apiAvailable;
      entry.cell.dataset.api = String(available);
      const badge = entry.cell.querySelector('.cell-source');
      if(badge) badge.textContent = available ? 'API' : 'Bundled';
    });
  }
}

async function ensureApiShader(id){
  if(!shaderApi.online || !shaderApi.ids.has(id)) return false;
  if(API_FRAGS[id]) return true;
  if(shaderApi.loading.has(id)) return shaderApi.loading.get(id);
  const task = (async()=>{
    try{
      const response = await fetch(`/api/shaders/${encodeURIComponent(id)}/source?format=glsl`);
      if(!response.ok) throw new Error(`source ${response.status}`);
      const source = await response.text();
      if(!source.includes('void main')) throw new Error('invalid GLSL source');
      API_FRAGS[id] = source;
      heroes.filter(tile=>tile.fragId===id).forEach(tile=>{ tile.load(id, tile.bpm); tile.draw(); });
      if(gridPreviewTile?.fragId===id){ gridPreviewTile.load(id, gridPreviewTile.bpm); gridPreviewTile.draw(); }
      return true;
    }catch(error){
      console.warn('API shader unavailable', id, error);
      return false;
    }finally{
      shaderApi.loading.delete(id);
    }
  })();
  shaderApi.loading.set(id, task);
  return task;
}

async function syncShaderCatalogue(){
  try{
    const response = await fetch('/api/shaders', { cache:'no-store' });
    if(!response.ok) throw new Error(`catalogue ${response.status}`);
    const payload = await response.json();
    const entries = Array.isArray(payload?.shaders) ? payload.shaders : [];
    shaderApi.ids = new Set(entries.map(item=>item?.id).filter(Boolean));
    shaderApi.online = true;
    ALTS.forEach(item=>{ item.apiAvailable = shaderApi.ids.has(item.id); });
    refreshShaderApiUi();
    await ensureApiShader(ALTS[state.index].id);
  }catch(error){
    shaderApi.online = false;
    ALTS.forEach(item=>{ item.apiAvailable = false; });
    refreshShaderApiUi();
    console.warn('Shader API offline; using bundled gallery', error);
  }
}

document.querySelectorAll('svg').forEach(svg=>{
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
});

function focusableIn(root){
  return [...root.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )].filter(el=>el.tabIndex >= 0 && !el.hidden && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
}

let activeDialog = null;
function setElementInert(el, inert){
  if(!el) return;
  el.inert = !!inert;
  if(inert) el.setAttribute('inert', '');
  else el.removeAttribute('inert');
}

function trapDialogFocus(dialog, event){
  const nodes = focusableIn(dialog);
  if(!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if(event.shiftKey && document.activeElement === first){
    event.preventDefault();
    last.focus();
  } else if(!event.shiftKey && document.activeElement === last){
    event.preventDefault();
    first.focus();
  }
}

function openManagedDialog(panel, { trigger=null, bodyClass='', firstFocus=null, onOpen=null }={}){
  if(!panel) return;
  if(activeDialog && activeDialog !== panel) closeManagedDialog(activeDialog);
  panel._returnFocus = trigger || document.activeElement;
  panel._bodyClass = bodyClass;
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  setElementInert(panel, false);
  if(trigger) trigger.setAttribute('aria-expanded', 'true');
  if(bodyClass) document.body.classList.add(bodyClass);
  state.searchOpen = true;
  activeDialog = panel;
  if(typeof onOpen === 'function') onOpen();
  requestAnimationFrame(()=>{
    const target = firstFocus ? panel.querySelector(firstFocus) : null;
    (target || focusableIn(panel)[0] || panel.querySelector('[tabindex="-1"]') || panel)
      .focus({ preventScroll:true });
  });
}

function closeManagedDialog(panel, { trigger=null }={}){
  if(!panel) return;
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
  setElementInert(panel, true);
  const owner = trigger || document.querySelector(`[aria-controls="${panel.id}"]`);
  if(owner) owner.setAttribute('aria-expanded', 'false');
  if(panel._bodyClass) document.body.classList.remove(panel._bodyClass);
  if(activeDialog === panel) activeDialog = null;
  state.searchOpen = false;
  const returnFocus = panel._returnFocus;
  if(returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll:true });
  wake();
}

/* ---- build dot rail ---- */
ALTS.forEach((w,i)=>{
  const d = document.createElement('button');
  d.type = 'button';
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
  dots.forEach((d,i)=>{
    const active = i===state.index;
    d.classList.toggle('on', active);
    d.setAttribute('aria-current', active ? 'true' : 'false');
  });
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
  window.dispatchEvent(new CustomEvent('phase:track', { detail: track }));
  wake();
}

/* ---- recently played: browser-session scoped, unique stack of 7 ---- */
const RECENT_LIMIT = 7;
const RECENT_SESSION_ID_KEY = 'phaseField.recentSessionId';
let recentSessionId = '';
try{
  recentSessionId = sessionStorage.getItem(RECENT_SESSION_ID_KEY) || '';
  if(!recentSessionId){
    const webCrypto = typeof crypto !== 'undefined' ? crypto : null;
    const rand = webCrypto?.randomUUID ? webCrypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    recentSessionId = rand;
    sessionStorage.setItem(RECENT_SESSION_ID_KEY, recentSessionId);
  }
}catch(e){
  recentSessionId = `memory-${Date.now()}`;
}
const RECENT_KEY = `phaseField.recentlyPlayed.${recentSessionId}`;

function recentTrackKey(track){
  const id = track?.spotifyId || track?.spotify_id || track?.provider_track_id || track?.webpage_url || track?.url;
  if(id) return String(id);
  return [track?.title, track?.artist, track?.album].map(v=>String(v || '').trim().toLowerCase()).join('|');
}

function loadRecentTracks(){
  try{
    const parsed = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item=>item && item.title).slice(0, RECENT_LIMIT) : [];
  }catch(e){
    return [];
  }
}

function saveRecentTracks(items){
  try{ sessionStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_LIMIT))); }catch(e){}
}

function compactRecentTrack(track){
  return {
    key:recentTrackKey(track),
    title:track?.title || 'Untitled',
    artist:track?.artist || '',
    album:track?.album || '',
    release_year:track?.release_year || track?.year || null,
    duration:track?.duration || null,
    thumbnail:track?.thumbnail || '',
    spotifyId:track?.spotifyId || track?.spotify_id || track?.provider_track_id || null,
    provider_track_id:track?.provider_track_id || null,
    playCount:Number(track?.playCount || track?.play_count || 1),
    playedAt:Date.now(),
  };
}

function recordRecentlyPlayed(track){
  if(!track?.title) return;
  const next = compactRecentTrack(track);
  const key = next.key;
  if(!key) return;
  const current = loadRecentTracks();
  const prior = current.find(item=>item.key === key);
  next.playCount = Number(prior?.playCount || 0) + 1;
  const items = current.filter(item=>item.key !== key);
  items.unshift(next);
  saveRecentTracks(items);
  renderRecentlyPlayed();
}
window.recordRecentlyPlayed = recordRecentlyPlayed;

function renderRecentlyPlayed(){
  const list = $('#searchRecentList');
  if(!list) return;
  const items = loadRecentTracks();
  if(!items.length){
    list.innerHTML = '<div class="recentEmpty">Songs you play will collect here for quick access.</div>';
    return;
  }
  list.innerHTML = items.map((track, index)=>{
    const attr = s=>escHtml(s).replace(/"/g, '&quot;');
    const art = track.thumbnail
      ? `<img src="${attr(track.thumbnail)}" alt="" loading="lazy">`
      : `<span class="r-ph">♪</span>`;
    const meta = [track.artist, track.album].filter(Boolean).map(escHtml).join(' · ') || 'Play again';
    return `<button type="button" class="recent-card" data-index="${index}" aria-label="Play ${attr(track.title)}">
      <span class="r-art">${art}</span>
      <span class="r-name">${escHtml(track.title)}</span><span class="r-meta">${meta}</span>
    </button>`;
  }).join('');
  list.querySelectorAll('.recent-card').forEach(card=>card.addEventListener('click', ()=>{
    const track = loadRecentTracks()[+card.dataset.index];
    if(!track) return;
    if(typeof window.closeMusicSearchModal === 'function') window.closeMusicSearchModal();
    loadTrack(track);
  }));
}
window.renderRecentlyPlayed = renderRecentlyPlayed;

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
    if(typeof refreshSpotifySavedState === 'function') refreshSpotifySavedState(track);
  },
}).bind();

/* ---- ambient FFT spectrum (rendered by the EQ module; controls in eq.js) ---- */
const eqCanvas = $('#eqCanvas');

/* ---- ambient centered lyric layer ---- */
const lyricStage = $('#lyricStage'), lyricReader = $('#lyricReader'), lyricStack = $('#lyricStack'), lyricLineEl = $('#lyricLine');
const lyricCompareWrap = $('#lyricCompareWrap'), lyricCompareLineEl = $('#lyricCompareLine'), lyricCompareLabel = $('#lyricCompareLabel');
let lyricLast = null, lyricCompareLast = null, lyricSwap = null;
function splitLyricTokens(text){
  return String(text || '').match(/\s+|\S+/g) || [];
}

function lyricWordMetrics(text){
  const tokens = splitLyricTokens(text);
  const weights = [];
  let total = 0;
  for(const token of tokens){
    if(!/\S/.test(token)) continue;
    const letters = token.replace(/[^\p{L}\p{N}]+/gu, '').length || token.trim().length || 1;
    const weight = Math.max(0.85, Math.sqrt(letters));
    total += weight;
    weights.push(total);
  }
  return { tokens, weights, total };
}

function activeLyricWordIndex(text, timing, elapsedMs){
  const metrics = lyricWordMetrics(text);
  if(!metrics.weights.length || !timing) return -1;
  const span = Math.max(350, timing.end - timing.start);
  const progress = clamp((elapsedMs - timing.start) / span, 0, 0.999);
  const target = progress * metrics.total;
  const index = metrics.weights.findIndex(limit=>target < limit);
  return index < 0 ? metrics.weights.length - 1 : index;
}

function renderLyricWords(el, text, activeIndex){
  if(!el) return;
  text = String(text || '');
  if(el._lyricText !== text){
    el._lyricText = text;
    el._lyricWordSpans = [];
    el._lyricActiveIndex = null;
    el.textContent = '';
    let wordIndex = 0;
    for(const token of splitLyricTokens(text)){
      if(/\S/.test(token)){
        const span = document.createElement('span');
        span.className = 'lyric-word';
        span.textContent = token;
        span.dataset.wordIndex = String(wordIndex++);
        el._lyricWordSpans.push(span);
        el.appendChild(span);
      } else {
        el.appendChild(document.createTextNode(token));
      }
    }
  }
  if(el._lyricActiveIndex === activeIndex) return;
  el._lyricActiveIndex = activeIndex;
  for(const span of el._lyricWordSpans || []){
    const i = Number(span.dataset.wordIndex);
    span.classList.toggle('is-active', i === activeIndex);
    span.classList.toggle('is-past', i < activeIndex);
  }
}

function resetLyricWords(el){
  if(!el) return;
  el.textContent = '';
  el._lyricText = '';
  el._lyricWordSpans = [];
  el._lyricActiveIndex = null;
}

function setCenterComparison(text, activeIndex=-1, label='Translation'){
  const comparison = String(text || '');
  if(lyricCompareLabel && label) lyricCompareLabel.textContent = label;
  if(lyricStack) lyricStack.dataset.mode = comparison ? 'comparison' : 'single';
  if(lyricCompareWrap) lyricCompareWrap.hidden = !comparison;
  if(!comparison){
    lyricCompareLast = '';
    resetLyricWords(lyricCompareLineEl);
    lyricCompareLineEl?.classList.remove('is-pending');
    if(lyricCompareLineEl) lyricCompareLineEl.style.textShadow = '';
    return;
  }
  if(comparison === lyricCompareLast){
    renderLyricWords(lyricCompareLineEl, comparison, activeIndex);
    return;
  }
  lyricCompareLast = comparison;
  lyricCompareLineEl?.classList.toggle('is-pending', comparison === 'Translating...');
  renderLyricWords(lyricCompareLineEl, comparison, activeIndex);
}

function setCenterLyric(line, activeIndex=-1, comparison='', comparisonActiveIndex=-1, comparisonLabel='Translation', preserveLab=false){
  if(!line){
    const keepLab = preserveLab && lyricReader?.classList.contains('lab-ready');
    lyricStage.classList.toggle('show', keepLab);
    lyricStage.setAttribute('aria-hidden', keepLab ? 'false' : 'true');
  }
  if(line === lyricLast && comparison === lyricCompareLast){
    setCenterComparison(comparison, comparisonActiveIndex, comparisonLabel);
    return;
  }
  lyricLast = line;
  clearTimeout(lyricSwap);
  if(line){
    lyricStage.classList.add('show');
    lyricStage.setAttribute('aria-hidden', 'false');
    if(lyricLineEl.textContent){           // cross-fade out → swap → in
      [lyricLineEl, lyricCompareLineEl].forEach(el=>{
        if(!el) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(7px)';
      });
      lyricSwap = setTimeout(()=>{
        renderLyricWords(lyricLineEl, line, activeIndex);
        setCenterComparison(comparison, comparisonActiveIndex, comparisonLabel);
        [lyricLineEl, lyricCompareLineEl].forEach(el=>{
          if(!el) return;
          el.style.opacity = '';
          el.style.transform = '';
        });
      }, 240);
    } else {                                // first line — just fade the layer in
      renderLyricWords(lyricLineEl, line, activeIndex);
      setCenterComparison(comparison, comparisonActiveIndex, comparisonLabel);
      lyricLineEl.style.opacity = '';
      lyricLineEl.style.transform = '';
    }
  } else if(!preserveLab || !lyricReader?.classList.contains('lab-ready')) {
    lyricStage.classList.remove('show');    // gap / no lyric / not immersive
    lyricStage.setAttribute('aria-hidden', 'true');
    lyricSwap = setTimeout(()=>{
      if(lyricLast===''){
        resetLyricWords(lyricLineEl);
        setCenterComparison('');
      }
    }, 1100);
  }
}

/* Lyrics are opt-out and remain a single, stable read-along surface. */
let lyricsVisible = (()=>{ try{ return localStorage.getItem('phaseField.lyricsVisible') !== '0'; }catch(e){ return true; } })();
function setLyricsVisible(visible, wakeUI=true){
  lyricsVisible = !!visible;
  try{ localStorage.setItem('phaseField.lyricsVisible', lyricsVisible ? '1' : '0'); }catch(e){}
  const button = $('#lyricsToggleBtn');
  button?.setAttribute('aria-pressed', String(lyricsVisible));
  button?.setAttribute('aria-label', lyricsVisible ? 'Hide lyrics' : 'Show lyrics');
  if(!lyricsVisible) setCenterLyric('');
  if(wakeUI) wake();
}
$('#lyricsToggleBtn')?.addEventListener('click', ()=>setLyricsVisible(!lyricsVisible));
setLyricsVisible(lyricsVisible, false);
function updateCenterLyricWord(line, activeIndex, comparison='', comparisonActiveIndex=-1, comparisonLabel='Translation'){
  if(line && line === lyricLast) renderLyricWords(lyricLineEl, line, activeIndex);
  if(comparison) setCenterComparison(comparison, comparisonActiveIndex, comparisonLabel);
  else if(lyricCompareLast) setCenterComparison('');
}

/* ---- live lyric under the track title (original + localized) ---- */
function selectedLyricLocaleOption(){
  const sel = document.getElementById('lyricLocale');
  return sel?.selectedOptions?.[0] || null;
}

function selectedLyricLocale(){
  const opt = selectedLyricLocaleOption();
  return opt ? opt.value : '';
}

function selectedLyricLocaleLabel(){
  const opt = selectedLyricLocaleOption();
  if(!opt || !opt.value) return '';
  return opt.dataset.stackLabel || opt.textContent?.trim() || 'Translation';
}

function wantsCenterLyricComparison(){
  return !!selectedLyricLocale();
}

function updateLiveLyric(){
  const box = document.getElementById('iLyricLive');
  if(!box) return;
  if(!(nowPlaying && AUDIO.mode==='stream') || typeof currentLyricTiming!=='function'){
    box.hidden = true; return;
  }
  const elapsedMs = player.currentTime*1000;
  const timing = currentLyricTiming(elapsedMs);
  const line = timing ? timing.line : null;
  const pair = document.getElementById('iLyricPair');
  const orig = document.getElementById('iLyricOrig');
  const locCol = document.getElementById('iLyricLocCol');
  const locLabel = document.getElementById('iLyricLocLabel');
  const loc  = document.getElementById('iLyricLoc');
  if(!line || !line.text){
    box.hidden = true;
    if(orig) orig.textContent = '';
    if(loc){ loc.textContent = ''; loc._lyricText = ''; loc._lyricWordSpans = []; }
    if(locCol) locCol.hidden = true;
    if(pair) pair.dataset.mode = 'original';
    return;
  }
  box.hidden = false;
  const activeOrig = activeLyricWordIndex(line.text, timing, elapsedMs);
  if(orig) renderLyricWords(orig, line.text, activeOrig);
  const wantsTranslation = wantsCenterLyricComparison();
  if(pair) pair.dataset.mode = wantsTranslation ? 'translation' : 'original';
  if(locCol) locCol.hidden = !wantsTranslation;
  if(locLabel && wantsTranslation) locLabel.textContent = selectedLyricLocaleLabel();
  if(loc && wantsTranslation){
    const localized = line.localized || '';
    if(localized) renderLyricWords(loc, localized, activeLyricWordIndex(localized, timing, elapsedMs));
    else {
      loc.textContent = 'Translating...';
      loc._lyricText = '';
      loc._lyricWordSpans = [];
      loc._lyricActiveIndex = null;
    }
  } else if(loc){
    loc.textContent = '';
    loc._lyricText = '';
    loc._lyricWordSpans = [];
    loc._lyricActiveIndex = null;
  }
}

function toggleInfo(force){
  state.infoOpen = force===undefined ? !state.infoOpen : force;
  infoEl.classList.toggle('show', state.infoOpen);
  $('#btnInfo')?.setAttribute('aria-expanded', String(state.infoOpen));
  $('#capClick')?.setAttribute('aria-expanded', String(state.infoOpen));
  wake();
}

/* ---- lyric language picker — re-localizes the current track live ---- */
const lyricLocaleSel = $('#lyricLocale');
const translationLocaleSel = $('#translationTargetLocale');
const translationSettingsPanel = $('#translationSettingsPanel');
const translationSettingsBtn = $('#translationSettingsBtn');

// The in-reader control is canonical; the larger modal gets the exact same
// choices so both surfaces stay consistent as languages are added.
if(lyricLocaleSel && translationLocaleSel){
  translationLocaleSel.innerHTML = lyricLocaleSel.innerHTML;
}

function lyricLocaleOption(locale){
  if(!lyricLocaleSel) return null;
  return [...lyricLocaleSel.options].find(option=>option.value === locale) || null;
}

function applyLyricLocaleChoice(locale, { persist=true, reload=true }={}){
  let value = String(locale || '');
  if(value && !lyricLocaleOption(value)) value = '';
  [lyricLocaleSel, translationLocaleSel].forEach(select=>{
    if(select) select.value = value;
  });
  if(persist){
    try{ localStorage.setItem('lyricLocale', value); }catch(e){ /* ignore */ }
  }

  const option = lyricLocaleOption(value);
  const language = option ? (option.dataset.stackLabel || option.textContent?.trim()) : '';
  const pair = $('#iLyricPair');
  const col = $('#iLyricLocCol');
  const loc = $('#iLyricLoc');
  const label = $('#iLyricLocLabel');
  const status = $('#translationChoiceStatus');
  if(pair) pair.dataset.mode = value ? 'translation' : 'original';
  if(col) col.hidden = !value;
  if(label && value) label.textContent = language || 'Translation';
  if(value && loc) loc.textContent = 'Translating...';
  if(status){
    status.textContent = value
      ? `${language} selected. Current and upcoming lyrics will refresh automatically.`
      : 'Translations are off. Lyrics will stay in their original language.';
  }
  if(translationSettingsBtn){
    translationSettingsBtn.setAttribute('aria-label', value
      ? `Translation language: ${language}`
      : 'Choose translation language');
    translationSettingsBtn.dataset.label = value ? `Language · ${language}` : 'Language';
  }
  if(reload && typeof setLyricLocale === 'function') setLyricLocale(value);
  wake();
  return value;
}

if(lyricLocaleSel){
  const saved = (()=>{ try{ return localStorage.getItem('lyricLocale')||''; }catch(e){ return ''; } })();
  applyLyricLocaleChoice(saved, { persist:false });
  [lyricLocaleSel, translationLocaleSel].filter(Boolean).forEach(select=>{
    select.addEventListener('change', ()=>applyLyricLocaleChoice(select.value));
  });
}

function openTranslationSettings(){
  openManagedDialog(translationSettingsPanel, {
    trigger:translationSettingsBtn,
    firstFocus:'#translationTargetLocale',
  });
}
function closeTranslationSettings(){
  closeManagedDialog(translationSettingsPanel, { trigger:translationSettingsBtn });
}
translationSettingsBtn?.addEventListener('click', openTranslationSettings);
$('#translationSettingsClose')?.addEventListener('click', closeTranslationSettings);
$('#translationSettingsCloseBtn')?.addEventListener('click', closeTranslationSettings);
$('#translationSettingsDoneBtn')?.addEventListener('click', closeTranslationSettings);

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
    ensureApiShader(ALTS[i].id);
    this._emit();
  },

  openGrid(instant=false){
    if(this._busy()){ this._pending = {t:'grid'}; return; }
    if(state.mode === 'grid') return;
    buildGrid();
    state.mode = 'grid';
    setGridVisible(true);
    $('#btnGrid')?.setAttribute('aria-expanded', 'true');
    toggleInfo(false);
    document.body.classList.add('grid-mode');
    stage.classList.remove('idle');
    gridTiles.forEach((g,i)=> g.cell.classList.toggle('current', i===state.index));
    activateGridPreview(state.index, gridTiles[state.index].cell);
    requestAnimationFrame(()=>$('#btnClose')?.focus({ preventScroll:true }));
    if(instant){
      heroLayer.style.opacity = 0;
      heroLayer.style.transform = 'translate(0px,0px) scale(1,1)';
      state.transitioning = false;
      return;
    }
    this._flip(gridTiles[state.index].cell, false);
  },

  openImmersive(i, cell){
    i = (i==null) ? state.index : this.norm(i);
    if(this._busy()){ this._pending = {t:'immersive', i, cell}; return; }
    const w = ALTS[i];
    cell = cell || (gridTiles[i] && gridTiles[i].cell);
    state.index = i;
    $('#btnGrid')?.setAttribute('aria-expanded', 'false');
    requestAnimationFrame(()=>$('#btnGrid')?.focus({ preventScroll:true }));
    heroes[front].load(w.id, w.bpm);
    heroes[front].draw();
    ensureApiShader(w.id);
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
Wallpaper.subscribe(()=>{
  if(state.gridReady) gridTiles.forEach((g,i)=>{
    const active = i===state.index;
    g.cell.classList.toggle('current', active);
    g.cell.setAttribute('aria-current', active ? 'true' : 'false');
  });
});

/* ---- grid (overview switcher) ---- */
let gridTiles = [];
let gridPreviewCanvas = null;
let gridPreviewTile = null;
let gridPreviewCell = null;

function wallpaperFallback(w){
  const p = w.palette || ['#10141a','#263443','#7aa091','#f48d68'];
  return `radial-gradient(circle at 68% 30%, ${p[2] || p[0]} 0%, transparent 44%),linear-gradient(145deg,${p[0]},${p[1] || p[0]} 58%,${p[3] || p[2] || p[0]})`;
}

function activateGridPreview(index, cell){
  const w = ALTS[index];
  if(!w || !cell) return;
  if(!gridPreviewCanvas){
    gridPreviewCanvas = document.createElement('canvas');
    gridPreviewCanvas.className = 'grid-live-preview';
    gridPreviewTile = new Tile(gridPreviewCanvas, w.id, w.bpm, 1.0);
    gridPreviewTile.idleWave = true;
  }else if(gridPreviewTile.fragId !== w.id){
    gridPreviewTile.load(w.id, w.bpm);
  }
  gridPreviewTile.idlePhase = index * 1.7;
  gridPreviewCell = cell;
  cell.prepend(gridPreviewCanvas);
  gridPreviewTile.resize();
  gridPreviewTile.draw();
  ensureApiShader(w.id);
}

function buildGrid(){
  if(state.gridReady) return;
  ALTS.forEach((w,i)=>{
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.setAttribute('aria-label', `Open ${w.name} wallpaper`);
    cell.setAttribute('aria-current', i===state.index ? 'true' : 'false');
    cell.dataset.api = String(!!w.apiAvailable);
    cell.style.background = wallpaperFallback(w);
    cell.style.setProperty('--d', (i*42)+'ms');
    cell.innerHTML =
      `<span class="cell-source">${w.apiAvailable ? 'API' : 'Bundled'}</span>`+
      `<div class="cell-tag"><span class="c-num">${w.n}</span><span class="c-name">${w.name}</span></div>`;
    cell.addEventListener('click', ()=> Wallpaper.openImmersive(i, cell));
    cell.addEventListener('pointerenter', ()=>activateGridPreview(i, cell));
    cell.addEventListener('focus', ()=>activateGridPreview(i, cell));
    gridEl.appendChild(cell);
    // One shared live canvas moves between cards on hover/focus. Creating a
    // WebGL context per card exceeds browser limits and makes later cards black.
    gridTiles.push({tile:null, cell});
  });
  state.gridReady = true;
  refreshShaderApiUi();
}

/* openGrid / openImmersive / FLIP now live on the Wallpaper singleton above. */

/* show/hide the grid overlay deterministically (visibility doesn't depend on a transition timer) */
function setGridVisible(v){
  [gridScrim, $('#gridScroll'), $('#gridHead')].forEach(el=>{
    if(el) el.style.visibility = v ? 'visible' : 'hidden';
  });
  $('#gridScroll')?.setAttribute('aria-hidden', String(!v));
  setElementInert($('#gridScroll'), !v);
}

/* ---- idle / auto-hide chrome ---- */
function wake(){
  state.idle = false;
  stage.classList.remove('idle');
  clearTimeout(idleTimer);
  if(RM) return;
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
  const typing = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName||'') || e.target.isContentEditable;
  if(typing) return;
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

/* ---- floating utility dock ---- */
const dock = $('#topR'), dockToggle = $('#dockToggle'), dockMenu = $('#dockMenu');
function setDockOpen(open){
  dock?.classList.toggle('dock-open', !!open);
  dockToggle?.setAttribute('aria-expanded', String(!!open));
  dockToggle?.setAttribute('aria-label', open ? 'Close tools' : 'Open tools');
}
dockToggle?.addEventListener('click', event=>{
  event.stopPropagation();
  setDockOpen(!dock?.classList.contains('dock-open'));
});
dockMenu?.addEventListener('click', event=>{
  if(event.target.closest('button')) requestAnimationFrame(()=>setDockOpen(false));
});
window.addEventListener('pointerdown', event=>{
  if(dock?.classList.contains('dock-open') && !dock.contains(event.target)) setDockOpen(false);
}, { passive:true });

/* ---- Spotify library panel ---- */
function openSpotifyPanel(){
  openManagedDialog($('#spotifyPanel'), {
    trigger:$('#btnSpotify'),
    bodyClass:'spotify-mode',
    firstFocus:'#spotifyCloseBtn',
  });
}
function closeSpotifyPanel(){
  closeManagedDialog($('#spotifyPanel'), { trigger:$('#btnSpotify') });
}
$('#btnSpotify').addEventListener('click', openSpotifyPanel);
$('#spotifyClose').addEventListener('click', closeSpotifyPanel);
$('#spotifyCloseBtn').addEventListener('click', closeSpotifyPanel);

renderRecentlyPlayed();

/* ---- Focus mode panel ---- */
function openFocusPanel(){
  openManagedDialog($('#focusPanel'), {
    trigger:$('#btnFocus'),
    bodyClass:'focus-mode-panel',
    firstFocus:'#focusCloseBtn',
    onOpen:()=>{ if(typeof focusOnOpen === 'function') focusOnOpen(); },
  });
}
function closeFocusPanel(){
  closeManagedDialog($('#focusPanel'), { trigger:$('#btnFocus') });
}
$('#btnFocus').addEventListener('click', openFocusPanel);
$('#focusClose').addEventListener('click', closeFocusPanel);
$('#focusCloseBtn').addEventListener('click', closeFocusPanel);

/* ---- reactivity preset picker: Auto follows each wallpaper, else force one ---- */
const reactToggle = $('#reactToggle');
function refreshReactScales(){
  heroes.forEach(h=> h.reactScale = reactivityPlugin.scaleFor(h.fragId));
  if(gridPreviewTile) gridPreviewTile.reactScale = reactivityPlugin.scaleFor(gridPreviewTile.fragId);
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
  [...$('#reactPicker').children].forEach(x=>{
    const active = x===b;
    x.classList.toggle('on', active);
    x.setAttribute('aria-pressed', String(active));
  });
  setReactProfile(b.dataset.p);
});
setReactEnabled(true);
// dedicated handler: S opens the panel, Esc closes it (main handler early-returns
// while the panel is up because state.searchOpen is set).
window.addEventListener('keydown', (e)=>{
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName||'') || e.target.isContentEditable;
  const spOpen = $('#spotifyPanel').classList.contains('show');
  const fcOpen = $('#focusPanel').classList.contains('show');
  const translationOpen = translationSettingsPanel?.classList.contains('show');
  if(e.key==='Tab' && activeDialog){ trapDialogFocus(activeDialog, e); return; }
  if(e.key==='Escape'){
    if(spOpen) closeSpotifyPanel();
    if(fcOpen) closeFocusPanel();
    if(translationOpen) closeTranslationSettings();
    return;
  }
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
let lastLocalizeAhead = 0;
function frame(now){
  AUDIO.update(now/1000);
  playerControls.update();
  if(typeof syncVideoOverlay === 'function') syncVideoOverlay();
  if(typeof syncTranslatedVocals === 'function') syncTranslatedVocals();
  updateLiveLyric();
  // Pre-translate the upcoming lyric window just-in-time (throttled — the work
  // is network-bound and cached server-side, so a few times a second is plenty).
  if(nowPlaying && AUDIO.mode==='stream' && typeof localizeAhead==='function'
     && now - lastLocalizeAhead > 600){
    lastLocalizeAhead = now;
    localizeAhead(player.currentTime*1000);
  }
  if(typeof EQ==='object'){ EQ.update(); EQ.draw(eqCanvas); }
  // ambient centered lyric — persists over the shader while a track streams in
  // the immersive view; hidden in grid/search/spotify or when not streaming.
  if(lyricsVisible && nowPlaying && AUDIO.mode==='stream' && state.mode==='immersive'
     && !state.searchOpen && typeof currentLyricTiming==='function'){
    const elapsedMs = player.currentTime*1000;
    const timing = currentLyricTiming(elapsedMs);
    const line = timing ? timing.line.text : '';
    const comparisonText = timing && wantsCenterLyricComparison()
      ? (timing.line.localized || 'Translating...')
      : '';
    const comparisonActiveWord = timing && timing.line.localized
      ? activeLyricWordIndex(timing.line.localized, timing, elapsedMs)
      : -1;
    const comparisonLabel = selectedLyricLocaleLabel() || 'Translation';
    const activeWord = activeLyricWordIndex(line, timing, elapsedMs);
    setCenterLyric(line, activeWord, comparisonText, comparisonActiveWord, comparisonLabel, true);
    updateCenterLyricWord(line, activeWord, comparisonText, comparisonActiveWord, comparisonLabel);
    // glow breathes with the audio across the active lyric line's time range
    if(lyricLast){
      const g = Math.min(1, AUDIO.vocal*0.65 + AUDIO.level*0.45 + AUDIO.pulse*0.25);
      const glow = `0 2px 40px rgba(0,0,0,.5), 0 0 ${(10 + g*48).toFixed(1)}px rgba(255,255,255,${(0.12 + g*0.55).toFixed(3)})`;
      lyricLineEl.style.textShadow = glow;
      if(lyricCompareLineEl && comparisonText && comparisonText !== 'Translating...'){
        lyricCompareLineEl.style.textShadow = glow;
      }
    }
  } else {
    setCenterLyric('');
  }
  if(state.mode==='immersive' || state.transitioning){
    heroes[front].draw();
    if(state.crossfading || state.transitioning) heroes[1-front].draw();
  }
  if(state.mode==='grid' || state.transitioning){
    if(gridPreviewTile) gridPreviewTile.draw();
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', ()=>{
  heroes.forEach(h=> h.resize());
  if(gridPreviewTile) gridPreviewTile.resize();
});

/* ---- boot ---- */
setGridVisible(false);
reflect();
heroEls[front].style.opacity = 1;
heroEls[1-front].style.opacity = 0;
setStatus('synthetic', false);
syncShaderCatalogue();
requestAnimationFrame(frame);
wake();

// A shareable direct route makes the shader collection discoverable without
// requiring users to know the dock or keyboard shortcut first.
if(new URLSearchParams(location.search).get('view') === 'shaders'){
  Wallpaper.openGrid(true);
}
