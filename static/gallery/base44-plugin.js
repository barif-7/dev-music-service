/* Base44AppPlugin — host runtime for embedded Base44 React/Vite surfaces.

   A Base44 export is a whole SPA. Embedding one directly makes it a second
   source of truth: it derives its own state, keeps its own storage and reaches
   back into the shell's DOM. This runtime normalizes any such export into a
   plugin with one shape:

     shell  → surface   scene   resolved state, pushed when a revision bumps
     shell  → surface   frame   packed Float32Array, pushed once per rAF
     surface → shell    intent  a named request; the shell decides what happens

   The surface derives nothing, stores nothing and never touches the shell. Any
   Base44 app that speaks this protocol is embeddable without bespoke wiring. */
const Base44AppPlugin = {
  PROTOCOL: 1,
  NS: 'base44',

  create(manifest){
    const plugin = Object.create(this._proto);
    plugin.manifest = manifest;
    plugin.id = manifest.id;
    plugin.frameEl = manifest.frame;
    plugin.ready = false;
    plugin.revision = 0;
    plugin._sentRevision = -1;
    plugin._rafId = 0;
    plugin._floats = new Float32Array(manifest.frameFloats || 0);
    plugin._origin = window.location.origin;
    plugin._start();
    return plugin;
  },

  _proto: {
    _post(message){
      const target = this.frameEl?.contentWindow;
      if(!target) return;
      message.p = Base44AppPlugin.NS;
      message.v = Base44AppPlugin.PROTOCOL;
      target.postMessage(message, this._origin);
    },

    /* Mark the scene stale. Coalesced into the next frame, so callers can fire
       this freely instead of diffing serialized snapshots. */
    invalidate(){ this.revision++; },

    _pushScene(){
      if(this._sentRevision === this.revision) return;
      this._sentRevision = this.revision;
      const scene = this.manifest.scene?.();
      if(!scene) return;
      scene.t = 'scene';
      scene.rev = this.revision;
      this._post(scene);
    },

    /* frame_ packs the uniform array and returns the frame's scalar fields
       (or null to skip the tick entirely). */
    _pushFrame(){
      const message = this.manifest.frame_?.(this._floats);
      if(!message) return;
      message.t = 'frame';
      message.u = this._floats;
      this._post(message);
    },

    /* One rAF loop drives both channels: the scene only when stale, the frame
       every tick. Paused while the tab is hidden or the surface is detached. */
    _tick(){
      this._rafId = requestAnimationFrame(()=>this._tick());
      if(!this.ready || document.hidden) return;
      if(this.manifest.paused?.()) return;
      this._pushScene();
      this._pushFrame();
    },

    _onMessage(event){
      if(event.origin !== this._origin) return;
      if(event.source !== this.frameEl?.contentWindow) return;
      const data = event.data;
      if(!data || data.p !== Base44AppPlugin.NS) return;
      if(data.t === 'ready'){
        if(data.v !== Base44AppPlugin.PROTOCOL){
          console.warn(`Base44 plugin ${this.id}: protocol ${data.v} != ${Base44AppPlugin.PROTOCOL}`);
          return;
        }
        this._handshake();
        return;
      }
      if(data.t === 'intent'){
        const handler = this.manifest.intents?.[data.name];
        if(!handler){ console.warn(`Base44 plugin ${this.id}: unhandled intent`, data.name); return; }
        try{ handler(data.payload); }catch(error){ console.warn(`Base44 intent ${data.name}`, error); }
      }
    },

    _handshake(){
      this.ready = true;
      this._sentRevision = -1;                    // force a full scene push
      this._post({
        t:'init',
        surface:this.manifest.surface || 'default',
        uniformKeys:this.manifest.uniformKeys || [],
      });
      this.manifest.onReady?.();
      this._pushScene();
      this._pushFrame();
    },

    _start(){
      this._listener = event=>this._onMessage(event);
      window.addEventListener('message', this._listener);
      /* A reloaded surface must re-announce itself. The surface also announces
         on mount, and the two orderings race, so probe as well as wait — the
         handshake is idempotent and whichever arrives first wins. */
      this._loadHandler = ()=>{ this.ready = false; this._post({ t:'probe' }); };
      this._errorHandler = ()=>{ this.ready = false; this.manifest.onLost?.(); };
      this.frameEl?.addEventListener('load', this._loadHandler);
      this.frameEl?.addEventListener('error', this._errorHandler);
      this._tick();
    },

    destroy(){
      cancelAnimationFrame(this._rafId);
      window.removeEventListener('message', this._listener);
      this.frameEl?.removeEventListener('load', this._loadHandler);
      this.frameEl?.removeEventListener('error', this._errorHandler);
      this.ready = false;
    },
  },
};
