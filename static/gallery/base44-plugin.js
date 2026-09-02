/* Base44AppPlugin — host runtime for embedded Base44 React/Vite surfaces.

   A Base44 export is a whole SPA. Embedding one directly makes it a second
   source of truth: it derives its own state, keeps its own storage and reaches
   back into the shell's DOM. This runtime normalizes any such export into a
   plugin with one shape:

     shell   → surface   scene   resolved state, pushed when a revision bumps
     shell   → surface   frame   packed Float32Array, pushed once per rAF
     either  → either    event   a named real-time notification
     surface → shell     intent  a named request; the shell decides what happens
     shell   → surface   result  optional success/failure for a requested intent

   All plugins share one message listener and one animation-frame pump. Scene
   invalidations are also flushed in a microtask, so discrete state changes do
   not wait for the next frame while rapid changes still collapse into one push.
   Protocol 1 surfaces remain compatible: event/result are additive messages. */
const Base44AppPlugin = {
  PROTOCOL: 1,
  NS: 'base44',
  _plugins: new Map(),
  _listener: null,
  _rafId: 0,
  _origin: window.location.origin,

  create(manifest){
    if(!manifest?.id) throw new TypeError('Base44 plugin requires an id');
    if(!manifest?.frame) throw new TypeError(`Base44 plugin ${manifest.id} requires an iframe`);
    this._plugins.get(manifest.id)?.destroy();

    const plugin = Object.create(this._proto);
    plugin.manifest = manifest;
    plugin.id = manifest.id;
    plugin.frameEl = manifest.frame;
    plugin.ready = false;
    plugin.revision = 0;
    plugin._sentRevision = -1;
    plugin._sceneQueued = false;
    plugin._destroyed = false;
    plugin._floats = new Float32Array(manifest.frameFloats || 0);
    plugin._origin = this._origin;

    this._plugins.set(plugin.id, plugin);
    this._start();
    plugin._start();
    return plugin;
  },

  /* A single listener routes a message by its source window. A single rAF then
     gives every connected plugin a turn, avoiding one listener and pump per
     iframe as more surfaces join the shell. */
  _start(){
    if(this._listener) return;
    this._listener = event=>{
      if(event.origin !== this._origin) return;
      for(const plugin of this._plugins.values()){
        if(event.source !== plugin.frameEl?.contentWindow) continue;
        plugin._onMessage(event);
        return;
      }
    };
    window.addEventListener('message', this._listener);
    const tick = ()=>{
      this._rafId = requestAnimationFrame(tick);
      for(const plugin of this._plugins.values()) plugin._tick();
    };
    this._rafId = requestAnimationFrame(tick);
  },

  _remove(plugin){
    if(this._plugins.get(plugin.id) === plugin) this._plugins.delete(plugin.id);
    if(this._plugins.size || !this._listener) return;
    cancelAnimationFrame(this._rafId);
    window.removeEventListener('message', this._listener);
    this._listener = null;
    this._rafId = 0;
  },

  get(id){ return this._plugins.get(id) || null; },

  _emitConnection(plugin, connected){
    window.dispatchEvent(new CustomEvent('phase:plugin', {
      detail:{ id:plugin.id, surface:plugin.manifest.surface || 'default', connected },
    }));
  },

  /* Send a named event to every ready surface. This is useful for shell-wide
     events such as theme, connectivity or transport changes. */
  broadcast(name, payload){
    for(const plugin of this._plugins.values()) plugin.publish(name, payload);
  },

  _proto: {
    _post(message){
      const target = this.frameEl?.contentWindow;
      if(!target) return false;
      message.p = Base44AppPlugin.NS;
      message.v = Base44AppPlugin.PROTOCOL;
      try{
        target.postMessage(message, this._origin);
        return true;
      }catch(error){
        console.warn(`Base44 plugin ${this.id}: postMessage`, error);
        return false;
      }
    },

    _canPush(){
      if(this._destroyed || !this.ready || document.hidden) return false;
      return !this.manifest.paused?.();
    },

    /* Mark the scene stale and flush it immediately after the current JS turn.
       The rAF pump remains a fallback when a plugin was hidden or paused. */
    invalidate(){
      this.revision++;
      if(this._sceneQueued) return;
      this._sceneQueued = true;
      Promise.resolve().then(()=>{
        this._sceneQueued = false;
        if(this._canPush()) this._pushScene();
      });
    },

    _pushScene(){
      if(this._sentRevision === this.revision) return;
      const scene = this.manifest.scene?.();
      if(!scene) return;
      this._sentRevision = this.revision;
      this._post({ ...scene, t:'scene', rev:this.revision });
    },

    /* frame_ packs the uniform array and returns the frame's scalar fields
       (or null to skip the tick entirely). */
    _pushFrame(){
      const message = this.manifest.frame_?.(this._floats);
      if(!message) return;
      this._post({ ...message, t:'frame', u:this._floats });
    },

    /* Named host → surface event. Additive to protocol 1, so an older surface
       safely ignores it while continuing to receive scenes and frames. */
    publish(name, payload){
      if(!this.ready || !name) return false;
      return this._post({ t:'event', name, payload, rev:this.revision });
    },

    _tick(){
      if(!this._canPush()) return;
      this._pushScene();
      this._pushFrame();
    },

    _reply(id, ok, value){
      if(id == null) return;
      const message = { t:'result', id, ok:Boolean(ok) };
      if(ok) message.value = value;
      else message.error = String(value?.message || value || 'Intent failed');
      this._post(message);
    },

    _handleIntent(data){
      const handler = this.manifest.intents?.[data.name];
      if(!handler){
        console.warn(`Base44 plugin ${this.id}: unhandled intent`, data.name);
        this._reply(data.id, false, `Unhandled intent: ${data.name}`);
        return;
      }
      try{
        const value = handler(data.payload, { plugin:this, name:data.name });
        if(value && typeof value.then === 'function'){
          value.then(result=>this._reply(data.id, true, result))
            .catch(error=>{
              console.warn(`Base44 intent ${data.name}`, error);
              this._reply(data.id, false, error);
            });
          return;
        }
        this._reply(data.id, true, value);
      }catch(error){
        console.warn(`Base44 intent ${data.name}`, error);
        this._reply(data.id, false, error);
      }
    },

    _handleEvent(data){
      const handler = this.manifest.events?.[data.name];
      if(handler){
        try{ handler(data.payload, { plugin:this, name:data.name }); }
        catch(error){ console.warn(`Base44 event ${data.name}`, error); }
        return;
      }
      this.manifest.onEvent?.(data.name, data.payload, this);
    },

    _onMessage(event){
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
      if(data.v !== Base44AppPlugin.PROTOCOL) return;
      if(data.t === 'intent') this._handleIntent(data);
      else if(data.t === 'event') this._handleEvent(data);
    },

    _handshake(){
      this.ready = true;
      this._sentRevision = -1;                    // force a full scene push
      this._post({
        t:'init',
        plugin:this.id,
        surface:this.manifest.surface || 'default',
        uniformKeys:this.manifest.uniformKeys || [],
        capabilities:['scene', 'frame', 'event', 'intent-result'],
      });
      Base44AppPlugin._emitConnection(this, true);
      this.manifest.onReady?.();
      this._pushScene();
      this._pushFrame();
    },

    _start(){
      /* A reloaded surface must re-announce itself. The surface also announces
         on mount, and the two orderings race, so probe as well as wait — the
         handshake is idempotent and whichever arrives first wins. */
      this._loadHandler = ()=>{
        if(this.ready) Base44AppPlugin._emitConnection(this, false);
        this.ready = false;
        this._post({ t:'probe' });
      };
      this._errorHandler = ()=>{
        if(this.ready) Base44AppPlugin._emitConnection(this, false);
        this.ready = false;
        this.manifest.onLost?.();
      };
      this.frameEl.addEventListener('load', this._loadHandler);
      this.frameEl.addEventListener('error', this._errorHandler);
    },

    destroy(){
      if(this._destroyed) return;
      this._destroyed = true;
      this.frameEl?.removeEventListener('load', this._loadHandler);
      this.frameEl?.removeEventListener('error', this._errorHandler);
      if(this.ready) Base44AppPlugin._emitConnection(this, false);
      this.ready = false;
      Base44AppPlugin._remove(this);
    },
  },
};
