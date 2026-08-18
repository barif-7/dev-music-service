/* Phase · Field — share links for songs and saved searches.
   URLs are intentionally compact and human-readable. The target is resolved
   through the same loadTrack() path as search, Spotify, and Apple Music. */
(function shareLinks(){
  const $ = (selector, root=document)=>root.querySelector(selector);
  const input = $('#omniInput');
  const searchShare = $('#omniShare');
  const trackShare = $('#nbShare');
  const banner = $('#shareBanner');
  const bannerTitle = $('#shareBannerTitle');
  const bannerSub = $('#shareBannerSub');
  const bannerActions = $('#shareBannerActions');
  const playNow = $('#sharePlayNow');
  const closeBanner = $('#shareBannerClose');
  const toast = $('#shareToast');
  let sharedTarget = null;
  let toastTimer = null;
  let bannerTimer = null;

  const clean = (value, max=300)=>String(value || '').trim().slice(0,max);
  const validLocale = value=>{
    const locale=clean(value,16);
    return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale) ? locale : '';
  };

  function encodeLyrics(lines){
    if(!Array.isArray(lines) || !lines.length) return '';
    const source=lines.filter(line=>line && line.text && Number.isFinite(Number(line.ms)));
    if(!source.some(line=>line.localized)) return '';
    const compact=source
      .map(line=>[
        Number(line.i)||0,
        Math.max(0,Math.round(Number(line.ms))),
        line.endMs==null ? null : Math.max(0,Math.round(Number(line.endMs))),
        clean(line.text,1000),
        clean(line.localized,1000),
      ]);
    if(!compact.length) return '';
    try{
      const bytes=new TextEncoder().encode(JSON.stringify(compact));
      let binary='';
      for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
      return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }catch(_error){ return ''; }
  }

  function decodeLyrics(encoded){
    if(!encoded || encoded.length>24000) return [];
    try{
      const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4);
      const binary=atob(normalized);
      const bytes=Uint8Array.from(binary, char=>char.charCodeAt(0));
      const payload=JSON.parse(new TextDecoder().decode(bytes));
      if(!Array.isArray(payload) || payload.length>500) return [];
      return payload.filter(line=>Array.isArray(line) && line.length>=5)
        .map(line=>({
          i:Number(line[0])||0,
          ms:Number(line[1]),
          endMs:line[2]==null ? null : Number(line[2]),
          text:clean(line[3],1000),
          localized:clean(line[4],1000),
        }))
        .filter(line=>line.text && Number.isFinite(line.ms)
          && (line.endMs==null || Number.isFinite(line.endMs)))
        .sort((a,b)=>a.ms-b.ms || a.i-b.i);
    }catch(_error){ return []; }
  }

  function baseShareUrl(){
    const url = new URL('/share', window.location.origin);
    url.searchParams.set('utm_source','shared_link');
    url.searchParams.set('utm_medium','referral');
    return url;
  }

  function currentLocale(){
    if(typeof lyricLocale !== 'undefined' && lyricLocale) return validLocale(lyricLocale);
    if(typeof selectedLyricLocale === 'function') return validLocale(selectedLyricLocale());
    return '';
  }

  function trackFromPlayer(){
    if(typeof player !== 'undefined' && player?.current) return player.current;
    if(typeof nowPlaying !== 'undefined' && nowPlaying) return nowPlaying;
    return null;
  }

  function songUrl(track){
    const url=baseShareUrl();
    url.searchParams.set('share','song');
    url.searchParams.set('title',clean(track?.title));
    if(track?.artist) url.searchParams.set('artist',clean(track.artist,180));
    if(track?.album) url.searchParams.set('album',clean(track.album,180));
    if(track?.duration) url.searchParams.set('duration',String(Math.max(1,Math.min(7200,Number(track.duration)||0))));
    if(track?.release_year) url.searchParams.set('year',String(track.release_year));
    if(track?.spotifyId || track?.spotify_id) url.searchParams.set('spotify',clean(track.spotifyId || track.spotify_id,100));
    const exactStream=(()=>{
      try{
        const source=typeof player!=='undefined' ? (player.media?.currentSrc || player.media?.src || '') : '';
        const parsed=new URL(source,window.location.origin);
        if(isPhaseStreamOrigin(parsed.origin) && ['/api/stream','/stream'].includes(parsed.pathname) && parsed.searchParams.get('url')){
          return `${parsed.pathname}${parsed.search}`;
        }
      }catch(_error){}
      return '';
    })();
    if(exactStream) url.searchParams.set('stream',exactStream);
    const locale=currentLocale();
    if(locale) url.searchParams.set('locale',locale);
    const packagedLyrics=typeof player!=='undefined' ? encodeLyrics(player.lyrics) : '';
    if(locale && packagedLyrics) url.searchParams.set('lyrics',packagedLyrics);
    return url;
  }

  function searchUrl(query){
    const url=baseShareUrl();
    url.searchParams.set('share','search');
    url.searchParams.set('q',clean(query));
    const locale=currentLocale();
    if(locale) url.searchParams.set('locale',locale);
    return url;
  }

  function showToast(message){
    if(!toast) return;
    clearTimeout(toastTimer);
    toast.textContent=message;
    toast.classList.add('show');
    toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);
  }

  function setBanner(visible, {title='', subtitle='', action=false}={}){
    if(!banner) return;
    clearTimeout(bannerTimer);
    banner.classList.toggle('show',visible);
    banner.setAttribute('aria-hidden',String(!visible));
    if(title) bannerTitle.textContent=title;
    if(subtitle) bannerSub.textContent=subtitle;
    if(bannerActions) bannerActions.hidden=!action;
    if(visible && !action) bannerTimer=setTimeout(()=>setBanner(false),5200);
  }

  function updateShareButtons(){
    const query=clean(input?.value,300);
    if(searchShare){
      searchShare.disabled=!query;
      searchShare.title=query ? 'Share this search' : 'Enter a search to share';
    }
    const track=trackFromPlayer();
    if(trackShare){
      trackShare.disabled=!track?.title;
      trackShare.title=track?.title ? 'Share this song' : 'Play a song to share it';
    }
  }

  async function shareOrCopy(url, title){
    const href=url.toString();
    try{
      if(typeof navigator.share === 'function'){
        await navigator.share({ title, text:`Listen to ${title} with live translations`, url:href });
        return;
      }
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(href);
        showToast('Share link copied');
        return;
      }
    }catch(error){
      if(error?.name==='AbortError') return;
    }
    window.prompt('Copy this share link',href);
  }

  function parseIncoming(){
    const params=new URLSearchParams(window.location.search);
    const kind=params.get('share');
    const locale=validLocale(params.get('locale'));
    if(kind==='search'){
      const query=clean(params.get('q'));
      return query ? { kind, locale, title:query, track:{title:query} } : null;
    }
    if(kind==='song'){
      const title=clean(params.get('title'));
      if(!title) return null;
      const track={
        title,
        artist:clean(params.get('artist'),180),
        album:clean(params.get('album'),180),
        duration:Math.max(0,Math.min(7200,Number(params.get('duration'))||0)),
        release_year:Math.max(0,Math.min(2100,Number(params.get('year'))||0)) || null,
        spotifyId:clean(params.get('spotify'),100) || null,
      };
      const stream=params.get('stream') || '';
      if(stream) track.stream=stream;
      return { kind, locale, title:[track.title,track.artist].filter(Boolean).join(' · '), track,
        lyrics:decodeLyrics(params.get('lyrics')) };
    }
    return null;
  }

  function applyLocale(locale){
    if(!locale) return;
    if(typeof applyLyricLocaleChoice==='function'){
      applyLyricLocaleChoice(locale);
      return;
    }
    const picker=$('#lyricLocale');
    if(picker && [...picker.options].some(option=>option.value===locale)) picker.value=locale;
    if(typeof setLyricLocale==='function') setLyricLocale(locale);
    try{ localStorage.setItem('lyricLocale',locale); }catch(_error){}
  }

  async function waitForPlayback(){
    for(let i=0;i<24;i++){
      if(typeof player!=='undefined' && player.isPlaying) return true;
      await new Promise(resolve=>setTimeout(resolve,125));
    }
    return !!(typeof player!=='undefined' && player.isPlaying);
  }

  async function startIncoming(){
    sharedTarget=parseIncoming();
    if(!sharedTarget || typeof loadTrack!=='function') return;
    applyLocale(sharedTarget.locale);
    setBanner(true,{ title:sharedTarget.title, subtitle:sharedTarget.locale ? `Loading with live ${sharedTarget.locale} translations…` : 'Loading audio and live lyrics…' });
    try{ history.replaceState({},'',`${window.location.pathname || '/share'}`); }catch(_error){}
    try{
      await loadTrack(sharedTarget.track,{ packagedLyrics:sharedTarget.lyrics, packagedStream:sharedTarget.track.stream });
      const playing=await waitForPlayback();
      const hasSource=typeof player!=='undefined' && player.hasSource;
      if(!hasSource){
        setBanner(true,{title:sharedTarget.title,subtitle:'This shared song could not be resolved right now.'});
      }else if(playing){
        setBanner(true,{title:sharedTarget.title,subtitle:sharedTarget.locale ? `Now playing with live ${sharedTarget.locale} translations.` : 'Now playing with live lyrics.'});
      }else{
        setBanner(true,{title:sharedTarget.title,subtitle:'Your browser is waiting for a tap before it plays audio.',action:true});
      }
    }catch(_error){
      setBanner(true,{title:sharedTarget.title,subtitle:'This shared song could not be resolved right now.'});
    }
  }

  input?.addEventListener('input',updateShareButtons);
  searchShare?.addEventListener('click',()=>{
    const query=clean(input?.value);
    if(query) shareOrCopy(searchUrl(query),`Search: ${query}`);
  });
  trackShare?.addEventListener('click',()=>{
    const track=trackFromPlayer();
    if(track?.title) shareOrCopy(songUrl(track),`${track.title}${track.artist ? ` · ${track.artist}` : ''}`);
  });
  closeBanner?.addEventListener('click',()=>setBanner(false));
  playNow?.addEventListener('click',async()=>{
    if(typeof player==='undefined') return;
    try{
      await player.play();
      if(player.isPlaying) setBanner(false);
    }catch(_error){ showToast('Tap the player button to start audio'); }
  });
  window.addEventListener('phase:track',updateShareButtons);
  updateShareButtons();
  setTimeout(startIncoming,0);
})();
