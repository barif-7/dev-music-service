/* Motion safety — honour prefers-reduced-motion per wallpaper.

   Each wallpaper carries an `a11y` risk in data.js. The risk is advisory on its
   own; this turns it into behaviour by slowing the shader clock for the
   wallpapers that actually move enough to cause trouble.

   Slowing time rather than freezing it is deliberate. A frozen backdrop reads
   as a broken canvas, and the reactive uniforms still need a clock to sit on;
   damping keeps the visual alive while removing the fast, high-contrast motion
   that drives vestibular and photosensitive discomfort.

   Risk is assigned from the wallpaper's focus preset and tempo, plus its
   shader's measured motion: how fast it advances, whether whole-screen
   brightness is driven by the beat, and whether it carries fine repeating
   patterns that shimmer when they move. */
const MotionSafety = {
  /* Shader-clock rate per risk when reduced motion is requested. */
  rates: { none: 1, low: 1, medium: .6, high: .35 },

  _query: window.matchMedia?.('(prefers-reduced-motion: reduce)') || null,
  _override: null,               // null = follow the OS; true/false = forced

  /* True when the user has asked for reduced motion, by OS setting or override. */
  reduced(){
    if(this._override !== null) return this._override;
    return !!this._query?.matches;
  },

  riskFor(id){
    const list = typeof ALTS !== 'undefined' ? ALTS : null;
    const entry = list?.find(item => item.id === id);
    return entry?.a11y || 'low';
  },

  /* Multiplier for a wallpaper's shader clock. 1 when motion is unrestricted,
     so the default path is bit-for-bit what it was before. */
  rateFor(id){
    if(!this.reduced()) return 1;
    return this.rates[this.riskFor(id)] ?? 1;
  },

  /* Wallpapers worth warning about in the picker. */
  isHighMotion(id){ return this.riskFor(id) === 'high'; },

  _subs: [],
  subscribe(fn){
    this._subs.push(fn);
    return ()=>{ const i = this._subs.indexOf(fn); if(i >= 0) this._subs.splice(i, 1); };
  },
  _emit(){
    for(const fn of this._subs){
      try{ fn(this.reduced()); }catch(e){ console.warn('motion safety sub', e); }
    }
  },

  /* Force reduced motion on or off; pass null to follow the OS again. */
  setOverride(value){
    this._override = value === null ? null : !!value;
    this._emit();
  },
};

MotionSafety._query?.addEventListener?.('change', ()=>MotionSafety._emit());
