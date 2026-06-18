/* Phase · Field — service layer: real track resolution, streaming playback,
   lyrics, autocomplete. The streamed track feeds the audio engine (AUDIO) so the
   current wallpaper reacts to whatever is playing. Caption/lyric updates go through
   the globals renderNowPlaying() / player.lyrics consumed by app.js. */

const streamEl = document.getElementById('streamEl');

const player = {
  current: null,       // last resolved track shown in the caption
  duration: 0,
  lyrics: [],          // [{ms, text}]
  webpageUrl: null,
};

/* per-track ReccoBeats features → reactivity (no-op without a Spotify id) */
async function fetchTrackFeatures(spotifyId){
  trackFeatures = null; recomputeTrackMod();
  if(!spotifyId) return;
  try{
    const r = await fetch(`/api/focus/track/${encodeURIComponent(spotifyId)}`);
    if(!r.ok) return;
    trackFeatures = await r.json(); recomputeTrackMod();
  }catch(e){ /* neutral */ }
}

/* resolve a track to a playable source, stream it, and react to it */
async function loadTrack(s){
  player.current = s; player.lyrics = [];
  fetchTrackFeatures(s.spotifyId);
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
    const merged = { ...s, ...result,
      title:  result.title  || s.title,
      artist: result.artist || s.artist,
      album:  result.album  || s.album };
    player.current = merged;
    player.duration = result.duration || s.duration || 0;
    player.webpageUrl = result.webpage_url;
    if(typeof renderNowPlaying === 'function') renderNowPlaying(merged, 'streaming');
    streamEl.src = `/api/stream?url=${encodeURIComponent(result.webpage_url)}`;
    AUDIO.useStream(streamEl);
    streamEl.play().catch(()=>{});
    loadLyrics({ title:merged.title, artist:merged.artist, album:merged.album, duration:player.duration });
  }catch(e){ console.warn('loadTrack', e); fail(s, 'error'); }
}
function fail(s, msg){ if(typeof renderNowPlaying === 'function') renderNowPlaying(s, msg); }

async function loadLyrics(meta){
  player.lyrics = [];
  try{
    const params = new URLSearchParams({ title:meta.title||'', artist:meta.artist||'' });
    if(meta.album)    params.set('album', meta.album);
    if(meta.duration) params.set('duration', Math.round(meta.duration));
    const r = await fetch(`/api/lyrics?${params.toString()}`);
    if(!r.ok) return;
    const data = await r.json();
    let lines = [];
    if(data.synced_lyrics){
      data.synced_lyrics.split('\n').forEach(line=>{
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        if(m && m[3]) lines.push({ ms:(parseInt(m[1])*60 + parseFloat(m[2]))*1000, text:m[3] });
      });
    } else if(data.plain_lyrics){
      lines = data.plain_lyrics.split('\n').filter(l=>l.trim()).map((l,i)=>({ ms:i*4000, text:l }));
    }
    player.lyrics = lines;
  }catch(e){ /* no lyrics */ }
}

/* current lyric line for the caption, by elapsed ms */
function currentLyric(elapsedMs){
  const L = player.lyrics;
  if(!L.length) return '';
  let cur = '';
  for(let i=0;i<L.length;i++){ if(L[i].ms <= elapsedMs) cur = L[i].text; else break; }
  return cur;
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
