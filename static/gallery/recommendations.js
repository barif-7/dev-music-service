/* Phase · Field — recommendation API client and bounded listening history.
   Only observed playback and real audio measurements become listening history.
   The playing set remains authoritative until someone explicitly picks a song. */
(function(root){
  'use strict';
  const HISTORY_LIMIT = 100;
  const FEATURE_FIELDS = ['energy', 'instrumentalness', 'valence', 'speechiness', 'liveness'];
  const numberIn = (value, min, max) => value !== null && value !== undefined && value !== '' &&
    Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
  const text = (value, max=500) => String(value || '').slice(0, max);

  function apiTrack(track = {}, features = null){
    const provider = track.provider || track.source_provider || '';
    const providerId = track.providerTrackId || track.provider_track_id || '';
    const spotifyId = track.spotifyId || track.spotify_id || (provider === 'spotify' ? providerId : '');
    const source = features || track;
    const result = {
      key:text(track.playlistKey || track.key || '', 1000),
      title:text(String(track.title || '').trim() || 'Untitled track'), artist:text(track.artist), album:text(track.album),
      thumbnail:text(track.thumbnail, 2000), duration:numberIn(track.duration, 0, 86400),
      spotify_id:/^[A-Za-z0-9]{1,100}$/.test(spotifyId) ? spotifyId : null,
      provider:text(provider, 60), provider_track_id:text(providerId, 200),
      webpage_url:text(track.webpage_url || track.webpageUrl || '', 2000),
      tempo:numberIn(source.tempo, 30, 300),
      feature_source:text(source.feature_source || (features ? source.source : ''), 80),
      play_count:Math.max(1, Math.min(10000, Math.floor(Number(track.play_count || track.playCount) || 1))),
      played_at:numberIn(track.played_at || track.playedAt, 0, 1e14),
    };
    for(const field of FEATURE_FIELDS) result[field] = numberIn(source[field], 0, 1);
    if(!result.key) result.key = spotifyId ? `spotify:${spotifyId}` : result.webpage_url ? `url:${result.webpage_url}`
      : `meta:${result.title.toLowerCase()}|${result.artist.toLowerCase()}|${result.album.toLowerCase()}`;
    return result;
  }

  function phaseTrack(track){
    return {
      ...track, playlistKey:track.key || undefined,
      spotifyId:track.spotify_id || null, providerTrackId:track.provider_track_id || null,
    };
  }

  class RecommendationClient {
    constructor({ playlist, player, storage=null, fetcher=root.fetch?.bind(root),
      getFeatures=()=>null, getLiveTempo=()=>0, now=()=>Date.now(), onChange=()=>{}, playTrack=()=>{} }={}){
      this.playlist = playlist; this.player = player; this.storage = storage; this.fetcher = fetcher;
      this.getFeatures = getFeatures; this.getLiveTempo = getLiveTempo; this.now = now;
      this.onChange = onChange; this.playTrack = playTrack;
      this.history = []; this.cache = new Map(); this.storageKey = null; this.version = 0;
      this.ready = null; this.session = null;
    }

    async initialize(){
      if(this.ready) return this.ready;
      this.ready = (async()=>{
        try{
          const response = await this.fetcher('/api/auth/status', {signal:AbortSignal.timeout(5000), cache:'no-store'});
          if(!response.ok) return;
          const auth = await response.json();
          if(auth.enabled && !auth.authenticated) return;
          const identity = auth.email || 'local';
          this.storageKey = `phaseField.listening.v1:${encodeURIComponent(identity)}`;
          const saved = JSON.parse(this.storage?.getItem(this.storageKey) || '[]');
          if(Array.isArray(saved)) this.history = saved.filter(track=>track && track.title).slice(0, HISTORY_LIMIT).map(track=>apiTrack(track));
        }catch(_error){ /* An unknown identity gets memory-only history. */ }
      })();
      return this.ready;
    }

    invalidate(){ this.version++; this.cache.clear(); this.onChange(); }

    persist(){
      try{ if(this.storageKey) this.storage?.setItem(this.storageKey, JSON.stringify(this.history)); }catch(_error){}
      this.invalidate();
    }

    start(){
      this.initialize();
      this.unsubscribe = this.player?.subscribe(event=>{
        if(event.type === 'source') this.session = null;
      });
      this.onTimeUpdate = ()=>this.sample();
      this.player?.media?.addEventListener('timeupdate', this.onTimeUpdate);
      // External transports do not emit timeupdate on the shared audio element.
      this.timer = setInterval(()=>{ if(this.player?.externalTransport?.isActive) this.sample(); }, 1000);
    }

    stop(){
      this.unsubscribe?.(); clearInterval(this.timer);
      this.player?.media?.removeEventListener('timeupdate', this.onTimeUpdate);
    }

    sample(){
      const current = this.player?.current;
      if(!current?.title) return;
      const track = apiTrack(current);
      const position = Number(this.player.currentTime || 0);
      const timestamp = this.now();
      if(!this.session || this.session.key !== track.key){
        this.session = {key:track.key, position, timestamp, seconds:0, recorded:false, tempos:[]};
        return;
      }
      const session = this.session;
      const delta = position - session.position;
      const elapsed = (timestamp - session.timestamp) / 1000;
      session.position = position; session.timestamp = timestamp;
      // Seeking, buffering, pauses, and failed play attempts are not listens.
      if(!this.player.isPlaying || delta <= 0 || delta > 3 || delta > elapsed * 2 + 0.25) return;
      session.seconds += Math.min(delta, Math.max(0, elapsed));
      const liveTempo = numberIn(this.getLiveTempo(), 30, 300);
      if(liveTempo) session.tempos = [...session.tempos, liveTempo].slice(-15);
      if(session.seconds >= 10 && !session.recorded){
        session.recorded = true;
        const features = this.getFeatures();
        let measured = apiTrack(current, features);
        if(!measured.tempo && session.tempos.length >= 5){
          const samples = [...session.tempos].sort((a,b)=>a-b);
          measured.tempo = Math.round(samples[Math.floor(samples.length / 2)] * 10) / 10;
          measured.feature_source = 'live';
        }
        // Capture before awaiting identity lookup: the player may switch tracks.
        this.record(measured).catch(()=>{});
      }
    }

    async record(track){
      await this.initialize();
      const next = apiTrack(track);
      const previous = this.history.find(item=>item.key === next.key);
      // Keep a known measurement if a subsequent play has no usable features.
      for(const field of ['tempo', ...FEATURE_FIELDS]){
        if(next[field] == null && previous?.[field] != null) next[field] = previous[field];
      }
      if(!next.feature_source) next.feature_source = previous?.feature_source || '';
      next.play_count = Math.min(10000, (previous?.play_count || 0) + 1);
      next.played_at = this.now();
      this.history = [next, ...this.history.filter(item=>item.key !== next.key)].slice(0, HISTORY_LIMIT);
      this.persist();
    }

    updateFeatures(){
      const current = this.player?.current;
      if(!current) return;
      const measured = apiTrack(current, this.getFeatures());
      const entry = this.history.find(item=>item.key === measured.key);
      if(entry && measured.tempo){
        for(const field of ['tempo', ...FEATURE_FIELDS]) if(measured[field] != null) entry[field] = measured[field];
        entry.feature_source = measured.feature_source;
        this.persist();
      }else this.invalidate();
    }

    async load({mode='blend', force=false}={}){
      await this.initialize();
      const snapshot = this.playlist?.snapshot() || {items:[], revision:0};
      const cacheKey = `${mode}:${snapshot.revision}:${this.version}`;
      const cached = this.cache.get(cacheKey);
      if(!force && cached && this.now() - cached.at < 45000) return cached.value;
      const current = this.player?.current;
      const currentTrack = current ? apiTrack(current, this.getFeatures()) : null;
      if(currentTrack && !currentTrack.tempo && this.session?.tempos.length >= 5){
        const tempos = [...this.session.tempos].sort((a,b)=>a-b);
        currentTrack.tempo = Math.round(tempos[Math.floor(tempos.length/2)] * 10) / 10;
        currentTrack.feature_source = 'live';
      }
      const response = await this.fetcher('/api/recommendations', {
        method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(20000),
        body:JSON.stringify({mode, candidates:snapshot.items.slice(0,250).map(track=>apiTrack(track)),
          history:this.history, current_track:currentTrack, limit:20}),
      });
      if(!response.ok){
        if(response.status === 401 || response.status === 403) throw new Error('Sign in again to load recommendations.');
        throw new Error('Recommendations could not load. Try again.');
      }
      const payload = await response.json();
      if(!Array.isArray(payload.tracks)) throw new Error('Recommendations returned an invalid response. Try again.');
      const value = {...payload, tracks:payload.tracks.map(phaseTrack)};
      this.cache.set(cacheKey, {at:this.now(), value});
      // Only the three mode snapshots are useful after context changes.
      if(this.cache.size > 6) this.cache.delete(this.cache.keys().next().value);
      return value;
    }

    addNext(track){
      const currentKey = this.playlist.currentKey;
      const index = this.playlist.currentIndex + 1;
      const item = this.playlist.upsert(track, {index, reason:'recommendation-add-next'});
      if(!item) throw new Error('This song could not be added to the playing set.');
      if(item.playlistKey !== currentKey){
        // Existing songs move instead of appearing twice. Recompute after eviction.
        const oldIndex = this.playlist.snapshot().items.findIndex(song=>song.playlistKey === item.playlistKey);
        const destination = this.playlist.currentIndex + (oldIndex < this.playlist.currentIndex ? 0 : 1);
        this.playlist.move(item.playlistKey, destination, {reason:'recommendation-add-next'});
      }
      return item;
    }

    play(track){
      const item = this.addNext(track);
      return this.playTrack(item, {playlistMode:'sync'});
    }
  }

  root.RecommendationClient = RecommendationClient;
  if(typeof module !== 'undefined' && module.exports) module.exports = {RecommendationClient, apiTrack, phaseTrack};
})(typeof window !== 'undefined' ? window : globalThis);
