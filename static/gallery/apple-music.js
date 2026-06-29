/* Phase · Field — Apple Music fallback import. The browser owns the uploaded
   export JSON locally and only sends one album at a time to the backend for
   MusicBrainz matching. Playback reuses loadTrack() from service.js. */

const appleMusic = {
  library: null,
  albums: [],
  filteredAlbums: [],
  albumsOffset: 0,
  albumsPageSize: 60,
  previewAlbum: null,
  previewTracks: [],
  previewCounts: { matched: 0, low: 0, unmatched: 0 },
  previewLoading: false,
  query: '',
};

const applePanel = document.getElementById('applePanel');
const appleAccount = document.getElementById('appleAccount');
const appleScope = document.getElementById('appleScope');
const appleStatus = document.getElementById('amStat');
const appleList = document.getElementById('amList');
const appleUploadBtn = document.getElementById('appleUploadBtn');
const appleImportFile = document.getElementById('appleImportFile');
const appleSearch = document.getElementById('appleSearch');

function setAppleStatus(text, detail = ''){
  if(!appleStatus) return;
  appleStatus.textContent = detail ? `${text} · ${detail}` : text;
}

function setAppleEmpty(text){
  if(!appleList) return;
  appleList.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  appleList.appendChild(empty);
}

function clearAppleLoadMore(){
  appleList?.querySelector('.spotifyLoadMore')?.remove();
}

function setAppleLoadMore(text, onClick = null){
  if(!appleList) return;
  clearAppleLoadMore();
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
  appleList.appendChild(more);
}

function appleAlbumSubline(album){
  const bits = [album.artist || 'Unknown artist', `${album.track_count || 0} tracks`];
  if(album.year) bits.push(String(album.year));
  if(album.plays) bits.push(`${album.plays} plays`);
  return bits.join(' · ');
}

function normalizeAppleLibrary(payload){
  if(!payload || payload.provider !== 'apple_music' || !Array.isArray(payload.albums)){
    throw new Error('Expected an apple_music export with an albums array');
  }
  const albums = payload.albums
    .filter(album => album && Array.isArray(album.tracks) && album.tracks.length)
    .map(album => ({
      provider: 'apple_music',
      id: album.id || '',
      name: album.name || 'Untitled album',
      artist: album.artist || 'Unknown artist',
      year: album.year || null,
      genre: album.genre || null,
      track_count: album.track_count || album.tracks.length || 0,
      duration_ms: album.duration_ms || 0,
      plays: album.plays || 0,
      skips: album.skips || 0,
      loved: !!album.loved,
      explicit: !!album.explicit,
      streaming: !!album.streaming,
      artwork_url: album.artwork_url || null,
      provider_url: album.provider_url || null,
      tracks: album.tracks.map(track => ({
        provider: track.provider || 'apple_music',
        provider_track_id: track.provider_track_id || null,
        provider_playlist_id: track.provider_playlist_id || album.id || '',
        title: track.title || 'Untitled track',
        artist_names: Array.isArray(track.artist_names) && track.artist_names.length
          ? track.artist_names
          : [album.artist || 'Unknown artist'],
        album: track.album || album.name || null,
        duration_ms: track.duration_ms || 0,
        isrc: track.isrc || null,
        release_date: track.release_date || null,
        release_year: track.release_year || album.year || null,
        artwork_url: track.artwork_url || album.artwork_url || null,
        provider_url: track.provider_url || album.provider_url || null,
        track_number: track.track_number || null,
        disc_number: track.disc_number || null,
        plays: track.plays || 0,
        skips: track.skips || 0,
        loved: !!track.loved,
        explicit: !!track.explicit,
        streaming: typeof track.streaming === 'boolean' ? track.streaming : !!album.streaming,
        genre: track.genre || album.genre || null,
        last_played_at: track.last_played_at || null,
        date_added_at: track.date_added_at || null,
      })),
    }))
    .sort((a, b) =>
      (b.plays - a.plays)
      || a.artist.localeCompare(b.artist)
      || a.name.localeCompare(b.name)
    );

  return {
    ...payload,
    albums,
  };
}

function refreshAppleAlbumFilter(){
  const q = (appleMusic.query || '').trim().toLowerCase();
  appleMusic.filteredAlbums = !q
    ? appleMusic.albums.slice()
    : appleMusic.albums.filter(album => {
        const haystack = [
          album.name,
          album.artist,
          album.genre,
          String(album.year || ''),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
  appleMusic.albumsOffset = 0;
}

function createAppleAlbumRow(album){
  const row = document.createElement('div');
  row.className = 'plRow';
  row.dataset.albumId = album.id;

  const meta = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'pl-name';
  name.textContent = album.name || 'Untitled album';
  const sub = document.createElement('div');
  sub.className = 'pl-sub';
  sub.textContent = appleAlbumSubline(album);
  meta.append(name, sub);

  const match = document.createElement('div');
  match.className = 'match';
  const badge = document.createElement('span');
  badge.className = 'ok';
  badge.textContent = album.year ? String(album.year) : 'preview';
  match.appendChild(badge);

  row.append(meta, match);
  row.addEventListener('click', ()=>previewAppleAlbum(album));
  return row;
}

function renderAppleAlbumsPage(albums, { append = false } = {}){
  appleMusic.previewAlbum = null;
  if(!append){
    appleList.innerHTML = '';
    clearAppleLoadMore();
  }
  if(!albums.length && !append){
    const baseText = appleMusic.query
      ? `no albums match "${appleMusic.query}"`
      : 'no albums found in this export';
    setAppleEmpty(baseText);
    return;
  }
  albums.forEach(album => appleList.appendChild(createAppleAlbumRow(album)));
}

function updateAppleAlbumsFooter(){
  clearAppleLoadMore();
  if(appleMusic.previewAlbum) return;
  if(appleMusic.albumsOffset < appleMusic.filteredAlbums.length){
    const remaining = appleMusic.filteredAlbums.length - appleMusic.albumsOffset;
    const next = Math.min(appleMusic.albumsPageSize, remaining);
    setAppleLoadMore(`load next ${next} albums`, ()=>appendAppleAlbums());
  }
}

function renderAppleAlbums({ append = false } = {}){
  if(!append){
    appleMusic.albumsOffset = 0;
    appleList.innerHTML = '';
  }
  const nextOffset = Math.min(
    appleMusic.albumsOffset + appleMusic.albumsPageSize,
    appleMusic.filteredAlbums.length,
  );
  const page = appleMusic.filteredAlbums.slice(appleMusic.albumsOffset, nextOffset);
  renderAppleAlbumsPage(page, { append });
  appleMusic.albumsOffset = nextOffset;
  updateAppleAlbumsFooter();
}

function appendAppleAlbums(){
  if(appleMusic.previewAlbum || appleMusic.albumsOffset >= appleMusic.filteredAlbums.length) return;
  renderAppleAlbums({ append: true });
}

function applePreviewSubline(album){
  const counts = appleMusic.previewCounts || { matched: 0, low: 0, unmatched: 0 };
  return `${album.track_count || 0} songs · ${counts.matched} ok · ${counts.low} low · ${counts.unmatched} unmatched`;
}

function createAppleTrackRow(item){
  const track = item.source || {};
  const match = item.musicbrainz || {};
  const conf = Math.min(99, Math.max(20, match.confidence || 0));
  const tier = conf >= 85 ? 'high' : conf >= 60 ? 'mid' : 'low';
  const playable = conf >= 80;
  const row = document.createElement('div');
  row.className = `likedRow${playable ? ' playable' : ''}`;
  row.title = playable ? 'Play this matched track' : 'Track match is too weak to play directly';

  const meta = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = match.title || track.title || 'Untitled track';
  const sub = document.createElement('div');
  sub.className = 'meta';

  const artist = document.createElement('span');
  artist.textContent = match.artist || (track.artist_names || []).join(', ') || 'Unknown artist';
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = '·';
  const album = document.createElement('span');
  album.textContent = match.album || track.album || 'Unknown album';
  sub.append(artist, sep, album);
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
    row.addEventListener('click', ()=>playAppleImportedTrack(item));
  }
  return row;
}

function renderAppleTrackRows(tracks, album, { loading = false } = {}){
  appleList.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'spotifyPreviewHead';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'spotifyBack';
  back.textContent = 'Back to albums';
  back.addEventListener('click', e=>{
    e.preventDefault();
    e.stopPropagation();
    exitAppleAlbumPreview();
  });
  head.appendChild(back);

  const meta = document.createElement('div');
  meta.className = 'spotifyPreviewMeta';
  const title = document.createElement('div');
  title.className = 'spotifyPreviewTitle';
  title.textContent = album.name || 'Album preview';
  const sub = document.createElement('div');
  sub.className = 'spotifyPreviewSub';
  sub.textContent = loading
    ? 'matching tracks against MusicBrainz…'
    : applePreviewSubline(album);
  meta.append(title, sub);
  head.appendChild(meta);
  appleList.appendChild(head);

  if(loading){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'matching tracks…';
    appleList.appendChild(empty);
    return;
  }

  if(!tracks.length){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'no tracks found';
    appleList.appendChild(empty);
    return;
  }

  tracks.forEach(item => appleList.appendChild(createAppleTrackRow(item)));
}

function exitAppleAlbumPreview(){
  appleMusic.previewAlbum = null;
  appleMusic.previewTracks = [];
  appleMusic.previewCounts = { matched: 0, low: 0, unmatched: 0 };
  appleAccount.textContent = 'Apple Music import';
  appleScope.textContent = 'upload `apple_music_import.json` from the gallery export';
  setAppleStatus(
    `${appleMusic.filteredAlbums.length} albums`,
    `${appleMusic.library?.library?.track_count || 0} tracks`,
  );
  renderAppleAlbums();
}

async function previewAppleAlbum(album){
  if(!album || appleMusic.previewLoading) return;
  appleMusic.previewAlbum = album;
  appleMusic.previewTracks = [];
  appleMusic.previewCounts = { matched: 0, low: 0, unmatched: 0 };
  appleMusic.previewLoading = true;
  appleAccount.textContent = album.name || 'Album preview';
  appleScope.textContent = appleAlbumSubline(album);
  renderAppleTrackRows([], album, { loading: true });
  setAppleStatus('matching', album.name || 'album');
  try {
    const response = await fetch('/api/import/apple-music/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(album),
    });
    if(!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    appleMusic.previewTracks = payload.tracks || [];
    appleMusic.previewCounts = {
      matched: payload.matched_count || 0,
      low: payload.low_confidence_count || 0,
      unmatched: payload.unmatched_count || 0,
    };
    renderAppleTrackRows(appleMusic.previewTracks, album);
    setAppleStatus('previewed', album.name || 'album');
  } catch(e) {
    console.warn('apple preview', e);
    setAppleStatus('error', 'preview failed');
    setAppleEmpty('album preview failed');
  } finally {
    appleMusic.previewLoading = false;
  }
}

async function playAppleImportedTrack(item){
  const track = item?.source || {};
  const match = item?.musicbrainz || {};
  closeApplePanel();
  try {
    await loadTrack({
      title: match.title || track.title || 'Untitled track',
      artist: match.artist || (track.artist_names || []).join(', ') || 'Unknown artist',
      album: match.album || track.album || undefined,
      duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : undefined,
      thumbnail: match.artwork_url || track.artwork_url || undefined,
      artwork_source: match.artwork_url
        ? 'musicbrainz'
        : (track.artwork_url ? 'apple_music' : undefined),
      release_year: match.release_year || track.release_year || undefined,
      savedToSpotify: false,
    });
  } catch(e) {
    console.warn('apple playback', e);
    setAppleStatus('playback failed', String(e?.message || e || 'resolve failed'));
  }
}

async function importAppleLibraryFile(file){
  if(!file) return;
  setAppleStatus('reading export', file.name);
  try {
    const payload = normalizeAppleLibrary(JSON.parse(await file.text()));
    appleMusic.library = payload;
    appleMusic.albums = payload.albums;
    appleMusic.query = '';
    if(appleSearch) appleSearch.value = '';
    refreshAppleAlbumFilter();
    appleAccount.textContent = 'Apple Music import';
    appleScope.textContent = 'local export · no provider auth required';
    setAppleStatus(
      `${payload.albums.length} albums`,
      `${payload.library?.track_count || 0} tracks`,
    );
    renderAppleAlbums();
  } catch(e) {
    console.warn('apple import file', e);
    appleMusic.library = null;
    appleMusic.albums = [];
    appleMusic.filteredAlbums = [];
    setAppleStatus('invalid export', file.name || 'json');
    setAppleEmpty('Could not parse the Apple Music export. Use apple_music_import.json from the gallery build.');
  } finally {
    if(appleImportFile) appleImportFile.value = '';
  }
}

function wireAppleMusicImport(){
  if(!applePanel || !appleList) return;
  appleUploadBtn?.addEventListener('click', ()=>appleImportFile?.click());
  appleImportFile?.addEventListener('change', e=>{
    const file = e.target?.files?.[0];
    if(file) importAppleLibraryFile(file);
  });
  appleSearch?.addEventListener('input', e=>{
    appleMusic.query = e.target.value || '';
    if(appleMusic.previewAlbum) return;
    refreshAppleAlbumFilter();
    renderAppleAlbums();
  });
  appleList.addEventListener('scroll', ()=>{
    if(appleMusic.previewAlbum) return;
    const threshold = 28;
    if(appleList.scrollTop + appleList.clientHeight < appleList.scrollHeight - threshold) return;
    appendAppleAlbums();
  });
  setAppleEmpty('Select apple_music_import.json from the Apple Music gallery export.');
}

wireAppleMusicImport();
