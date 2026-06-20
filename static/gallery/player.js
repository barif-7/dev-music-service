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
    this.media.loop = false;
    this.media.addEventListener('ended', ()=>this.rules.dispatch('ended', this));
  }

  get hasSource() {
    return !!this.media.src;
  }

  get isPlaying() {
    return this.hasSource && !this.media.paused && !this.media.ended;
  }

  get currentTime() {
    return this.media.currentTime || 0;
  }

  setTrack(track) {
    this.current = track;
    return this.current;
  }

  updateCurrent(patch) {
    this.current = { ...(this.current || {}), ...patch };
    return this.current;
  }

  setLyrics(lines = []) {
    this.lyrics = lines;
  }

  loadSource(url, { webpageUrl = null, duration = 0 } = {}) {
    this.webpageUrl = webpageUrl;
    this.duration = duration || 0;
    this.progress = 0;
    this.media.src = url;
    this.rules.dispatch('source-loaded', this);
  }

  play() {
    if(!this.hasSource) return Promise.resolve();
    const result = this.media.play();
    return result && typeof result.catch === 'function' ? result : Promise.resolve();
  }

  pause() {
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
    const duration = this.media.duration || this.duration || 0;
    if(!duration) return;
    this.media.currentTime = Math.max(0, Math.min(duration, seconds));
    this.updateProgress();
  }

  seekToRatio(ratio) {
    const duration = this.media.duration || this.duration || 0;
    if(!duration) return;
    this.seekTo(Math.max(0, Math.min(1, ratio)) * duration);
  }

  restart() {
    this.media.currentTime = 0;
    this.progress = 0;
    this.play().catch(()=>{});
  }

  updateProgress() {
    const duration = this.media.duration || this.duration || 0;
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
    if(e.fill) e.fill.style.width = `${(progress * 100).toFixed(1)}%`;
    if(e.time) e.time.textContent = PlayerControls.formatTime(this.player.currentTime);
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
