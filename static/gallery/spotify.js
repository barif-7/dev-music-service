/* Phase · Field — Spotify import, ported from the player. Targets the Field-styled
   Spotify panel (same element ids). Selecting a track calls loadTrack() from
   service.js, so it streams + drives the audio engine like search results. */
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
  previewPlaylist:null,
  previewTracks:[],
  previewOffset:0,
  previewLimit:25,
  previewDone:false,
  previewLoading:false,
  previewCounts:{matched:0, low:0, unmatched:0},
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
  /* A page load may be in flight (initial OR a "load more" append). Only show the
     loading placeholder when nothing is rendered yet — otherwise leave the list
     untouched so an append doesn't make the whole list vanish until it arrives. */
  if(spotify.view === 'liked' && spotify.likedLoading){
    if(!spotify.likedTracks.length) setSpotifyEmpty('loading liked songs');
    return;
  }
  if(spotify.view === 'playlists' && spotify.playlistsLoading){
    if(!spotify.playlists.length) setSpotifyEmpty('loading playlists');
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
    append = false,
  } = options;

  /* append: keep the existing header/rows, just add the new page before a fresh
     footer (the load-more footer is re-added by the caller afterwards). */
  if(append){
    clearSpotifyLoadMore();
    tracks.forEach(item=>spotifyList.appendChild(createSpotifyLikedRow(item)));
    return;
  }

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

  tracks.forEach(item=>spotifyList.appendChild(createSpotifyLikedRow(item)));
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

function spotifyPreviewSubline(){
  const c = spotify.previewCounts || { matched:0, low:0, unmatched:0 };
  const total = spotify.previewPlaylist?.track_count || 0;
  const shown = spotify.previewTracks.length;
  const prog = total ? `${shown}/${total} songs` : `${shown} songs`;
  return `${prog} · ${c.matched} ok · ${c.low} low · ${c.unmatched} unmatched`;
}

function updateSpotifyPreviewFooter(){
  clearSpotifyLoadMore();
  if(!spotify.preview) return;
  if(spotify.previewLoading){
    setSpotifyLoadMore('loading more songs');
  } else if(!spotify.previewDone && spotify.previewTracks.length){
    setSpotifyLoadMore(`load next ${spotify.previewLimit} songs`,
      ()=>previewSpotifyPlaylist(null, spotify.previewPlaylist, { append:true }));
  }
}

function exitSpotifyPlaylistPreview(){
  spotify.preview = null;
  spotify.previewPlaylist = null;
  spotify.previewTracks = [];
  spotify.previewDone = false;
  renderSpotifyPlaylists(spotify.playlists);
  if(spotifyAccount) spotifyAccount.textContent = 'Spotify library';
  if(spotifyScope) spotifyScope.textContent = 'read-only playlist import';
  setSpotifyStatus(`connected · ${spotify.playlists.length} lists`, `${spotify.playlists.length} loaded · read-only`);
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
  closeSpotifyPanel();   // drop back to the immersive wallpaper, now reacting to the track
  try {
    await loadTrack({
      title: fallback.title,
      artist: fallback.artist,
      album: fallback.album,
      duration: fallback.duration,
      thumbnail: fallback.thumbnail,
      artwork_source: fallback.artwork_source,
      release_year: fallback.release_year,
      spotifyId: track.provider_track_id,   // drives the per-track feature fetch
    });
  } catch(e) {
    console.warn('spotify playback', e);
    setSpotifyStatus('playback failed', String(e?.message || e || 'resolve failed'));
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

async function previewSpotifyPlaylist(row, playlist, { append = false } = {}){
  if(spotify.previewLoading) return;
  playlist = playlist || spotify.previewPlaylist;
  if(!playlist) return;
  if(!append){
    spotify.preview = { playlist };
    spotify.previewPlaylist = playlist;
    spotify.previewTracks = [];
    spotify.previewOffset = 0;
    spotify.previewDone = false;
    spotify.previewCounts = { matched:0, low:0, unmatched:0 };
    renderSpotifyTrackRows([], {
      headline: playlist.name || 'Playlist preview',
      subline: 'loading songs…',
      emptyText: 'loading songs…',
      backLabel: 'Back to playlists',
      onBack: exitSpotifyPlaylistPreview,
    });
    if(spotifyAccount) spotifyAccount.textContent = playlist.name || 'Playlist preview';
  }
  spotify.previewLoading = true;
  updateSpotifyPreviewFooter();
  const limit = spotify.previewLimit || 25;
  const offset = append ? spotify.previewOffset : 0;
  try {
    const r = await fetch(`/api/import/spotify/playlists/${encodeURIComponent(playlist.id)}/preview?limit=${limit}&offset=${offset}`);
    if(!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const page = data.tracks || [];
    spotify.previewTracks = append ? spotify.previewTracks.concat(page) : page;
    /* advance by items REQUESTED, not by matched rows — the backend offset indexes
       raw playlist items, so stepping by matched count would re-fetch/duplicate. */
    spotify.previewOffset = offset + limit;
    spotify.previewCounts.matched += data.matched_count || 0;
    spotify.previewCounts.low += data.low_confidence_count || 0;
    spotify.previewCounts.unmatched += data.unmatched_count || 0;
    const total = playlist.track_count || 0;
    spotify.previewDone = total ? (spotify.previewOffset >= total) : (page.length < limit);
    if(append){
      renderSpotifyTrackRows(page, { append:true });
      const subEl = spotifyList.querySelector('.spotifyPreviewSub');
      if(subEl) subEl.textContent = spotifyPreviewSubline();
    } else {
      renderSpotifyTrackRows(spotify.previewTracks, {
        headline: playlist.name || 'Playlist preview',
        subline: spotifyPreviewSubline(),
        emptyText: 'no songs found',
        backLabel: 'Back to playlists',
        onBack: exitSpotifyPlaylistPreview,
      });
    }
    setSpotifyStatus('previewed', playlist.name || 'playlist');
  } catch(e) {
    console.warn('spotify preview', e);
    setSpotifyStatus('error', 'preview failed');
    if(!append) setSpotifyEmpty('playlist preview failed');
  } finally {
    spotify.previewLoading = false;
    updateSpotifyPreviewFooter();
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
    if(!spotify.connected) return;
    const threshold = 28;
    if(spotifyList.scrollTop + spotifyList.clientHeight < spotifyList.scrollHeight - threshold) return;
    if(spotify.preview){
      if(!spotify.previewLoading && !spotify.previewDone){
        previewSpotifyPlaylist(null, spotify.previewPlaylist, { append:true });
      }
      return;
    }
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
