/* Reader preferences — owned by the shell, not the embedded surface.

   These used to live inside the reader iframe, which then posted them back out
   so the shell could style itself. The child was the source of truth for the
   parent's appearance, and every change made a round trip. The shell owns them
   now; the surface receives them in its scene and reports changes as intents. */
const ReaderPreferences = {
  KEY:        'phaseField.lyricReaderPreferences',
  VIEW_KEY:   'phaseField.lyricReaderView',
  BG_KEY:     'phaseField.lyricReaderBackground',

  enums: {
    windowShape:      ['rounded', 'circle', 'square'],
    windowAppearance: ['window', 'textOnly', 'shareSheet'],
    layout:           ['stacked', 'sideBySide', 'focus'],
    originalSize:     ['standard', 'large', 'xlarge'],
    translationSize:  ['standard', 'large', 'xlarge'],
    lineSpacing:      ['compact', 'normal', 'relaxed'],
  },
  flags: [
    'highContrast', 'reducedMotion', 'dyslexiaFont', 'srAnnouncements', 'showLabels',
    'showTransliteration', 'textPlate', 'spectrumVisible', 'wordGlow', 'lyricsBehindShader',
  ],
  views: ['visual', 'timeline', 'learn'],

  _subs: [],
  values: null,
  view: 'visual',
  backgroundVisible: true,

  defaults(){
    return {
      windowShape:'rounded', windowAppearance:'window', layout:'stacked',
      originalSize:'standard', translationSize:'standard', lineSpacing:'normal',
      highContrast:false,
      reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
      dyslexiaFont:false, srAnnouncements:true, showLabels:true, showTransliteration:true,
      textPlate:false, spectrumVisible:true, wordGlow:false, lyricsBehindShader:false,
    };
  },

  /* Older builds stored a few of these under different names/values. */
  _migrate(stored){
    const out = { ...stored };
    if(stored.shape && !stored.windowShape) out.windowShape = stored.shape;
    if(stored.translationLayout && !stored.layout){
      out.layout = stored.translationLayout === 'side-by-side' ? 'sideBySide' : stored.translationLayout;
    }
    if(stored.textScale){
      const scale = stored.textScale === 'extra-large' ? 'xlarge' : stored.textScale;
      if(!stored.originalSize) out.originalSize = scale;
      if(!stored.translationSize) out.translationSize = scale;
    }
    if(typeof stored.reduceMotion === 'boolean' && typeof stored.reducedMotion !== 'boolean'){
      out.reducedMotion = stored.reduceMotion;
    }
    return out;
  },

  _sanitize(raw){
    const defaults = this.defaults();
    const stored = this._migrate(raw && typeof raw === 'object' ? raw : {});
    const out = {};
    for(const [key, allowed] of Object.entries(this.enums)){
      out[key] = allowed.includes(stored[key]) ? stored[key] : defaults[key];
    }
    for(const key of this.flags){
      out[key] = typeof stored[key] === 'boolean' ? stored[key] : defaults[key];
    }
    return out;
  },

  load(){
    let stored = {};
    try{ stored = JSON.parse(localStorage.getItem(this.KEY) || '{}'); }catch(e){ /* defaults */ }
    this.values = this._sanitize(stored);
    try{
      const view = localStorage.getItem(this.VIEW_KEY);
      if(this.views.includes(view)) this.view = view;
      this.backgroundVisible = localStorage.getItem(this.BG_KEY) !== 'hidden';
    }catch(e){ /* defaults */ }
    this.apply();
    return this.values;
  },

  _persist(){
    try{
      localStorage.setItem(this.KEY, JSON.stringify(this.values));
      localStorage.setItem(this.VIEW_KEY, this.view);
      localStorage.setItem(this.BG_KEY, this.backgroundVisible ? 'visible' : 'hidden');
    }catch(e){ /* storage unavailable — preferences stay in-memory */ }
  },

  /* Reflect the current preferences into the shell's own DOM. */
  apply(){
    const reader = document.getElementById('lyricReader');
    if(reader){
      for(const shape of this.enums.windowShape){
        reader.classList.toggle(`reader-shape-${shape}`, shape === this.values.windowShape);
      }
      reader.classList.toggle('reader-text-only', this.values.windowAppearance === 'textOnly');
      reader.classList.toggle('reader-share-sheet', this.values.windowAppearance === 'shareSheet');
      reader.classList.toggle('background-hidden', !this.backgroundVisible);
    }
    document.body.classList.toggle('lyrics-share-sheet', this.values.windowAppearance === 'shareSheet');
    const hidden = this.values.spectrumVisible === false;
    document.body.classList.toggle('lyrics-spectrum-hidden', hidden);
    const spectrum = document.getElementById('eqCanvas');
    if(spectrum) spectrum.hidden = hidden;
  },

  set(key, value){
    if(this.values[key] === undefined || this.values[key] === value) return;
    const next = this._sanitize({ ...this.values, [key]: value });
    if(next[key] === this.values[key]) return;          // rejected by validation
    this.values = next;
    this._persist(); this.apply(); this._emit();
  },
  setView(view){
    if(!this.views.includes(view) || view === this.view) return;
    this.view = view;
    this._persist(); this._emit();
  },
  setBackgroundVisible(visible){
    const next = visible !== false;
    if(next === this.backgroundVisible) return;
    this.backgroundVisible = next;
    this._persist(); this.apply(); this._emit();
  },

  subscribe(fn){
    this._subs.push(fn);
    return ()=>{ const i = this._subs.indexOf(fn); if(i >= 0) this._subs.splice(i, 1); };
  },
  _emit(){
    for(const fn of this._subs){
      try{ fn(this.values); }catch(e){ console.warn('reader preference sub', e); }
    }
  },
};

ReaderPreferences.load();
