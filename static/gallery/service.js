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
const videoModeBtn = document.getElementById('videoModeBtn');
let videoSearchController = null;
let videoOverlayEnabled = (()=>{ try{ return localStorage.getItem('videoOverlayMode') === '1'; }catch(e){ return false; } })();
let lastVideoSyncSeek = 0;

streamEl.preload = 'auto';
streamEl.playsInline = true;
streamEl.setAttribute('webkit-playsinline', '');

if(videoEl){
  videoEl.muted = true;
  videoEl.defaultMuted = true;
  videoEl.playsInline = true;
  videoEl.controls = false;
}

function syncMediaSession(track = player.current){
  if(!('mediaSession' in navigator) || !track) return;
  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Untitled',
      artist: track.artist || '',
      album: track.album || '',
      artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
  }catch(e){ /* unsupported metadata shape */ }
  try{
    navigator.mediaSession.playbackState = player.isPlaying ? 'playing' : 'paused';
  }catch(e){ /* ignore */ }
}

function setMediaSessionHandlers(){
  if(!('mediaSession' in navigator)) return;
  try{
    navigator.mediaSession.setActionHandler('play', ()=> player.play().catch(()=>{}));
    navigator.mediaSession.setActionHandler('pause', ()=> player.pause());
    navigator.mediaSession.setActionHandler('stop', ()=> player.pause());
    navigator.mediaSession.setActionHandler('seekbackward', details=>{
      const delta = Number(details?.seekOffset || 10);
      player.seekTo(player.currentTime - delta);
    });
    navigator.mediaSession.setActionHandler('seekforward', details=>{
      const delta = Number(details?.seekOffset || 10);
      player.seekTo(player.currentTime + delta);
    });
    navigator.mediaSession.setActionHandler('seekto', details=>{
      if(typeof details?.seekTime === 'number') player.seekTo(details.seekTime);
    });
  }catch(e){ /* some browsers only expose a subset of actions */ }
}

function restorePlaybackAfterLifecycleChange(){
  if(AUDIO?.ctx && AUDIO.ctx.state === 'suspended'){
    AUDIO.ctx.resume().catch(()=>{});
  }
  if(player.isPlaying){
    player.play().catch(()=>{});
  }
  if(videoOverlayEnabled && videoEl?.src && !videoEl.paused && player.isPlaying){
    videoEl.play().catch(()=>{});
  }
  if(translatedVocalsEnabled && translatedVocalEl?.src && !translatedVocalEl.paused && player.isPlaying){
    translatedVocalEl.play().catch(()=>{});
  }
  syncMediaSession();
}

streamEl.addEventListener('play', ()=> syncMediaSession());
streamEl.addEventListener('pause', ()=> syncMediaSession());
streamEl.addEventListener('ended', ()=> syncMediaSession());
window.addEventListener('pageshow', restorePlaybackAfterLifecycleChange);
document.addEventListener('visibilitychange', ()=>{
  if(!document.hidden) restorePlaybackAfterLifecycleChange();
});
window.addEventListener('focus', ()=>{
  if(!document.hidden) restorePlaybackAfterLifecycleChange();
});
setMediaSessionHandlers();

function setVideoOverlayMode(enabled){
  videoOverlayEnabled = !!enabled;
  try{ localStorage.setItem('videoOverlayMode', videoOverlayEnabled ? '1' : '0'); }catch(e){ /* ignore */ }
  document.body.classList.toggle('video-mode', videoOverlayEnabled);
  videoHero?.classList.toggle('video-mode', videoOverlayEnabled);
  videoModeBtn?.setAttribute('aria-pressed', String(videoOverlayEnabled));
  if(videoOverlayEnabled && videoHero && !videoEl?.src && player.current){
    loadVideoForTrack(player.current);
  }
  if(videoOverlayEnabled && videoEl?.src && player.isPlaying){
    videoEl.play().catch(()=>{});
  } else {
    videoEl?.pause();
  }
}

function clearTrackVideo(){
  if(videoSearchController){
    videoSearchController.abort();
    videoSearchController = null;
  }
  if(!videoEl || !videoHero) return;
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.removeAttribute('poster');
  videoEl.load();
  videoHero.classList.remove('loading', 'ready');
  videoHero.classList.add('hidden');
}

/* Point the single shared <video> at a search result. Reused by the automatic
   per-track loader and by manual picks from the video search modal, so there is
   only ever one decoder and one stream in flight. Selecting a modal result is
   fast because /api/video/search pre-warms the stream cache for every entry. */
function applyVideo(video, { autoplay=false }={}){
  if(!video || !video.video_stream_url) return clearTrackVideo();
  if(!videoEl || !videoHero) return;
  videoEl.poster = video.thumbnail || '';
  videoEl.muted = true;
  videoEl.src = video.video_stream_url;
  videoHero.classList.remove('hidden', 'loading');
  videoHero.classList.add('ready');
  lastVideoSyncSeek = 0;
  syncVideoOverlay({ force:true });
  if((autoplay || videoOverlayEnabled) && player.isPlaying) videoEl.play().catch(()=>{});
}

function syncVideoOverlay({ force=false }={}){
  if(!videoEl || !videoEl.src) return;
  if(!videoOverlayEnabled){
    if(!videoEl.paused) videoEl.pause();
    return;
  }
  videoEl.muted = true;
  const duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
  const audioTime = player.currentTime || 0;
  const target = duration ? Math.min(Math.max(0, audioTime), Math.max(0, duration - 0.08)) : Math.max(0, audioTime);
  const now = performance.now();
  const drift = Math.abs((videoEl.currentTime || 0) - target);
  if((force || drift > 0.35) && videoEl.readyState >= 1 && now - lastVideoSyncSeek > 180){
    try{ videoEl.currentTime = target; lastVideoSyncSeek = now; }catch(e){ /* media not seekable yet */ }
  }
  if(player.isPlaying){
    if(videoEl.paused) videoEl.play().catch(()=>{});
  } else if(!videoEl.paused){
    videoEl.pause();
  }
}

videoModeBtn?.addEventListener('click', ()=> setVideoOverlayMode(!videoOverlayEnabled));
videoEl?.addEventListener('loadedmetadata', ()=> syncVideoOverlay({ force:true }));
setVideoOverlayMode(videoOverlayEnabled);

async function loadVideoForTrack(track, kind='music_video'){
  clearTrackVideo();
  if(!track || !track.title) return;

  const controller = new AbortController();
  videoSearchController = controller;
  const params = new URLSearchParams({ title:track.title, kind, limit:'1' });
  if(track.artist) params.set('artist', track.artist);
  videoHero.classList.remove('hidden');
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

/* Audio is fetched straight from the backend so its bytes skip the CDN, while
   every other call stays same-origin and is proxied there. Empty when unset,
   which keeps local development and a backend-hosted shell on relative paths. */
function phaseBackendOrigin(){
  return (typeof window!=='undefined' && window.__PHASE_BACKEND_ORIGIN__) || '';
}
function isPhaseStreamOrigin(origin){
  return origin === window.location.origin || (!!phaseBackendOrigin() && origin === phaseBackendOrigin());
}
function toPhaseStreamUrl(path){
  const origin = phaseBackendOrigin();
  return origin && path.startsWith('/') ? `${origin}${path}` : path;
}

/* resolve a track to a playable source, stream it, and react to it */
function normalizePackagedStream(stream){
  if(!stream) return '';
  try{
    const parsed=new URL(stream, window.location.origin);
    if(!isPhaseStreamOrigin(parsed.origin) || !['/api/stream','/stream'].includes(parsed.pathname)) return '';
    if(!parsed.searchParams.get('url')) return '';
    return `${parsed.pathname}${parsed.search}`;
  }catch(_error){ return ''; }
}

/* Convert every provider/search/share payload to the one track shape consumed
   by Phase. Provider ids stay namespaced: only Spotify ids may request Spotify
   audio features. */
function normalizePhaseTrack(source={}){
  const provider=source.provider||source.source_provider||source.source||null;
  const providerTrackId=source.providerTrackId||source.provider_track_id||null;
  const spotifyId=source.spotifyId||source.spotify_id||
    (provider==='spotify'?providerTrackId:null);
  return {
    ...source,
    provider,
    providerTrackId,
    spotifyId,
    title:source.title||'Untitled track',
    artist:source.artist||(Array.isArray(source.artist_names)?source.artist_names.join(', '):''),
    duration:Number(source.duration||0),
    release_year:source.release_year||source.releaseYear||undefined,
  };
}

let trackLoadSequence = 0;
let trackSearchController = null;
async function loadTrack(s, { packagedLyrics=null, packagedStream='' } = {}){
  const loadId = ++trackLoadSequence;
  if(trackSearchController){ trackSearchController.abort(); trackSearchController = null; }
  player.pause();
  streamEl.removeAttribute('src');
  streamEl.load();
  clearTrackVideo();
  closeTranscriptStream();
  lyricsToken++;
  if(typeof stopTranslatedVocals === 'function') stopTranslatedVocals({ clear:true });
  s = normalizePhaseTrack(s);
  const spotifyId = s.spotifyId;
  player.setTrack(s);
  player.setLyrics();
  extractAccent(s.thumbnail);
  fetchTrackFeatures(spotifyId);
  if(typeof renderNowPlaying === 'function') renderNowPlaying(s, 'resolving…');
  const query = [s.title, s.artist].filter(Boolean).join(' ');
  try{
    const exactStream=normalizePackagedStream(packagedStream);
    let result;
    if(exactStream){
      const sourcePage=(()=>{ try{ return new URL(exactStream,window.location.origin).searchParams.get('url') || ''; }catch(_error){ return ''; } })();
      result={ title:s.title, artist:s.artist, album:s.album, duration:s.duration,
        webpage_url:sourcePage, stream_url:exactStream };
    }else{
      const params = new URLSearchParams({ query, limit:'1' });
      if(s.duration)     params.set('target_duration', String(s.duration));
      if(s.title)        params.set('expected_title', s.title);
      if(s.artist)       params.set('expected_artist', s.artist);
      if(s.album)        params.set('expected_album', s.album);
      if(s.release_year) params.set('expected_year', String(s.release_year));
      const controller = new AbortController();
      trackSearchController = controller;
      const r = await fetch(`/api/search?${params.toString()}`, { signal:controller.signal });
      if(trackSearchController === controller) trackSearchController = null;
      if(loadId !== trackLoadSequence) return;
      if(!r.ok) return fail(s, 'no source');
      const results = await r.json();
      if(loadId !== trackLoadSequence) return;
      if(!results || !results.length) return fail(s, 'no source');
      result = results[0];
    }
    if(loadId !== trackLoadSequence) return;
    const merged = { ...s, ...result, spotifyId,
      title:  result.title  || s.title,
      artist: result.artist || s.artist,
      album:  result.album  || s.album };
    player.setTrack(merged);
    const duration = result.duration || s.duration || 0;
    if(typeof renderNowPlaying === 'function') renderNowPlaying(merged, 'streaming');
    const playbackUrl=toPhaseStreamUrl(exactStream || `/api/stream?url=${encodeURIComponent(result.webpage_url)}`);
    player.loadSource(playbackUrl, {
      webpageUrl:result.webpage_url,
      duration,
    });
    AUDIO.useStream(player.media);
    if(typeof recordRecentlyPlayed === 'function') recordRecentlyPlayed(merged);
    player.play().catch(()=>{});
    syncMediaSession(merged);
    if(typeof castBridge!=='undefined'){
      Promise.resolve(castBridge.setCurrent(merged, playbackUrl)).catch(()=>{});
    }
    loadVideoForTrack({
      ...merged,
      title:s.title || merged.title,
      artist:s.artist || merged.artist,
    });
    const lyricsMeta = { title:merged.title, artist:merged.artist, album:merged.album, duration,
      webpageUrl:result.webpage_url };
    if(Array.isArray(packagedLyrics) && packagedLyrics.length){
      // Preserve the exact translated timed lines from a shared link. Advance
      // the token and close stale work so a later network response cannot
      // replace the state the sender shared.
      lyricsToken++;
      closeTranscriptStream();
      lastLyricsMeta = lyricsMeta;
      player.setLyrics(packagedLyrics);
    }else{
      loadLyrics(lyricsMeta);
    }
  }catch(e){
    if(e.name === 'AbortError' || loadId !== trackLoadSequence) return;
    console.warn('loadTrack', e); fail(s, 'error');
  }
}
function fail(s, msg){ if(typeof renderNowPlaying === 'function') renderNowPlaying(s, msg); }

/* selected lyric target locale ('' = original language only) and the last
   track we fetched lyrics for, so the language picker can re-localize live. */
let lyricLocale = '';
let lastLyricsMeta = null;

/* token guarding async lyric work so a track change (or relocalize) cancels any
   in-flight look-ahead / transcription poll that belongs to the previous load. */
let lyricsToken = 0;
let activeTranscriptSource = null;
let transcriptUsesInlineTranslation = false;

function closeTranscriptStream(){
  if(activeTranscriptSource){
    activeTranscriptSource.close();
    activeTranscriptSource = null;
  }
  transcriptUsesInlineTranslation = false;
}

async function loadLyrics(meta){
  if(meta) lastLyricsMeta = meta;
  meta = meta || lastLyricsMeta;
  if(!meta) return;
  const token = ++lyricsToken;
  closeTranscriptStream();
  player.setLyrics();
  try{
    const params = new URLSearchParams({ title:meta.title||'', artist:meta.artist||'' });
    if(meta.album)    params.set('album', meta.album);
    if(meta.duration) params.set('duration', Math.round(meta.duration));
    if(lyricLocale)   params.set('locale', lyricLocale);
    const r = await fetch(`/api/lyrics?${params.toString()}`);
    if(token !== lyricsToken) return;
    if(!r.ok){
      if(r.status === 404) ensureTranscript(meta, token);
      return;
    }
    const data = await r.json();
    let lines = [];
    // Prefer the structured lines — they carry timing AND localized_text. Keep
    // `i` = the line's index in data.lines so look-ahead localization addresses
    // the same lines the backend cached.
    if(Array.isArray(data.lines) && data.lines.length && data.lines.some(l=>l.start_time_ms!=null)){
      lines = data.lines
        .map((l,i)=>({
          i,
          ms:l.start_time_ms,
          endMs:l.end_time_ms,
          text:l.text,
          localized:l.localized_text||'',
        }))
        .filter(l=>l.text && l.ms!=null);
    } else if(data.synced_lyrics){
      data.synced_lyrics.split('\n').forEach((line,i)=>{
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        if(m && m[3]) lines.push({
          i,
          ms:(parseInt(m[1])*60 + parseFloat(m[2]))*1000,
          endMs:null,
          text:m[3],
          localized:'',
        });
      });
    } else if(data.plain_lyrics){
      lines = data.plain_lyrics.split('\n').filter(l=>l.trim()).map((l,i)=>({
        i,
        ms:i*4000,
        endMs:(i+1)*4000,
        text:l,
        localized:'',
      }));
    }
    if(lines.length){
      transcriptUsesInlineTranslation = false;
      player.setLyrics(lines);
      return;
    }
    // No LRC for this track — stream progressive transcription events.
    ensureTranscript(meta, token);
  }catch(e){ /* no lyrics */ }
}

/* Progressive transcription fallback. CaptionLocalizer emits finalized source
   segments followed by translations for the selected locale. EventSource
   reconnects with Last-Event-ID, while the lyrics token prevents stale tracks
   from updating the current player. */
function ensureTranscript(meta, token){
  if(token !== lyricsToken || !meta || !meta.webpageUrl) return;
  closeTranscriptStream();
  transcriptUsesInlineTranslation = !!lyricLocale;
  const params = new URLSearchParams({
    title:meta.title||'', artist:meta.artist||'', url:meta.webpageUrl,
  });
  if(lyricLocale) params.set('locale', lyricLocale);
  const source = new EventSource(`/api/lyrics/transcribe/events?${params.toString()}`);
  activeTranscriptSource = source;

  source.addEventListener('final', event=>{
    if(token !== lyricsToken){ source.close(); return; }
    let data;
    try{ data = JSON.parse(event.data); }catch(e){ return; }
    if(!data.text || data.start_ms == null) return;
    const id = Number(data.segment_id);
    const lines = player.lyrics.slice();
    const existing = lines.find(line=>line.i === id);
    if(existing){
      existing.ms = data.start_ms;
      existing.endMs = data.end_ms;
      existing.text = data.text;
    } else {
      lines.push({
        i:id,
        ms:data.start_ms,
        endMs:data.end_ms,
        text:data.text,
        localized:'',
        confidence:data.confidence,
      });
    }
    lines.sort((a,b)=>a.ms-b.ms || a.i-b.i);
    player.setLyrics(lines);
  });

  source.addEventListener('translation', event=>{
    if(token !== lyricsToken){ source.close(); return; }
    let data;
    try{ data = JSON.parse(event.data); }catch(e){ return; }
    const line = player.lyrics.find(item=>item.i === Number(data.segment_id));
    if(line && data.text){
      line.localized = data.text;
      player.notify('lyrics', { reason:'translation', index:line.i });
    }
  });

  source.addEventListener('complete', ()=>{
    if(activeTranscriptSource === source) activeTranscriptSource = null;
    source.close();
  });
  source.addEventListener('cancelled', ()=>{
    if(activeTranscriptSource === source) activeTranscriptSource = null;
    source.close();
  });
  source.addEventListener('error', event=>{
    // A server-sent error has data; a transport error does not and EventSource
    // will reconnect automatically unless the server closed the stream.
    if(event.data){
      if(activeTranscriptSource === source) activeTranscriptSource = null;
      source.close();
    }
  });
}

/* switch lyric target locale and re-fetch for the current track */
function setLyricLocale(locale){
  lyricLocale = locale || '';
  if(typeof stopTranslatedVocals === 'function') stopTranslatedVocals({ clear:true });
  // Drop any already-fetched localizations so the new locale is requested fresh.
  player.lyrics.forEach(l=>{ l.localized = ''; });
  player.notify('lyrics', { reason:'locale', locale:lyricLocale });
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
  if(transcriptUsesInlineTranslation) return;
  const L = player.lyrics;
  if(!L.length) return;

  // find the current line, then collect the next few that still need text
  let cur = 0;
  for(let k=0;k<L.length;k++){ if(L[k].ms <= elapsedMs) cur = k; else break; }
  const items = [];
  for(let k=cur; k<L.length && items.length<=LOOKAHEAD; k++){
    const line = L[k];
    if(line.localized || pendingLocalize.has(line.i)) continue;
    items.push({
      index:line.i,
      text:line.text,
      start_time_ms:line.ms != null ? Math.max(0, Math.round(line.ms)) : null,
      end_time_ms:line.endMs != null ? Math.max(0, Math.round(line.endMs)) : null,
    });
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
    let changed = false;
    player.lyrics.forEach(line=>{
      const t = map[String(line.i)];
      if(t && line.localized !== t){ line.localized = t; changed = true; }
    });
    if(changed) player.notify('lyrics', { reason:'localize-window', locale:lyricLocale });
  }catch(e){ /* leave originals showing */ }
  finally{
    items.forEach(it=> pendingLocalize.delete(it.index));
    localizeInflight = false;
  }
}

/* ── Neutral translated vocal overlay ───────────────────────────────────────
   Uses translated lyric lines already produced by the localization path. The
   backend may return per-line audio_url values; if it is not configured, the UI
   reports that state and leaves normal playback untouched. */
const translatedVocalsBtn = document.getElementById('translatedVocalsBtn');
const translatedVocalEl = document.getElementById('translatedVocalEl');
let translatedVocalsEnabled = false;
let translatedVocalSegments = [];
let translatedVocalActiveIndex = null;
let translatedVocalRequestKey = '';
let translatedVocalConfig = null;
let translatedVocalConfigPromise = null;

if(translatedVocalEl){
  translatedVocalEl.preload = 'auto';
}

function setTranslatedVocalsStatus(text, active=false){
  if(!translatedVocalsBtn) return;
  translatedVocalsBtn.setAttribute('aria-pressed', String(active));
  translatedVocalsBtn.title = text || 'Translated vocals';
}

async function loadTranslatedVocalConfig(){
  if(translatedVocalConfig) return translatedVocalConfig;
  if(!translatedVocalConfigPromise){
    translatedVocalConfigPromise = fetch('/api/vocals/config')
      .then(r=>r.ok ? r.json() : null)
      .catch(()=>null)
      .then(data=>{
        translatedVocalConfig = data || {
          backend_configured:false,
          voice_mode:'neutral',
          voice_label:'Neutral voice',
          profile_configured:true,
        };
        return translatedVocalConfig;
      });
  }
  return translatedVocalConfigPromise;
}

function translatedVocalVoiceRequest(){
  const cfg = translatedVocalConfig || {};
  return {
    voice_mode:cfg.voice_mode || 'neutral',
  };
}

function translatedVocalVoiceLabel(){
  const cfg = translatedVocalConfig || {};
  const mode = translatedVocalVoiceRequest().voice_mode;
  if(cfg.voice_label && mode === cfg.voice_mode) return cfg.voice_label;
  if(mode === 'licensed') return 'Licensed voice';
  if(mode === 'user_consent') return 'Consented voice';
  return 'Neutral voice';
}

function stopTranslatedVocals({ clear=false }={}){
  translatedVocalsEnabled = false;
  translatedVocalActiveIndex = null;
  translatedVocalEl?.pause();
  if(clear){
    translatedVocalSegments = [];
    translatedVocalRequestKey = '';
    if(translatedVocalEl){
      translatedVocalEl.removeAttribute('src');
      translatedVocalEl.load();
    }
  }
  setTranslatedVocalsStatus('Neutral translated vocals', false);
}

function translatedVocalPayloadLines(){
  return player.lyrics
    .filter(line=>line.localized && line.text && line.ms != null)
    .slice(0, 80)
    .map((line, index)=>({
      index:line.i ?? index,
      text:line.localized,
      start_time_ms:Math.max(0, Math.round(line.ms || 0)),
      end_time_ms:line.endMs != null ? Math.max(0, Math.round(line.endMs)) : null,
    }));
}

async function requestTranslatedVocals(){
  if(!translatedVocalsBtn) return;
  const cfg = await loadTranslatedVocalConfig();
  const voice = translatedVocalVoiceRequest();
  if(!cfg.backend_configured){
    setTranslatedVocalsStatus('Set PIKAPROJBACKEND_URL to synthesize translated vocals', false);
    return;
  }
  if(!cfg.profile_configured && voice.voice_mode !== 'neutral'
     && (!voice.voice_profile_id || !voice.voice_consent_token)){
    setTranslatedVocalsStatus('Configure a consented or licensed voice profile first', false);
    return;
  }
  if(!lyricLocale){
    setTranslatedVocalsStatus('Choose a translation language first', false);
    return;
  }
  if(!lastLyricsMeta || !player.lyrics.length){
    setTranslatedVocalsStatus('Play a track with lyrics first', false);
    return;
  }
  let lines = translatedVocalPayloadLines();
  if(!lines.length){
    setTranslatedVocalsStatus('Translating lyrics first...', false);
    await localizeAhead(player.currentTime * 1000);
    lines = translatedVocalPayloadLines();
  }
  if(!lines.length){
    setTranslatedVocalsStatus('No translated lyric lines ready yet', false);
    return;
  }

  const voiceLabel = translatedVocalVoiceLabel();
  const key = [
    lastLyricsMeta.title,
    lastLyricsMeta.artist,
    lyricLocale,
    voice.voice_mode,
    voice.voice_profile_id || 'server-profile',
    lines.length,
  ].join('|');
  if(translatedVocalSegments.length && translatedVocalRequestKey === key){
    translatedVocalsEnabled = true;
    setTranslatedVocalsStatus(`${voiceLabel} translated vocals on`, true);
    return;
  }

  setTranslatedVocalsStatus(`Generating ${voiceLabel.toLowerCase()} translated vocals...`, false);
  try{
    const response = await fetch('/api/vocals/translated', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        title:lastLyricsMeta.title || '',
        artist:lastLyricsMeta.artist || '',
        locale:lyricLocale,
        ...voice,
        lines,
      }),
    });
    const data = await response.json().catch(()=>({}));
    if(!response.ok){
      setTranslatedVocalsStatus(data.detail || 'Translated vocals unavailable', false);
      return;
    }
    translatedVocalSegments = (data.segments || []).filter(segment=>segment.audio_url);
    translatedVocalRequestKey = key;
    if(!translatedVocalSegments.length){
      setTranslatedVocalsStatus(data.message || 'TTS backend is not configured', false);
      return;
    }
    translatedVocalsEnabled = true;
    setTranslatedVocalsStatus(`${voiceLabel} translated vocals on`, true);
  }catch(e){
    setTranslatedVocalsStatus('Translated vocals unavailable', false);
  }
}

function syncTranslatedVocals(){
  if(!translatedVocalEl || !translatedVocalsEnabled || !translatedVocalSegments.length){
    if(translatedVocalEl && !translatedVocalEl.paused) translatedVocalEl.pause();
    return;
  }
  const elapsedMs = player.currentTime * 1000;
  const segment = translatedVocalSegments.find(item=>
    elapsedMs >= (item.start_time_ms || 0) && elapsedMs < (item.end_time_ms || ((item.start_time_ms || 0) + 3500))
  );
  if(!segment || !segment.audio_url || !player.isPlaying){
    translatedVocalEl.pause();
    translatedVocalActiveIndex = null;
    return;
  }

  const offset = Math.max(0, (elapsedMs - (segment.start_time_ms || 0)) / 1000);
  if(translatedVocalActiveIndex !== segment.index || translatedVocalEl.src !== segment.audio_url){
    translatedVocalActiveIndex = segment.index;
    translatedVocalEl.src = segment.audio_url;
    translatedVocalEl.currentTime = offset;
    translatedVocalEl.play().catch(()=>{});
    return;
  }
  if(Math.abs((translatedVocalEl.currentTime || 0) - offset) > 0.25){
    try{ translatedVocalEl.currentTime = offset; }catch(e){ /* media not seekable yet */ }
  }
  if(translatedVocalEl.paused) translatedVocalEl.play().catch(()=>{});
}

translatedVocalsBtn?.addEventListener('click', ()=>{
  if(translatedVocalsEnabled) stopTranslatedVocals();
  else requestTranslatedVocals();
});
loadTranslatedVocalConfig().then(cfg=>{
  if(!cfg || !translatedVocalsBtn) return;
  translatedVocalsBtn.setAttribute(
    'aria-label',
    `Toggle ${cfg.voice_label || 'translated'} vocals`
  );
  setTranslatedVocalsStatus(
    cfg.backend_configured
      ? `${cfg.voice_label || 'Translated voice'} ready`
      : 'Set PIKAPROJBACKEND_URL to enable translated vocals',
    false
  );
});

function lyricTiming(line, index){
  const L = player.lyrics;
  if(!line) return null;
  const start = Number(line.ms) || 0;
  let end = Number(line.endMs);
  if(!(end > start)){
    const next = L[index + 1];
    end = next && Number(next.ms) > start ? Number(next.ms) : start + 4000;
  }
  return { line, index, start, end };
}

/* active lyric line timing {line, index, start, end} by elapsed ms, or null */
function currentLyricTiming(elapsedMs){
  const L = player.lyrics;
  if(!L.length) return null;
  let currentIndex = -1;
  for(let i=0;i<L.length;i++){
    if(L[i].ms <= elapsedMs) currentIndex = i;
    else break;
  }
  return currentIndex >= 0 ? lyricTiming(L[currentIndex], currentIndex) : null;
}

/* active lyric line object {text, localized} by elapsed ms, or null */
function currentLyricLine(elapsedMs){
  const timing = currentLyricTiming(elapsedMs);
  return timing ? timing.line : null;
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
  let returnFocus = null;
  let discoveryTrack = null, seedQuery = '';
  const cache = new Map();   // `${kind}\n${q}` → pool, so re-typing / kind toggles are instant

  function setModalInert(inert){
    modal.inert = !!inert;
    if(inert) modal.setAttribute('inert', '');
    else modal.removeAttribute('inert');
  }

  function focusableIn(root){
    return [...root.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )].filter(el=>el.tabIndex >= 0 && !el.hidden && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function trapFocus(event){
    const nodes = focusableIn(modal);
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

  function fmtDur(s){
    s = Math.max(0, s|0);
    const h = s/3600|0, m = (s%3600)/60|0, sec = s%60, p = n=>String(n).padStart(2,'0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
  }

  function reveal(v){
    drop.classList.toggle('open', v);
    input.setAttribute('aria-expanded', String(v));
    if(!v){
      results = [];
      sel = -1;
      input.removeAttribute('aria-activedescendant');
    }
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
      row.id = `videoResult-${idx}`;
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
      input.setAttribute('aria-activedescendant', cur.id);
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
    setVideoOverlayMode(true);
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
    const discoveringCurrent = discoveryTrack && q === seedQuery;
    const params = new URLSearchParams({
      title:discoveringCurrent ? discoveryTrack.title : q,
      kind,
      limit:'5',
    });
    if(discoveringCurrent && discoveryTrack.artist) params.set('artist', discoveryTrack.artist);
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
    discoveryTrack = cur?.title ? cur : null;
    seedQuery = discoveryTrack ? [discoveryTrack.artist, discoveryTrack.title].filter(Boolean).join(' ') : '';
    returnFocus = document.activeElement;
    input.value = seedQuery;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    setModalInert(false);
    trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(()=>{ input.focus(); input.select(); });
    if(discoveryTrack) runSearch();
    else message('Play a song for tailored discovery, or type any video search.');
  }

  function close(){
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    setModalInert(true);
    trigger.setAttribute('aria-expanded', 'false');
    clearTimeout(debounce);
    if(controller){ controller.abort(); controller = null; }
    reveal(false);
    if(returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll:true });
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
  kindBtns.forEach((btn, index)=>btn.addEventListener('keydown', e=>{
    if(!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const nextIndex = e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? kindBtns.length - 1
        : (index + (e.key === 'ArrowRight' ? 1 : -1) + kindBtns.length) % kindBtns.length;
    kindBtns[nextIndex].focus();
    kindBtns[nextIndex].click();
  }));
  // Keep keystrokes inside the modal: the gallery's global hotkeys (space, arrows,
  // letters, digits in app.js) have no typing guard, so stop them from bubbling
  // out while the modal is focused. Escape closes.
  modal.addEventListener('keydown', e=>{
    e.stopPropagation();
    if(e.key === 'Tab') trapFocus(e);
    if(e.key === 'Escape') close();
  });
})();
