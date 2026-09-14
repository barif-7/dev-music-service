/* PluginChrome — the backdrop a plugin panel sits on, from the catalogue.

   Every plugin used to inherit one appearance: .dock-overlay's 55% glass with a
   28px blur, with the live wallpaper shader running underneath it. That reads as
   a floating pane of glass, which is right for something ambient and wrong for
   an app you work in — text over moving colour is the least legible thing the
   shell can produce.

   So the backdrop is a property of the plugin, declared in plugins.json beside
   its name, and applied here. It is set as custom properties rather than inline
   styles on purpose: .dock-overlay:not(.open) clears the blur so opening ramps
   it up from clear, and an inline backdrop-filter would win over that rule and
   kill the transition. Custom properties feed the rule instead of replacing it.

   Both hosts use this — the apps launcher for anything it mounts, and the
   bespoke panels (the Canvas editor) for themselves. */
const PluginChrome = {
  DEFAULT: { background:'#0c0d10', opacity:0.94, blur:18, saturate:1.5 },

  _catalog: null,
  _pending: null,

  /* The catalogue is fetched once and shared; a second caller joins the first
     request rather than issuing another. */
  load(){
    if(this._catalog) return Promise.resolve(this._catalog);
    if(this._pending) return this._pending;
    this._pending = fetch('/static/gallery/plugins.json', { cache:'no-cache' })
      .then(response => response.json())
      .then(data => {
        this._catalog = data;
        if(data.chromeDefault) this.DEFAULT = { ...this.DEFAULT, ...data.chromeDefault };
        return data;
      })
      .catch(()=>{
        /* No catalogue: every panel keeps the stylesheet's own appearance. */
        this._catalog = { plugins:[] };
        return this._catalog;
      });
    return this._pending;
  },

  entry(id){
    return (this._catalog?.plugins || []).find(plugin => plugin.id === id) || null;
  },

  /* Resolve one plugin's chrome to concrete values. */
  resolve(id){
    const chrome = { ...this.DEFAULT, ...(this.entry(id)?.chrome || {}) };
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(chrome.background);
    const rgb = match ? [1,2,3].map(i => parseInt(match[i], 16)) : [12, 13, 16];
    return {
      ...chrome,
      rgba: `rgba(${rgb.join(',')}, ${chrome.opacity})`,
      /* Blur costs a full-viewport composite every frame. A panel you cannot
         see through has nothing to blur, so it does not pay for one. */
      effectiveBlur: chrome.opacity >= 0.99 ? 0 : (chrome.blur || 0),
    };
  },

  /* Paint one panel. Safe to call before the catalogue has loaded — it applies
     as soon as it arrives. */
  apply(id, element){
    if(!element) return Promise.resolve(null);
    return this.load().then(()=>{
      const chrome = this.resolve(id);
      element.style.setProperty('--panel-bg', chrome.rgba);
      element.style.setProperty('--panel-blur', `${chrome.effectiveBlur}px`);
      element.style.setProperty('--panel-saturate', String(chrome.saturate ?? 1.5));
      return chrome;
    });
  },
};
