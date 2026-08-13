/* Phase · Field — compact MusicKit on the Web catalog + playback surface. */
(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const panel=$('#appleMusicPanel'),openBtn=$('#btnAppleMusic'),closeBtn=$('#appleMusicClose');
  const connectBtn=$('#appleMusicConnect'),playBtn=$('#appleMusicPlay'),query=$('#appleMusicQuery');
  const importBtn=$('#appleMusicImport'),importFile=$('#appleMusicImportFile');
  const resultsEl=$('#appleMusicResults'),statusEl=$('#appleMusicStatus'),identity=$('#appleMusicIdentity');
  if(!panel||!openBtn||!query) return;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  let config=null,music=null,items=[],timer=null,selected=-1,loadingPromise=null;
  let offlineLibrary=null,offlineAlbums=[],offlineMode=false;

  function setPanel(open){
    panel.classList.toggle('show',open);panel.setAttribute('aria-hidden',String(!open));
    panel.inert=!open;
    if(open) panel.removeAttribute('inert'); else panel.setAttribute('inert','');
    openBtn.setAttribute('aria-expanded',String(open));
    if(typeof state!=='undefined') state.searchOpen=open;
    if(open&&(config?.configured||offlineLibrary)) setTimeout(()=>query.focus(),40);
    if(typeof wake==='function') wake();
  }

  function loadMusicKit(){
    if(window.MusicKit) return Promise.resolve(window.MusicKit);
    if(loadingPromise) return loadingPromise;
    loadingPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      script.async=true;script.crossOrigin='anonymous';
      script.onload=()=>window.MusicKit?resolve(window.MusicKit):reject(new Error('MusicKit did not initialize'));
      script.onerror=()=>reject(new Error('Could not load MusicKit from Apple'));
      document.head.appendChild(script);
    });
    return loadingPromise;
  }

  function artworkUrl(artwork,size=240){
    const url=artwork?.url||'';
    return url.replace('{w}',String(size)).replace('{h}',String(size)).replace('{f}','jpg');
  }

  function normalizeSearch(payload){
    const candidates=[
      payload?.songs?.data,
      payload?.results?.songs?.data,
      payload?.data?.results?.songs?.data,
      payload?.data?.songs?.data,
    ];
    const songs=candidates.find(Array.isArray)||[];
    return songs.map(song=>{
      const a=song.attributes||song;
      return {
        id:song.id||a.id,
        title:a.name||'Untitled',artist:a.artistName||'',album:a.albumName||'',
        artwork:artworkUrl(a.artwork),duration:a.durationInMillis||0,
      };
    }).filter(song=>song.id);
  }

  function render(){
    selected=items.length?0:-1;
    resultsEl.innerHTML=items.map((song,index)=>`
      <button type="button" class="am-result" role="option" data-index="${index}" aria-selected="${index===0}">
        ${song.artwork?`<img class="am-art" src="${esc(song.artwork)}" alt="" loading="lazy">`:`<span class="am-art"></span>`}
        <span class="am-name">${esc(song.title)}</span>
        <span class="am-artist">${esc(song.artist)}</span>
      </button>`).join('');
    resultsEl.querySelectorAll('.am-result').forEach(button=>{
      button.addEventListener('pointermove',()=>setSelected(+button.dataset.index));
      button.addEventListener('click',()=>activateItem(items[+button.dataset.index]));
    });
    query.setAttribute('aria-expanded',String(items.length>0));
  }

  function setSelected(index){
    if(!items.length)return;
    selected=(index+items.length)%items.length;
    const options=[...resultsEl.querySelectorAll('.am-result')];
    options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===selected)));
    options[selected]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  }

  function syncAuth(){
    const authorized=!!music?.isAuthorized;
    identity.textContent=authorized?'subscriber connected':config?.configured?'catalog ready':'not configured';
    connectBtn.textContent=authorized?'Disconnect':'Connect Apple Music';
    query.disabled=!config?.configured&&!offlineLibrary;
    playBtn.disabled=!music?.nowPlayingItem;
  }

  function syncPlayback(){
    const playing=!!music?.isPlaying;
    playBtn.textContent=playing?'Pause':'Play';
    playBtn.setAttribute('aria-pressed',String(playing));
    const item=music?.nowPlayingItem;
    if(item){
      const a=item.attributes||item;
      statusEl.textContent=`${playing?'Playing':'Ready'} · ${a.name||'Apple Music'}${a.artistName?` — ${a.artistName}`:''}`;
    }
    syncAuth();
  }

  async function restorePersistentLibrary(){
    if(!config?.importAvailable) return false;
    const response=await fetch('/api/import/apple-music/library',{cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.detail||`Apple Music library ${response.status}`);
    offlineLibrary=normalizeOfflineLibrary(payload);
    offlineAlbums=offlineLibrary.albums;
    offlineMode=true;query.disabled=false;query.placeholder='Filter imported albums…';
    identity.textContent='personal library';
    renderOfflineAlbums();
    return true;
  }

  async function initialize(){
    try{
      const response=await fetch('/api/apple-music/config',{cache:'no-store'});
      config=await response.json();
      try{await restorePersistentLibrary();}
      catch(error){statusEl.textContent=error.message||'Persistent Apple Music library is unavailable';}
      if(!config.configured){
        if(!offlineLibrary){
          identity.textContent='developer token needed';
          statusEl.textContent='Import a Music XML export, or add a developer token for live catalog playback.';
          query.disabled=true;
        }
        connectBtn.disabled=true;return;
      }
      const MusicKit=await loadMusicKit();
      music=await MusicKit.configure({
        developerToken:config.developerToken,
        storefrontId:config.storefront||'ca',
        app:{name:config.app?.name||'Phase Field',build:config.app?.build||'0.4.0'},
      });
      music=music||MusicKit.getInstance();
      music.addEventListener?.('authorizationStatusDidChange',syncAuth);
      music.addEventListener?.('playbackStateDidChange',syncPlayback);
      music.addEventListener?.('nowPlayingItemDidChange',syncPlayback);
      statusEl.textContent='Search the catalog, then choose a song to play.';
      syncAuth();
    }catch(error){
      identity.textContent='unavailable';statusEl.textContent=error.message||'Apple Music initialization failed';
    }
  }

  async function authorize(){
    if(!music)return;
    try{
      connectBtn.disabled=true;
      if(music.isAuthorized) await music.unauthorize(); else await music.authorize();
      syncAuth();
      statusEl.textContent=music.isAuthorized?'Apple Music subscriber connected.':'Disconnected from Apple Music.';
    }catch(error){statusEl.textContent=error.message||'Apple Music authorization failed';}
    finally{connectBtn.disabled=false;}
  }

  async function search(term){
    if(offlineMode){renderOfflineAlbums(term);return;}
    if(!music||!term.trim()){items=[];render();return;}
    statusEl.textContent='Searching Apple Music…';
    try{
      const payload=await music.api.search(term.trim(),{types:'songs',limit:12});
      items=normalizeSearch(payload);render();
      statusEl.textContent=items.length?`${items.length} catalog matches`:'No Apple Music matches';
    }catch(error){items=[];render();statusEl.textContent=error.message||'Apple Music search failed';}
  }

  async function playItem(song){
    if(!music||!song)return;
    try{
      if(!music.isAuthorized) await music.authorize();
      if(typeof player!=='undefined'&&player.isPlaying) player.pause();
      if(typeof AUDIO!=='undefined'&&AUDIO.active) AUDIO.stop();
      statusEl.textContent=`Loading ${song.title}…`;
      await music.setQueue({song:song.id,startPlaying:true});
      if(!music.isPlaying) await music.play();
      syncPlayback();
    }catch(error){statusEl.textContent=error.message||'Apple Music playback failed';}
  }

  function normalizeOfflineLibrary(payload){
    if(!payload||payload.provider!=='apple_music'||!Array.isArray(payload.albums)){
      throw new Error('Expected an Apple Music XML export or apple_music_import.json');
    }
    const albums=payload.albums.filter(album=>album&&album.name&&Array.isArray(album.tracks));
    return {...payload,albums};
  }

  function renderOfflineAlbums(term=''){
    offlineMode=true;
    const needle=term.trim().toLowerCase();
    items=offlineAlbums.filter(album=>!needle||[album.name,album.artist,album.genre,album.year]
      .some(value=>String(value||'').toLowerCase().includes(needle))).slice(0,60).map(album=>({
        kind:'offline-album',album,title:album.name,artist:[album.artist,album.year,`${album.track_count||album.tracks.length} tracks`].filter(Boolean).join(' · '),
        artwork:album.artwork_url||'',
      }));
    render();
    statusEl.textContent=`${items.length} of ${offlineAlbums.length} imported albums · ${offlineLibrary?.library?.track_count||0} tracks`;
  }

  async function previewOfflineAlbum(album){
    statusEl.textContent=`Matching ${album.name} with MusicBrainz…`;
    try{
      const response=await fetch('/api/import/apple-music/preview',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(album),
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(payload.detail||`preview ${response.status}`);
      items=[{kind:'offline-back',title:'← Albums',artist:'Return to imported library'},
        ...(payload.tracks||[]).map(entry=>({
          kind:'offline-track',entry,
          title:entry.musicbrainz?.title||entry.source?.title||'Untitled',
          artist:entry.musicbrainz?.artist||(entry.source?.artist_names||[]).join(', ')||'Unknown artist',
          artwork:entry.musicbrainz?.artwork_url||entry.source?.artwork_url||'',
        }))];
      render();
      statusEl.textContent=`${album.name} · ${payload.matched_count||0} matched · ${payload.low_confidence_count||0} possible · ${payload.unmatched_count||0} unmatched`;
    }catch(error){statusEl.textContent=error.message||'Album matching failed';}
  }

  async function playOfflineTrack(entry){
    const track=entry?.source||{},match=entry?.musicbrainz||{};
    setPanel(false);
    if(typeof loadTrack!=='function'){statusEl.textContent='Player is not ready';return;}
    await loadTrack({
      provider:'apple_music',
      title:match.title||track.title||'Untitled track',
      artist:match.artist||(track.artist_names||[]).join(', ')||'Unknown artist',
      album:match.album||track.album||undefined,
      duration:track.duration_ms?Math.round(track.duration_ms/1000):undefined,
      thumbnail:match.artwork_url||track.artwork_url||undefined,
      artwork_source:match.artwork_url?'musicbrainz':'apple_music',
      release_year:match.release_year||track.release_year||undefined,
      provider_track_id:track.provider_track_id||undefined,
    });
  }

  function activateItem(item){
    if(item?.kind==='offline-album')return previewOfflineAlbum(item.album);
    if(item?.kind==='offline-track')return playOfflineTrack(item.entry);
    if(item?.kind==='offline-back')return renderOfflineAlbums(query.value);
    return playItem(item);
  }

  async function importOfflineFile(file){
    if(!file)return;
    statusEl.textContent=`Reading ${file.name}…`;
    try{
      const bytes=await file.arrayBuffer();
      const text=new TextDecoder().decode(bytes);
      let payload;
      if(file.name.toLowerCase().endsWith('.json')||text.trimStart().startsWith('{')){
        payload=JSON.parse(text);
      }else{
        const response=await fetch('/api/import/apple-music/xml',{
          method:'POST',headers:{'Content-Type':'application/xml'},body:bytes,
        });
        payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.detail||`XML import ${response.status}`);
      }
      offlineLibrary=normalizeOfflineLibrary(payload);
      offlineAlbums=offlineLibrary.albums;
      query.disabled=false;query.value='';query.placeholder='Filter imported albums…';
      identity.textContent='offline library imported';
      renderOfflineAlbums();
    }catch(error){statusEl.textContent=error.message||'Could not read this Apple Music export';}
    finally{if(importFile)importFile.value='';}
  }

  openBtn.addEventListener('click',()=>setPanel(!panel.classList.contains('show')));
  closeBtn?.addEventListener('click',()=>setPanel(false));
  connectBtn?.addEventListener('click',authorize);
  importBtn?.addEventListener('click',()=>importFile?.click());
  importFile?.addEventListener('change',event=>importOfflineFile(event.target.files?.[0]));
  playBtn?.addEventListener('click',async()=>{
    if(!music)return;
    try{if(music.isPlaying)await music.pause();else await music.play();syncPlayback();}
    catch(error){statusEl.textContent=error.message||'Playback control failed';}
  });
  query.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>search(query.value),180);});
  query.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'||event.key==='ArrowDown'){event.preventDefault();setSelected(selected+1);}
    else if(event.key==='ArrowLeft'||event.key==='ArrowUp'){event.preventDefault();setSelected(selected-1);}
    else if(event.key==='Enter'&&selected>=0){event.preventDefault();activateItem(items[selected]);}
    else if(event.key==='Escape'){event.preventDefault();setPanel(false);}
  });
  window.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&panel.classList.contains('show'))setPanel(false);
  });
  initialize();
})();
