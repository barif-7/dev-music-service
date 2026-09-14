/* Phase · Field — provider-neutral playlist state and carousel view.
   PlaylistSet is an ordered set: stable track keys prevent duplicates while the
   order remains meaningful for previous/next playback. Only lightweight track
   metadata is retained; audio and artwork bytes stay owned by their providers. */

class PlaylistSet {
  constructor({ tracks = [], maxSize = 250, storage = null, storageKey = 'phaseField.playlist.v1' } = {}) {
    this.maxSize = Math.max(1, Number(maxSize) || 250);
    this.storage = storage;
    this.storageKey = storageKey;
    this.label = 'Playing set';
    this.source = 'manual';
    this.currentKey = null;
    this.revision = 0;
    this._order = [];
    this._items = new Map();
    this._subscribers = new Set();
    if(!this.restore() && tracks.length) this.replace(tracks, { reason:'initial' });
  }

  static keyFor(track = {}) {
    const explicit = track.playlistKey || track.queueKey;
    if(explicit) return String(explicit);
    const provider = track.provider || track.source_provider || track.source || '';
    const providerId = track.providerTrackId || track.provider_track_id || track.spotifyId || track.spotify_id;
    if(providerId) return `${provider || 'provider'}:${providerId}`;
    const webpage = track.webpage_url || track.webpageUrl || track.url;
    if(webpage) return `url:${webpage}`;
    const identity = [track.title, track.artist, track.album]
      .map(value=>String(value || '').trim().toLowerCase()).join('|');
    return identity.replace(/\|/g, '') ? `meta:${identity}` : '';
  }

  get size() { return this._order.length; }
  get currentIndex() { return this.currentKey ? this._order.indexOf(this.currentKey) : -1; }
  get current() { return this.currentKey ? this._items.get(this.currentKey) || null : null; }

  _normalise(track, forcedKey = '') {
    if(!track || typeof track !== 'object') return null;
    const playlistKey = forcedKey || PlaylistSet.keyFor(track);
    if(!playlistKey) return null;
    return {
      ...track,
      playlistKey,
      title:track.title || 'Untitled track',
      artist:track.artist || (Array.isArray(track.artist_names) ? track.artist_names.join(', ') : ''),
      duration:Number(track.duration || 0),
    };
  }

  _persist() {
    if(!this.storage) return;
    try{
      this.storage.setItem(this.storageKey, JSON.stringify({
        version:1, label:this.label, source:this.source, currentKey:this.currentKey,
        items:this._order.map(key=>this._items.get(key)),
      }));
    }catch(_error){ /* storage is best-effort */ }
  }

  _commit(type, reason = type) {
    this.revision += 1;
    this._persist();
    const snapshot = this.snapshot();
    const event = { type, reason, revision:this.revision };
    for(const subscriber of this._subscribers){
      try{ subscriber(snapshot, event); }catch(error){ console.warn('PlaylistSet subscriber', error); }
    }
    if(typeof window !== 'undefined'){
      window.dispatchEvent(new CustomEvent('phase:playlist', { detail:{ snapshot, event } }));
    }
    return snapshot;
  }

  subscribe(subscriber, { emitCurrent = true } = {}) {
    if(typeof subscriber !== 'function') return ()=>{};
    this._subscribers.add(subscriber);
    if(emitCurrent) subscriber(this.snapshot(), { type:'init', reason:'subscribe', revision:this.revision });
    return ()=>this._subscribers.delete(subscriber);
  }

  snapshot() {
    const items = this._order.map(key=>this._items.get(key)).filter(Boolean);
    const currentIndex = this.currentIndex;
    return {
      label:this.label, source:this.source, items, size:items.length,
      currentKey:this.currentKey, currentIndex,
      current:currentIndex >= 0 ? items[currentIndex] : null,
      previous:currentIndex > 0 ? items[currentIndex - 1] : null,
      next:currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null,
      hasPrevious:currentIndex > 0,
      hasNext:currentIndex >= 0 && currentIndex < items.length - 1,
      revision:this.revision, capped:items.length >= this.maxSize, maxSize:this.maxSize,
    };
  }

  replace(tracks = [], {
    currentKey = null, currentIndex = 0, label = 'Playing set', source = 'manual', reason = 'replace',
  } = {}) {
    const nextOrder = [];
    const nextItems = new Map();
    for(const raw of tracks){
      const item = this._normalise(raw);
      if(!item) continue;
      if(!nextItems.has(item.playlistKey)) nextOrder.push(item.playlistKey);
      nextItems.set(item.playlistKey, { ...(nextItems.get(item.playlistKey) || {}), ...item });
      if(nextOrder.length >= this.maxSize) break;
    }
    this._order = nextOrder;
    this._items = nextItems;
    this.label = label || 'Playing set';
    this.source = source || 'manual';
    const requestedKey = currentKey && nextItems.has(String(currentKey)) ? String(currentKey) : null;
    const fallbackIndex = Math.max(0, Math.min(nextOrder.length - 1, Number(currentIndex) || 0));
    this.currentKey = requestedKey || nextOrder[fallbackIndex] || null;
    return this._commit('replace', reason);
  }

  addMany(tracks = [], { selectKey = null, label = null, source = null, reason = 'append' } = {}) {
    for(const raw of tracks){
      const item = this._normalise(raw);
      if(!item) continue;
      if(this._items.has(item.playlistKey)){
        this._items.set(item.playlistKey, { ...this._items.get(item.playlistKey), ...item });
        continue;
      }
      if(this.size >= this.maxSize) break;
      this._order.push(item.playlistKey);
      this._items.set(item.playlistKey, item);
    }
    if(label) this.label = label;
    if(source) this.source = source;
    if(selectKey && this._items.has(String(selectKey))) this.currentKey = String(selectKey);
    if(!this.currentKey && this._order.length) this.currentKey = this._order[0];
    return this._commit('append', reason);
  }

  upsert(track, { select = false, index = null, reason = 'upsert' } = {}) {
    const item = this._normalise(track);
    if(!item) return null;
    const key = item.playlistKey;
    if(this._items.has(key)){
      this._items.set(key, { ...this._items.get(key), ...item, playlistKey:key });
    } else {
      if(this.size >= this.maxSize){
        const evictIndex = this._order.findIndex(candidate=>candidate !== this.currentKey);
        if(evictIndex >= 0){
          const [evicted] = this._order.splice(evictIndex, 1);
          this._items.delete(evicted);
        } else return null;
      }
      const target = index == null ? this._order.length : Math.max(0, Math.min(this._order.length, Number(index) || 0));
      this._order.splice(target, 0, key);
      this._items.set(key, item);
    }
    if(select || !this.currentKey) this.currentKey = key;
    this._commit('upsert', reason);
    return this._items.get(key);
  }

  select(target, { reason = 'select' } = {}) {
    const key = typeof target === 'number' ? this._order[target]
      : typeof target === 'string' ? target : PlaylistSet.keyFor(target || {});
    if(!key || !this._items.has(key)) return null;
    if(this.currentKey !== key){
      this.currentKey = key;
      this._commit('select', reason);
    }
    return this._items.get(key);
  }

  peek(offset = 1, { wrap = false } = {}) {
    if(!this.size) return null;
    const currentIndex = this.currentIndex;
    let target = currentIndex < 0 ? (offset < 0 ? this.size - 1 : 0) : currentIndex + Number(offset || 0);
    if(wrap) target = ((target % this.size) + this.size) % this.size;
    if(target < 0 || target >= this.size) return null;
    return this._items.get(this._order[target]) || null;
  }

  advance(offset = 1, { wrap = false, reason = 'advance' } = {}) {
    const item = this.peek(offset, { wrap });
    if(!item) return null;
    this.select(item.playlistKey, { reason });
    return item;
  }

  remove(target, { reason = 'remove' } = {}) {
    const key = typeof target === 'string' ? target : PlaylistSet.keyFor(target || {});
    const index = this._order.indexOf(key);
    if(index < 0) return false;
    this._order.splice(index, 1);
    this._items.delete(key);
    if(this.currentKey === key) this.currentKey = this._order[Math.min(index, this._order.length - 1)] || null;
    this._commit('remove', reason);
    return true;
  }

  move(target, toIndex, { reason = 'move' } = {}) {
    const key = typeof target === 'string' ? target : PlaylistSet.keyFor(target || {});
    const fromIndex = this._order.indexOf(key);
    if(fromIndex < 0) return false;
    const destination = Math.max(0, Math.min(this.size - 1, Number(toIndex) || 0));
    if(fromIndex === destination) return true;
    this._order.splice(fromIndex, 1);
    this._order.splice(destination, 0, key);
    this._commit('move', reason);
    return true;
  }

  clear({ keepCurrent = false, reason = 'clear' } = {}) {
    const current = keepCurrent ? this.current : null;
    this._order = current ? [current.playlistKey] : [];
    this._items = current ? new Map([[current.playlistKey, current]]) : new Map();
    this.currentKey = current?.playlistKey || null;
    return this._commit('clear', reason);
  }

  restore() {
    if(!this.storage) return false;
    try{
      const saved = JSON.parse(this.storage.getItem(this.storageKey) || 'null');
      if(saved?.version !== 1 || !Array.isArray(saved.items)) return false;
      const order = [];
      const items = new Map();
      for(const raw of saved.items.slice(0, this.maxSize)){
        const item = this._normalise(raw);
        if(!item || items.has(item.playlistKey)) continue;
        order.push(item.playlistKey);
        items.set(item.playlistKey, item);
      }
      this._order = order;
      this._items = items;
      this.currentKey = items.has(saved.currentKey) ? saved.currentKey : order[0] || null;
      this.label = saved.label || 'Playing set';
      this.source = saved.source || 'restored';
      return order.length > 0;
    }catch(_error){ return false; }
  }
}

class PlaylistAdvanceRule {
  constructor({ playlist, onAdvance, wrap = false } = {}) {
    this.playlist = playlist;
    this.onAdvance = onAdvance;
    this.wrap = wrap;
  }

  handle(event, player) {
    if(event !== 'ended' || !this.playlist || typeof this.onAdvance !== 'function') return false;
    const next = this.playlist.advance(1, { wrap:this.wrap, reason:'track-ended' });
    if(!next) return false;
    Promise.resolve(this.onAdvance(next, { reason:'track-ended', player })).catch(error=>{
      console.warn('Playlist advance failed', error);
    });
    return true;
  }
}

class PlaylistCarousel {
  constructor({ playlist, root, rail, toggleButton, countElement, titleElement, positionElement,
    nextElement, previousPageButton, nextPageButton, clearButton, closeButton,
    onPlay = ()=>{}, renderLimit = 30 } = {}) {
    this.playlist = playlist;
    this.root = root;
    this.rail = rail;
    this.toggleButton = toggleButton;
    this.countElement = countElement;
    this.titleElement = titleElement;
    this.positionElement = positionElement;
    this.nextElement = nextElement;
    this.previousPageButton = previousPageButton;
    this.nextPageButton = nextPageButton;
    this.clearButton = clearButton;
    this.closeButton = closeButton;
    this.onPlay = onPlay;
    this.renderLimit = Math.max(5, Number(renderLimit) || 30);
    this.opened = false;
    this.userClosed = false;
    toggleButton?.addEventListener('click', ()=>this.toggle());
    closeButton?.addEventListener('click', ()=>this.close({ user:true }));
    clearButton?.addEventListener('click', ()=>playlist?.clear({ keepCurrent:true, reason:'clear-upcoming' }));
    previousPageButton?.addEventListener('click', ()=>this.scroll(-1));
    nextPageButton?.addEventListener('click', ()=>this.scroll(1));
    this.unsubscribe = playlist?.subscribe((snapshot, event)=>{
      this.render(snapshot, event);
      if(snapshot.size > 1 && ['replace', 'append'].includes(event.type) && !this.userClosed) this.open();
    });
  }

  open() {
    if(!this.playlist?.size) return;
    this.opened = true;
    this.userClosed = false;
    document.body?.classList.add('playlist-carousel-open');
    this.root?.classList.add('show');
    this.root?.setAttribute('aria-hidden', 'false');
    this.toggleButton?.setAttribute('aria-expanded', 'true');
  }

  close({ user = false } = {}) {
    this.opened = false;
    if(user) this.userClosed = true;
    document.body?.classList.remove('playlist-carousel-open');
    this.root?.classList.remove('show');
    this.root?.setAttribute('aria-hidden', 'true');
    this.toggleButton?.setAttribute('aria-expanded', 'false');
  }

  toggle() { this.opened ? this.close({ user:true }) : this.open(); }

  scroll(direction) {
    this.rail?.scrollBy({ left:direction * Math.max(220, this.rail.clientWidth * 0.78), behavior:'smooth' });
  }

  _visibleWindow(snapshot) {
    if(snapshot.size <= this.renderLimit) return { items:snapshot.items, start:0 };
    const lead = Math.min(4, Math.floor(this.renderLimit / 3));
    const start = Math.max(0, Math.min(snapshot.size - this.renderLimit, snapshot.currentIndex - lead));
    return { items:snapshot.items.slice(start, start + this.renderLimit), start };
  }

  _card(track, index, snapshot) {
    const item = document.createElement('div');
    item.className = 'pc-card';
    item.setAttribute('role', 'listitem');
    item.dataset.key = track.playlistKey;
    if(index === snapshot.currentIndex) item.classList.add('current');
    else if(index < snapshot.currentIndex) item.classList.add('played');
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'pc-card-main';
    play.setAttribute('aria-label', `${index === snapshot.currentIndex ? 'Restart' : 'Play'} ${track.title}`);
    if(index === snapshot.currentIndex) play.setAttribute('aria-current', 'true');
    const art = document.createElement('span');
    art.className = 'pc-art';
    if(track.thumbnail){
      const image = document.createElement('img');
      image.src = track.thumbnail;
      image.alt = '';
      image.loading = 'lazy';
      art.appendChild(image);
    } else art.textContent = '♪';
    const copy = document.createElement('span');
    copy.className = 'pc-copy';
    const order = document.createElement('span');
    order.className = 'pc-order';
    order.textContent = index === snapshot.currentIndex ? 'Playing' : index > snapshot.currentIndex ? `Up next · ${index + 1}` : `Played · ${index + 1}`;
    const title = document.createElement('strong');
    title.textContent = track.title || 'Untitled track';
    const artist = document.createElement('span');
    artist.textContent = track.artist || track.album || 'Unknown artist';
    copy.append(order, title, artist);
    play.append(art, copy);
    play.addEventListener('click', ()=>{
      const selected = this.playlist.select(track.playlistKey, { reason:'carousel-pick' });
      if(selected) this.onPlay(selected, { reason:'carousel-pick' });
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pc-remove';
    remove.textContent = '×';
    remove.disabled = index === snapshot.currentIndex;
    remove.setAttribute('aria-label', index === snapshot.currentIndex ? `${track.title} is playing` : `Remove ${track.title} from set`);
    remove.addEventListener('click', ()=>this.playlist.remove(track.playlistKey, { reason:'carousel-remove' }));
    item.append(play, remove);
    return item;
  }

  render(snapshot = this.playlist?.snapshot(), event = { type:'render' }) {
    if(!snapshot || !this.root || !this.rail) return;
    this.root.hidden = snapshot.size === 0;
    if(this.toggleButton) this.toggleButton.disabled = snapshot.size === 0;
    if(this.countElement) this.countElement.textContent = String(snapshot.size);
    if(this.titleElement) this.titleElement.textContent = snapshot.label || 'Playing set';
    if(this.positionElement) this.positionElement.textContent = snapshot.size ? `${snapshot.currentIndex + 1} / ${snapshot.size}` : '0 / 0';
    if(this.nextElement) this.nextElement.textContent = snapshot.next ? `Next · ${snapshot.next.title}` : 'End of set · current track will loop';
    if(this.clearButton) this.clearButton.disabled = !snapshot.hasNext && !snapshot.hasPrevious;
    this.toggleButton?.setAttribute('aria-label', `Open playing set, ${snapshot.size} tracks`);
    const windowed = this._visibleWindow(snapshot);
    const fragment = document.createDocumentFragment();
    windowed.items.forEach((track, localIndex)=>fragment.appendChild(this._card(track, windowed.start + localIndex, snapshot)));
    this.rail.replaceChildren(fragment);
    if(['replace', 'select', 'advance'].includes(event.type)){
      requestAnimationFrame(()=>this.rail.querySelector('.pc-card.current')?.scrollIntoView({ block:'nearest', inline:'center' }));
    }
    if(!snapshot.size) this.close();
  }
}

if(typeof window !== 'undefined'){
  window.PlaylistSet = PlaylistSet;
  window.PlaylistAdvanceRule = PlaylistAdvanceRule;
  window.PlaylistCarousel = PlaylistCarousel;
}
if(typeof module !== 'undefined' && module.exports){
  module.exports = { PlaylistSet, PlaylistAdvanceRule, PlaylistCarousel };
}
