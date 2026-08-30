/* The Canvas editor, mounted as a Base44 plugin.

   Same contract as the lyric reader: the shell owns the state and the surface
   is a view. Here the state is the notes themselves — the editor holds only the
   text being typed between saves, and the shell decides where it lives.

   Storage is the shell's localStorage rather than a Canvas backend. The editor
   is a scratchpad that sits beside playback, so it should not require a second
   server to be running, and notes written here should survive the surface being
   unloaded, rebuilt or replaced.

   The surface has no per-frame needs, so the plugin declares no uniforms and
   the frame channel stays idle. */
(function(){
  const frameEl = document.getElementById('canvasEditorFrame');
  const panel   = document.getElementById('canvasEditor');
  const toggle  = document.getElementById('canvasToggle');
  if(!frameEl || !panel || !toggle) return;

  const DOCS_KEY   = 'phaseField.canvasNotes';
  const ACTIVE_KEY = 'phaseField.canvasActiveNote';
  const OPEN_KEY   = 'phaseField.canvasOpen';
  const LEGACY_KEY = 'phaseField.canvasNote';    // single-note format

  function newDoc(index){
    return {
      id:`note-${Date.now().toString(36)}-${index}`,
      title:'Untitled note',
      body:'',
      tags:[],
      updatedAt:new Date().toISOString(),
    };
  }

  function loadDocs(){
    try{
      const stored = JSON.parse(localStorage.getItem(DOCS_KEY) || 'null');
      if(Array.isArray(stored) && stored.length) return stored;
      /* Carry over a note written before the editor held more than one. */
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if(legacy && typeof legacy === 'object') return [{ ...newDoc(0), ...legacy }];
    }catch(e){ /* fall through to a fresh note */ }
    return [newDoc(0)];
  }

  let docs = loadDocs();
  let activeId = '';
  try{ activeId = localStorage.getItem(ACTIVE_KEY) || ''; }catch(e){ /* ignore */ }
  if(!docs.some(d => d.id === activeId)) activeId = docs[0].id;

  let wasOpen = false;
  try{ wasOpen = localStorage.getItem(OPEN_KEY) === 'true'; }catch(e){ /* default closed */ }

  function snapshot(reason){
    return {
      reason,
      activeId,
      docs:docs.map(doc=>({ ...doc, tags:Array.isArray(doc.tags) ? [...doc.tags] : [] })),
    };
  }

  function announce(reason){
    const detail = snapshot(reason);
    window.dispatchEvent(new CustomEvent('phase:canvas-notes', { detail }));
    plugin.publish('canvas:notes', detail);
  }

  function persist(reason='update'){
    try{
      localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
      localStorage.setItem(ACTIVE_KEY, activeId);
    }catch(e){ /* storage unavailable — notes stay in memory */ }
    announce(reason);
  }

  /* Placement, sizing, stacking and the toggle's pressed state belong to the
     dock; this file only cares whether the panel is open. */
  const dock = PluginDock.register({
    id:'notes',
    el:panel,
    toggle,
    onOpen(){
      try{ localStorage.setItem(OPEN_KEY, 'true'); }catch(e){ /* ignore */ }
      plugin.invalidate();              // re-push notes when reopened
    },
    onClose(){
      try{ localStorage.setItem(OPEN_KEY, 'false'); }catch(e){ /* ignore */ }
    },
  });

  const plugin = Base44AppPlugin.create({
    id:'base44-canvas',
    surface:'editor',
    frame:frameEl,
    frameFloats:0,          /* a text editor needs no per-frame channel */
    uniformKeys:[],
    scene(){ return { docs, activeId }; },
    /* Nothing to push per frame; returning null idles that channel. */
    frame_(){ return null; },
    paused(){ return !dock.isOpen(); },
    intents:{
      save(payload){
        if(!payload || typeof payload !== 'object') return;
        const index = docs.findIndex(d => d.id === payload.id);
        if(index < 0) return;
        docs[index] = {
          ...docs[index],
          title:String(payload.title ?? docs[index].title),
          body:String(payload.body ?? docs[index].body),
          tags:Array.isArray(payload.tags) ? payload.tags : docs[index].tags,
          updatedAt:new Date().toISOString(),
        };
        persist('save');
        /* The surface only re-seeds its draft when the active note id changes,
           so publishing this scene updates the note list without fighting the
           caret. The runtime coalesces rapid autosaves into one immediate push. */
        plugin.invalidate();
      },
      select(payload){
        if(!payload?.id || payload.id === activeId) return;
        if(!docs.some(d => d.id === payload.id)) return;
        activeId = payload.id;
        persist('select'); plugin.invalidate();
      },
      create(){
        const doc = newDoc(docs.length);
        docs = [doc, ...docs];
        activeId = doc.id;
        persist('create'); plugin.invalidate();
      },
      remove(payload){
        if(!payload?.id || docs.length <= 1) return;   // always keep one note
        docs = docs.filter(d => d.id !== payload.id);
        if(activeId === payload.id) activeId = docs[0].id;
        persist('remove'); plugin.invalidate();
      },
      /* The surface asks for the current notes after a reload or a rebuild. */
      sync(){ plugin.invalidate(); },
    },
  });

  /* Other same-origin shell features can update notes without reaching into
     the iframe. Storage events cover another tab/window; the custom event is
     the in-document real-time API for future plugins and integrations. */
  window.addEventListener('storage', event=>{
    if(event.storageArea !== localStorage) return;
    if(event.key !== DOCS_KEY && event.key !== ACTIVE_KEY && event.key !== null) return;
    docs = loadDocs();
    try{ activeId = localStorage.getItem(ACTIVE_KEY) || ''; }catch(e){ activeId = ''; }
    if(!docs.some(doc=>doc.id === activeId)) activeId = docs[0].id;
    announce('storage');
    plugin.invalidate();
  });

  window.addEventListener('phase:canvas-notes:set', event=>{
    const incoming = event.detail;
    if(!incoming || !Array.isArray(incoming.docs) || !incoming.docs.length) return;
    docs = incoming.docs
      .filter(doc=>doc && typeof doc === 'object' && doc.id)
      .map(doc=>({
        ...newDoc(0),
        ...doc,
        id:String(doc.id),
        title:String(doc.title || 'Untitled note'),
        body:String(doc.body || ''),
        tags:Array.isArray(doc.tags) ? doc.tags.map(String) : [],
      }));
    if(!docs.length) return;
    activeId = docs.some(doc=>doc.id === incoming.activeId) ? incoming.activeId : docs[0].id;
    persist('external');
    plugin.invalidate();
  });

  /* Escape and the toggle's pressed state are handled by the dock. */
  toggle.addEventListener('click', ()=>dock.toggle());
  if(wasOpen) dock.open();
})();
