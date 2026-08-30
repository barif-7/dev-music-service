/* Phase · Field — playback infrastructure.
   AudioPlayer owns media state, PlayerControls owns DOM wiring, and playback
   behavior is composed from rules instead of being embedded in either class. */

class PlaybackRule {
  handle(_event, _player) {
    return false;
  }
}

class PlaybackRuleSet {
  constructor(rules = []) {
    this.rules = [...rules];
  }

  add(rule) {
    if(!rule || typeof rule.handle !== 'function'){
      throw new TypeError('Playback rules must implement handle(event, player)');
    }
    this.rules.push(rule);
    return ()=>this.remove(rule);
  }

  remove(rule) {
    const index = this.rules.indexOf(rule);
    if(index >= 0) this.rules.splice(index, 1);
  }

  dispatch(event, player) {
    for(const rule of this.rules){
      if(rule.handle(event, player) === true) return true;
    }
    return false;
  }
}

class LoopTrackRule extends PlaybackRule {
  constructor({ enabled = true } = {}) {
    super();
    this.enabled = enabled;
  }

  isEnabled(player) {
    return typeof this.enabled === 'function'
      ? !!this.enabled(player)
      : !!this.enabled;
  }

  handle(event, player) {
    if(event !== 'ended' || !this.isEnabled(player) || !player.hasSource) return false;
    player.restart();
    return true;
  }
}

class AudioPlayer {
  constructor(mediaElement, { rules = [] } = {}) {
    if(!mediaElement) throw new Error('AudioPlayer requires a media element');
    this.media = mediaElement;
    this.rules = rules instanceof PlaybackRuleSet ? rules : new PlaybackRuleSet(rules);
    this.current = null;
    this.duration = 0;
    this.lyrics = [];
    this.webpageUrl = null;
    this.progress = 0;
    this.accent = [1, 1, 1];
    this.externalTransport = null;
    this.revision = 0;
    this._subscribers = new Set();
    this.media.loop = false;
    this.media.addEventListener('play', ()=>this.notify('playback', { playing:true }));
    this.media.addEventListener('pause', ()=>this.notify('playback', { playing:false }));
    this.media.addEventListener('ended', ()=>{
      this.notify('playback', { playing:false, ended:true });
      this.rules.dispatch('ended', this);
    });
  }

  get hasSource() {
    if(this.externalTransport?.isActive) return !!this.externalTransport.hasSource;
    return !!this.media.src;
  }

  get isPlaying() {
    if(this.externalTransport?.isActive) return !!this.externalTransport.isPlaying;
    return this.hasSource && !this.media.paused && !this.media.ended;
  }

  get currentTime() {
    if(this.externalTransport?.isActive) return this.externalTransport.currentTime || 0;
    return this.media.currentTime || 0;
  }

  get playbackDuration() {
    if(this.externalTransport?.isActive){
      return this.externalTransport.duration || this.duration || 0;
    }
    return this.media.duration || this.duration || 0;
  }

  /* Discrete player state is observable so plugin scenes can update at the
     moment track/lyric data changes. Continuous playback values still travel
     through the shared animation-frame channel. */
  subscribe(fn) {
    if(typeof fn !== 'function') return ()=>{};
    this._subscribers.add(fn);
    return ()=>this._subscribers.delete(fn);
  }

  notify(type, detail = {}) {
    const event = { type, detail, revision:++this.revision };
    for(const fn of this._subscribers){
      try{ fn(event); }catch(error){ console.warn('AudioPlayer subscriber', error); }
    }
    window.dispatchEvent(new CustomEvent('phase:player', { detail:event }));
    return event;
  }

  setExternalTransport(transport = null) {
    this.externalTransport = transport;
    this.notify('transport', { active:Boolean(transport) });
    return transport;
  }

  setTrack(track) {
    this.current = track;
    this.notify('track', { track });
    return this.current;
  }

  updateCurrent(patch) {
    this.current = { ...(this.current || {}), ...patch };
    this.notify('track', { track:this.current, patch });
    return this.current;
  }

  setLyrics(lines = []) {
    this.lyrics = lines;
    this.notify('lyrics', { count:lines.length });
  }

  loadSource(url, { webpageUrl = null, duration = 0 } = {}) {
    this.webpageUrl = webpageUrl;
    this.duration = duration || 0;
    this.progress = 0;
    this.media.src = url;
    this.notify('source', { url, webpageUrl, duration:this.duration });
    this.rules.dispatch('source-loaded', this);
  }

  play() {
    if(this.externalTransport?.isActive){
      const result = Promise.resolve(this.externalTransport.play());
      this.notify('playback', { playing:true, external:true });
      return result;
    }
    if(!this.hasSource) return Promise.resolve();
    const result = this.media.play();
    return result && typeof result.catch === 'function' ? result : Promise.resolve();
  }

  pause() {
    if(this.externalTransport?.isActive){
      this.externalTransport.pause();
      this.notify('playback', { playing:false, external:true });
      return;
    }
    this.media.pause();
  }

  toggle() {
    if(this.isPlaying){
      this.pause();
      return Promise.resolve();
    }
    return this.play();
  }

  seekTo(seconds) {
    const duration = this.playbackDuration;
    if(!duration) return;
    const target = Math.max(0, Math.min(duration, seconds));
    if(this.externalTransport?.isActive)this.externalTransport.seekTo(target);
    else this.media.currentTime = target;
    this.updateProgress();
    this.notify('seek', { time:target });
  }

  seekToRatio(ratio) {
    const duration = this.playbackDuration;
    if(!duration) return;
    this.seekTo(Math.max(0, Math.min(1, ratio)) * duration);
  }

  restart() {
    if(this.externalTransport?.isActive)this.externalTransport.seekTo(0);
    else this.media.currentTime = 0;
    this.progress = 0;
    this.play().catch(()=>{});
  }

  updateProgress() {
    const duration = this.playbackDuration;
    this.progress = duration ? this.currentTime / duration : 0;
    return this.progress;
  }
}

class PlayerControls {
  constructor({
    player,
    bar,
    playButton,
    playIcon,
    previousButton,
    nextButton,
    scrubber,
    fill,
    time,
    title,
    subtitle,
    artwork,
    artworkImage,
    onPrevious = ()=>{},
    onNext = ()=>{},
    onTrackRendered = ()=>{},
  }) {
    this.player = player;
    this.elements = {
      bar, playButton, playIcon, previousButton, nextButton, scrubber,
      fill, time, title, subtitle, artwork, artworkImage,
    };
    this.onPrevious = onPrevious;
    this.onNext = onNext;
    this.onTrackRendered = onTrackRendered;
    this.playIcon = '<path d="M8 5v14l11-7z"/>';
    this.pauseIcon = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
  }

  bind() {
    const e = this.elements;
    e.playButton?.addEventListener('click', ()=>this.player.toggle().catch(()=>{}));
    e.previousButton?.addEventListener('click', ()=>this.onPrevious());
    e.nextButton?.addEventListener('click', ()=>this.onNext());
    e.scrubber?.addEventListener('click', event=>{
      const rect = e.scrubber.getBoundingClientRect();
      if(!rect.width) return;
      this.player.seekToRatio((event.clientX - rect.left) / rect.width);
    });
    e.scrubber?.addEventListener('keydown', event=>{
      const duration = this.player.playbackDuration;
      if(!duration) return;
      let delta = 0;
      if(event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = 5;
      else if(event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -5;
      else if(event.key === 'Home'){
        event.preventDefault();
        this.player.seekTo(0);
        return;
      } else if(event.key === 'End'){
        event.preventDefault();
        this.player.seekTo(duration);
        return;
      } else {
        return;
      }
      event.preventDefault();
      this.player.seekTo(this.player.currentTime + delta);
    });
    return this;
  }

  renderTrack(track, status = '') {
    const e = this.elements;
    if(!e.bar) return;
    e.bar.dataset.empty = '0';
    if(e.title) e.title.textContent = track.title || 'Untitled';
    if(e.subtitle){
      e.subtitle.textContent = [track.artist, track.album].filter(Boolean).join(' · ') || status;
    }
    if(e.artwork && e.artworkImage){
      if(track.thumbnail){
        e.artworkImage.src = track.thumbnail;
        e.artwork.classList.add('has');
      } else {
        e.artwork.classList.remove('has');
        e.artworkImage.removeAttribute('src');
      }
    }
    this.onTrackRendered(track);
  }

  update() {
    const e = this.elements;
    const progress = this.player.updateProgress();
    if(e.playIcon) e.playIcon.innerHTML = this.player.isPlaying ? this.pauseIcon : this.playIcon;
    if(e.playButton) e.playButton.setAttribute('aria-pressed', this.player.isPlaying ? 'true' : 'false');
    if(e.fill) e.fill.style.width = `${(progress * 100).toFixed(1)}%`;
    if(e.time) e.time.textContent = PlayerControls.formatTime(this.player.currentTime);
    if(e.scrubber){
      const duration = this.player.playbackDuration;
      const current = this.player.currentTime;
      e.scrubber.setAttribute('aria-valuemax', String(Math.max(0, duration | 0)));
      e.scrubber.setAttribute('aria-valuenow', String(Math.max(0, current | 0)));
      e.scrubber.setAttribute('aria-valuetext', `${PlayerControls.formatTime(current)} of ${PlayerControls.formatTime(duration)}`);
    }
    return progress;
  }

  static formatTime(seconds) {
    const value = Math.max(0, seconds | 0);
    return `${(value / 60) | 0}:${String(value % 60).padStart(2, '0')}`;
  }
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    AudioPlayer,
    LoopTrackRule,
    PlaybackRule,
    PlaybackRuleSet,
    PlayerControls,
  };
}
