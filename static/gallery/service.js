/* Phase · Field — service layer: real track resolution, streaming playback,
   lyrics, autocomplete. The streamed track feeds the audio engine (AUDIO) so the
   current wallpaper reacts to whatever is playing. Caption/lyric updates go through
   the globals renderNowPlaying() / player consumed by app.js. */

const streamEl = document.getElementById('streamEl');
const playbackSettings = {
  loopCurrentTrack:true,
};
const playbackRules = new PlaybackRuleSet([
  new LoopTrackRule({ enabled:()=>playbackSettings.loopCurrentTrack }),
]);
const player = new AudioPlayer(streamEl, { rules:playbackRules });
const videoHero = document.getElementById('videoHero');
const videoEl = document.getElementById('videoEl');
let videoSearchController = null;

function clearTrackVideo(){
  if(videoSearchController){
    videoSearchController.abort();
    videoSearchController = null;
  }
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.removeAttribute('poster');
  videoEl.load();
  videoHero.classList.remove('loading');
  videoHero.classList.add('hidden');
}

/* Point the single shared <video> at a search result. Reused by the automatic
   per-track loader and by manual picks from the video search modal, so there is
   only ever one decoder and one stream in flight. Selecting a modal result is
   fast because /api/video/search pre-warms the stream cache for every entry. */
function applyVideo(video, { autoplay=false }={}){
  if(!video || !video.video_stream_url) return clearTrackVideo();
  videoEl.poster = video.thumbnail || '';
  videoEl.src = video.video_stream_url;
  videoHero.classList.remove('hidden', 'loading');
  if(autoplay) videoEl.play().catch(()=>{});   // muted hero → autoplay is allowed
}

async function loadVideoForTrack(track, kind='music_video'){
  clearTrackVideo();
  if(!track || !track.title) return;

  const controller = new AbortController();
  videoSearchController = controller;
  const params = new URLSearchParams({ title:track.title, kind, limit:'1' });
  if(track.artist) params.set('artist', track.artist);
  videoHero.classList.add('loading');

  try{
    const response = await fetch(`/api/video/search?${params.toString()}`, {
      signal:controller.signal,
    });
    if(!response.ok) throw new Error('video search ' + response.status);
    const videos = await response.json();
    const video = videos[0];
    if(controller.signal.aborted || videoSearchController !== controller) return;
    if(!video || !video.video_stream_url) return clearTrackVideo();
    applyVideo(video);
  }catch(e){
    if(e.name !== 'AbortError') console.warn('loadVideoForTrack', e);
    if(videoSearchController === controller) clearTrackVideo();
  }finally{
    if(videoSearchController === controller) videoSearchController = null;
  }
}

/* pull a representative colour out of the cover art (best-effort; falls back to
   neutral if the image is cross-origin and the canvas is tainted). */
function extractAccent(url){
  player.accent = [1, 1, 1];
  if(!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = ()=>{
    try{
      const s = 14, c = document.createElement('canvas'); c.width=s; c.height=s;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, s, s);
      const d = ctx.getImageData(0, 0, s, s).data;
      let r=0,g=0,b=0,wsum=0;
      for(let i=0;i<d.length;i+=4){
        const rr=d[i],gg=d[i+1],bb=d[i+2];
        const mx=Math.max(rr,gg,bb), mn=Math.min(rr,gg,bb);
        const w = 0.25 + (mx-mn)/255;            // favour saturated pixels
        r+=rr*w; g+=gg*w; b+=bb*w; wsum+=w;
      }
      if(wsum>0){
        const a=[r/wsum/255, g/wsum/255, b/wsum/255];
        const m=Math.max(a[0],a[1],a[2])||1;        // normalize to a hue tint (max=1)
        player.accent = [a[0]/m, a[1]/m, a[2]/m];
      }
    }catch(e){ /* tainted (CORS) → keep neutral */ }
  };
  img.onerror = ()=>{};
  img.src = url;
}

/* per-track ReccoBeats features → TrackVisualProfile (the track-level visual
   prior). Optional layer: no Spotify id, a failed fetch, or missing fields all
   leave the profile NEUTRAL so the shaders keep running on live FFT alone. */
async function fetchTrackFeatures(spotifyId){
  trackFeatures = null; buildTrackVisualProfile();          // reset to neutral
  if(!spotifyId) return;
  try{
    const r = await fetch(`/api/focus/track/${encodeURIComponent(spotifyId)}`);
    if(!r.ok) return;                                        // 404/403 → stay neutral
    trackFeatures = await r.json(); buildTrackVisualProfile();
  }catch(e){ /* network/parse error → stay neutral */ }
}

/* resolve a track to a playable source, stream it, and react to it */
async function loadTrack(s){
  clearTrackVideo();
  const spotifyId = s.spotifyId || s.spotify_id || s.provider_track_id || null;
  s = { ...s, spotifyId };
  player.setTrack(s);
  player.setLyrics();
  extractAccent(s.thumbnail);
  fetchTrackFeatures(spotifyId);
  if(typeof renderNowPlaying === 'function') renderNowPlaying(s, 'resolving…');
  const query = [s.title, s.artist].filter(Boolean).join(' ');
  try{
    const params = new URLSearchParams({ query, limit:'1' });
    if(s.duration)     params.set('target_duration', String(s.duration));
    if(s.title)        params.set('expected_title', s.title);
    if(s.artist)       params.set('expected_artist', s.artist);
    if(s.album)        params.set('expected_album', s.album);
    if(s.release_year) params.set('expected_year', String(s.release_year));
    const r = await fetch(`/api/search?${params.toString()}`);
    if(!r.ok) return fail(s, 'no source');
    const results = await r.json();
    if(!results || !results.length) return fail(s, 'no source');
    const result = results[0];
    const merged = { ...s, ...result, spotifyId,
      title:  result.title  || s.title,
      artist: result.artist || s.artist,
      album:  result.album  || s.album };
    player.setTrack(merged);
    const duration = result.duration || s.duration || 0;
    if(typeof renderNowPlaying === 'function') renderNowPlaying(merged, 'streaming');
    player.loadSource(`/api/stream?url=${encodeURIComponent(result.webpage_url)}`, {
      webpageUrl:result.webpage_url,
      duration,
    });
    AUDIO.useStream(player.media);
    player.play().catch(()=>{});
    loadVideoForTrack({
      ...merged,
      title:s.title || merged.title,
      artist:s.artist || merged.artist,
    });
    loadLyrics({ title:merged.title, artist:merged.artist, album:merged.album, duration,
                 webpageUrl:result.webpage_url });
  }catch(e){ console.warn('loadTrack', e); fail(s, 'error'); }
}
function fail(s, msg){ if(typeof renderNowPlaying === 'function') renderNowPlaying(s, msg); }

/* selected lyric target locale ('' = original language only) and the last
   track we fetched lyrics for, so the language picker can re-localize live. */
let lyricLocale = '';
let lastLyricsMeta = null;

/* token guarding async lyric work so a track change (or relocalize) cancels any
   in-flight look-ahead / transcription poll that belongs to the previous load. */
let lyricsToken = 0;

async function loadLyrics(meta){
  if(meta) lastLyricsMeta = meta;
  meta = meta || lastLyricsMeta;
  if(!meta) return;
  const token = ++lyricsToken;
  player.setLyrics();
  try{
    const params = new URLSearchParams({ title:meta.title||'', artist:meta.artist||'' });
    if(meta.album)    params.set('album', meta.album);
    if(meta.duration) params.set('duration', Math.round(meta.duration));
    if(lyricLocale)   params.set('locale', lyricLocale);
    const r = await fetch(`/api/lyrics?${params.toString()}`);
    if(token !== lyricsToken) return;
    if(!r.ok) return;
    const data = await r.json();
    let lines = [];
    // Prefer the structured lines — they carry timing AND localized_text. Keep
    // `i` = the line's index in data.lines so look-ahead localization addresses
    // the same lines the backend cached.
    if(Array.isArray(data.lines) && data.lines.length && data.lines.some(l=>l.start_time_ms!=null)){
      lines = data.lines
        .map((l,i)=>({ i, ms:l.start_time_ms, text:l.text, localized:l.localized_text||'' }))
        .filter(l=>l.text && l.ms!=null);
    } else if(data.synced_lyrics){
      data.synced_lyrics.split('\n').forEach((line,i)=>{
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        if(m && m[3]) lines.push({ i, ms:(parseInt(m[1])*60 + parseFloat(m[2]))*1000, text:m[3], localized:'' });
      });
    } else if(data.plain_lyrics){
      lines = data.plain_lyrics.split('\n').filter(l=>l.trim()).map((l,i)=>({ i, ms:i*4000, text:l, localized:'' }));
    }
    if(lines.length){ player.setLyrics(lines); return; }
    // No LRC for this track — fall back to live transcription (best effort).
    ensureTranscript(meta, token);
  }catch(e){ /* no lyrics */ }
}

/* Transcription fallback: poll /api/lyrics/transcribe until lines are ready,
   then treat them like LRC lines so the same live-display + look-ahead path
   applies. Guarded by the lyrics token so a track change stops the poll. */
async function ensureTranscript(meta, token, attempt=0){
  if(token !== lyricsToken || !meta || !meta.webpageUrl) return;
  if(attempt > 40) return;                                    // ~2 min ceiling
  try{
    const params = new URLSearchParams({
      title:meta.title||'', artist:meta.artist||'', url:meta.webpageUrl,
    });
    const r = await fetch(`/api/lyrics/transcribe?${params.toString()}`);
    if(token !== lyricsToken) return;
    if(!r.ok) return;
    const data = await r.json();
    if(data.status === 'ready' && Array.isArray(data.lines) && data.lines.length){
      const lines = data.lines
        .map((l,i)=>({ i, ms:l.start_time_ms, text:l.text, localized:'' }))
        .filter(l=>l.text && l.ms!=null);
      player.setLyrics(lines);
      return;
    }
    if(data.status === 'pending'){
      setTimeout(()=> ensureTranscript(meta, token, attempt+1), 3000);
    }
  }catch(e){ /* transcription unavailable */ }
}

/* switch lyric target locale and re-fetch for the current track */
function setLyricLocale(locale){
  lyricLocale = locale || '';
  // Drop any already-fetched localizations so the new locale is requested fresh.
  player.lyrics.forEach(l=>{ l.localized = ''; });
  pendingLocalize.clear();
  return loadLyrics();
}

/* ── Just-in-time look-ahead localization ──────────────────────────────────
   As the playhead advances, translate the small window of upcoming lines that
   aren't localized yet, merging results into player.lyrics in place. Lines mid-
   request are tracked in pendingLocalize so we never ask twice. */
const pendingLocalize = new Set();
const LOOKAHEAD = 4;        // lines ahead of the playhead to pre-translate
let localizeInflight = false;

async function localizeAhead(elapsedMs){
  if(!lyricLocale || !lastLyricsMeta || localizeInflight) return;
  const L = player.lyrics;
  if(!L.length) return;

  // find the current line, then collect the next few that still need text
  let cur = 0;
  for(let k=0;k<L.length;k++){ if(L[k].ms <= elapsedMs) cur = k; else break; }
  const items = [];
  for(let k=cur; k<L.length && items.length<=LOOKAHEAD; k++){
    const line = L[k];
    if(line.localized || pendingLocalize.has(line.i)) continue;
    items.push({ index:line.i, text:line.text });
  }
  if(!items.length) return;

  const token = lyricsToken;
  items.forEach(it=> pendingLocalize.add(it.index));
  localizeInflight = true;
  try{
    const r = await fetch('/api/lyrics/localize-window', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        title:lastLyricsMeta.title||'', artist:lastLyricsMeta.artist||'',
        album:lastLyricsMeta.album||null,
        duration:lastLyricsMeta.duration ? Math.round(lastLyricsMeta.duration) : null,
        locale:lyricLocale, lines:items,
      }),
    });
    if(token !== lyricsToken) return;                         // track changed mid-flight
    if(!r.ok) return;
    const data = await r.json();
    const map = data.localized || {};
    player.lyrics.forEach(line=>{
      const t = map[String(line.i)];
      if(t) line.localized = t;
    });
  }catch(e){ /* leave originals showing */ }
  finally{
    items.forEach(it=> pendingLocalize.delete(it.index));
    localizeInflight = false;
  }
}

/* active lyric line object {text, localized} by elapsed ms, or null */
function currentLyricLine(elapsedMs){
  const L = player.lyrics;
  if(!L.length) return null;
  let cur = null;
  for(let i=0;i<L.length;i++){ if(L[i].ms <= elapsedMs) cur = L[i]; else break; }
  return cur;
}

/* current lyric line text for the ambient caption, by elapsed ms */
function currentLyric(elapsedMs){
  const line = currentLyricLine(elapsedMs);
  return line ? line.text : '';
}

/* short source badge for a search result */
function srcShortFor(s){
  const src = s.source || s.artwork_source || '';
  if(src.includes('spotify') && src.includes('musicbrainz')) return '★';
  if(src.includes('spotify')) return 'SP';
  if(src.includes('musicbrainz') || s.artwork_source==='cover_art_archive') return 'MB';
  if(src === 'youtube' || s.artwork_source==='youtube') return 'YT';
  return '✷';
}

/* raw autocomplete fetch — caller handles debounce/cache/abort */
async function fetchAutocomplete(query, signal){
  const r = await fetch(`/api/autocomplete?query=${encodeURIComponent(query)}&limit=8`, { signal });
  if(!r.ok) throw new Error('autocomplete ' + r.status);
  return r.json();
}

/* ─── Video search modal ───────────────────────────────────────────────────
   Lets the user browse alternative videos for the current track and swap the
   one shown in #videoHero. It reuses /api/video/search (which pre-warms the
   per-entry stream cache) and the single shared <video> via applyVideo(), so a
   pick streams from a warm cache with no extra decoder. Searches are debounced
   and abortable to keep the network quiet while typing. */
(function videoModal(){
  const modal   = document.getElementById('videoModal');
  const scrim   = document.getElementById('videoModalClose');
  const closeBt = document.getElementById('videoModalCloseBtn');
  const trigger = document.getElementById('videoSearchBtn');
  const input   = document.getElementById('videoQuery');
  const drop    = document.getElementById('videoResults');
  const kindBtns = [...document.querySelectorAll('.vm-kind')];
  if(!modal || !trigger) return;

  const MIN = 2;            // don't search on a single character
  const DEBOUNCE = 380;     // video search hits yt-dlp (slow, 30/min) — type before firing
  const KIND_BADGE = { music_video:'MV', live:'LIVE', shorts:'SH' };

  let kind = 'music_video';
  let results = [], sel = -1;
  let controller = null, debounce = null, reqId = 0;
  const cache = new Map();   // `${kind}\n${q}` → pool, so re-typing / kind toggles are instant

  function fmtDur(s){
    s = Math.max(0, s|0);
    const h = s/3600|0, m = (s%3600)/60|0, sec = s%60, p = n=>String(n).padStart(2,'0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
  }

  function reveal(v){
    drop.classList.toggle('open', v);
    input.setAttribute('aria-expanded', String(v));
    if(!v){ results = []; sel = -1; }
  }

  /* a single .r-empty line — reused for the no-query, no-results and error states */
  function message(text, isErr){
    results = []; sel = -1;
    drop.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'r-empty' + (isErr ? ' err' : '');
    div.textContent = text;
    drop.appendChild(div);
    reveal(true);
  }

  /* shimmer skeleton rows that fill the multi-second wait while yt-dlp resolves */
  function skeleton(){
    drop.innerHTML = '';
    for(let i=0;i<3;i++){
      const row = document.createElement('div');
      row.className = 'result r-skel';
      row.innerHTML = '<span class="r-art"></span><span class="r-body">'
        + '<span class="sk w1"></span><span class="sk w2"></span></span>';
      drop.appendChild(row);
    }
    reveal(true);
  }

  function renderResults(pool){
    results = pool; sel = pool.length ? 0 : -1;
    if(!pool.length){ message(`No videos for “${input.value.trim()}”.`); return; }
    drop.innerHTML = '';
    pool.forEach((v, idx)=>{
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'result';
      row.setAttribute('role', 'option');
      row.dataset.idx = idx;
      row.setAttribute('aria-selected', idx === 0);

      const art = document.createElement('span');
      art.className = 'r-art';
      if(v.thumbnail){
        const img = document.createElement('img');
        img.loading = 'lazy'; img.alt = ''; img.src = v.thumbnail;
        art.appendChild(img);
      } else {
        const ph = document.createElement('span');
        ph.className = 'r-ph'; ph.textContent = '▶';
        art.appendChild(ph);
      }
      const badge = document.createElement('span');
      badge.className = 'r-src'; badge.textContent = KIND_BADGE[v.kind] || 'YT';
      art.appendChild(badge);

      const body = document.createElement('span');
      body.className = 'r-body';
      const name = document.createElement('span');
      name.className = 'r-name'; name.textContent = v.title || 'Untitled video';
      const meta = document.createElement('span');
      meta.className = 'r-meta'; meta.textContent = v.channel || '—';
      body.append(name, meta);

      row.append(art, body);
      if(v.duration){
        const dur = document.createElement('span');
        dur.className = 'r-conf dur'; dur.textContent = fmtDur(v.duration);
        row.appendChild(dur);
      }

      row.addEventListener('mousedown', e=> e.preventDefault());   // keep input focus through click
      row.addEventListener('click', ()=> choose(idx));
      row.addEventListener('pointermove', ()=> setSel(idx));
      drop.appendChild(row);
    });
    reveal(true);
  }

  function setSel(i){
    if(!results.length) return;
    sel = (i + results.length) % results.length;
    const opts = [...drop.querySelectorAll('.result')];
    opts.forEach((el, idx)=> el.setAttribute('aria-selected', idx === sel));
    const cur = opts[sel];
    if(cur){
      const top = cur.offsetTop, bot = top + cur.offsetHeight;
      if(top < drop.scrollTop) drop.scrollTop = top - 6;
      else if(bot > drop.scrollTop + drop.clientHeight) drop.scrollTop = bot - drop.clientHeight + 6;
    }
  }

  function choose(i){
    const v = results[i];
    if(!v || !v.video_stream_url) return;
    if(videoSearchController){            // cancel a pending auto-load so it can't override the pick
      videoSearchController.abort();
      videoSearchController = null;
    }
    applyVideo(v, { autoplay:true });
    close();
  }

  async function runSearch(){
    const q = input.value.trim();
    clearTimeout(debounce);
    if(controller){ controller.abort(); controller = null; }
    if(q.length < MIN){ reveal(false); drop.innerHTML = ''; return; }

    const key = `${kind}\n${q.toLowerCase()}`;
    if(cache.has(key)){ renderResults(cache.get(key)); return; }

    const mine = ++reqId;
    const ctrl = new AbortController(); controller = ctrl;
    skeleton();
    const params = new URLSearchParams({ title:q, kind, limit:'6' });
    try{
      const r = await fetch(`/api/video/search?${params}`, { signal:ctrl.signal });
      if(mine !== reqId) return;                          // superseded by a newer search
      if(r.status === 429){ message('Searching too fast — give it a moment.', true); return; }
      if(!r.ok) throw new Error('video search ' + r.status);
      const pool = await r.json();
      if(mine !== reqId) return;
      cache.set(key, pool);
      renderResults(pool);
    }catch(e){
      if(e.name === 'AbortError' || mine !== reqId) return;
      console.warn('videoModal search', e);
      message('Couldn’t load videos — press Enter to retry.', true);
    }finally{
      if(controller === ctrl) controller = null;
    }
  }

  function scheduleSearch(){
    clearTimeout(debounce);
    debounce = setTimeout(runSearch, DEBOUNCE);
  }

  function open(){
    const cur = player?.current;
    input.value = [cur?.artist, cur?.title].filter(Boolean).join(' ');
    modal.classList.add('show');
    requestAnimationFrame(()=>{ input.focus(); input.select(); });
    runSearch();                                          // seed search runs immediately, no debounce
  }

  function close(){
    modal.classList.remove('show');
    clearTimeout(debounce);
    if(controller){ controller.abort(); controller = null; }
    reveal(false);
  }

  trigger.addEventListener('click', open);
  scrim.addEventListener('click', close);
  closeBt.addEventListener('click', close);
  input.addEventListener('input', scheduleSearch);
  input.addEventListener('keydown', e=>{
    const isOpen = drop.classList.contains('open') && results.length;
    switch(e.key){
      case 'ArrowDown': e.preventDefault(); isOpen ? setSel(sel + 1) : runSearch(); break;
      case 'ArrowUp':   e.preventDefault(); if(isOpen) setSel(sel - 1); break;
      case 'Enter':     e.preventDefault(); sel >= 0 ? choose(sel) : runSearch(); break;
    }
  });
  kindBtns.forEach(btn=>btn.addEventListener('click', ()=>{
    if(btn.dataset.kind === kind) return;
    kind = btn.dataset.kind;
    kindBtns.forEach(b=>{
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    runSearch();                                          // instant if this kind+query is cached
  }));
  // Keep keystrokes inside the modal: the gallery's global hotkeys (space, arrows,
  // letters, digits in app.js) have no typing guard, so stop them from bubbling
  // out while the modal is focused. Escape closes.
  modal.addEventListener('keydown', e=>{
    e.stopPropagation();
    if(e.key === 'Escape') close();
  });
})();
