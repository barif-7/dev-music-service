/* The Canvas editor, mounted as a Base44 plugin.

   Same contract as the lyric reader: the shell owns the state and the surface
   is a view. Here the state is the notes themselves — the editor holds only the
   text being typed between saves, and the shell decides where it lives.

   Storage is the shell's localStorage rather than a Canvas backend. The editor
   is a scratchpad that sits beside playback, so it should not require a second
   server to be running, and notes written here should survive the surface being
   unloaded, rebuilt or replaced.

   The surface has no per-frame needs, so the plugin declares no uniforms and
   the frame channel stays idle.

   The editor's /component slash command is answered here too. The surface asks
   with a search intent and the shell fetches, because reaching outside the note
   is the host's job: the guest is a view, and the Component Vault is a service
   this origin knows how to talk to and the guest does not. Results ride back on
   the scene like everything else, so a reloaded surface is handed the same
   state it had. */
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

  /* The in-flight (or last) service search. Deliberately not persisted: it is a
     transient lookup, not part of the note. `seq` rises on every state change so
     the surface can re-render an identical query, and stale replies from a
     superseded fetch can be dropped. */
  let search = null;
  let searchSeq = 0;

  /* Only the Component Vault is wired up. /history and /music are listed by the
     editor but have no service behind them here, so they are answered rather
     than left to hang — an unanswered intent looks identical to a slow one. */
  const SERVICE_ENDPOINTS = {
    component:(query)=>`/api/components/search?q=${encodeURIComponent(query)}&limit=8`,
  };

  function setSearch(next){
    /* Bumped even when clearing, so a reply from a search the user has already
       dismissed is recognised as stale and does not reopen the picker. */
    searchSeq++;
    search = next ? { ...next, seq:searchSeq } : null;
    plugin.invalidate();
  }

  function persist(){
    try{
      localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
      localStorage.setItem(ACTIVE_KEY, activeId);
    }catch(e){ /* storage unavailable — notes stay in memory */ }
  }

  /* Placement, sizing, stacking and the toggle's pressed state belong to the
     dock; this file only cares whether the panel is open. */
  const dock = PluginDock.register({
    id:'notes',
    el:panel,
    toggle,
    /* Writing wants the whole page, not a card in the corner. The surface paints
       no backdrop of its own, so the visuals run under the note. */
    overlay:true,
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
    scene(){ return { docs, activeId, search }; },
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
        persist();
        /* Deliberately no invalidate(): echoing the note back while it is being
           typed would re-seed the editor and fight the caret. The list rerenders
           on the next scene push, which any other intent triggers. */
      },
      select(payload){
        if(!payload?.id || payload.id === activeId) return;
        if(!docs.some(d => d.id === payload.id)) return;
        activeId = payload.id;
        persist(); plugin.invalidate();
      },
      create(){
        const doc = newDoc(docs.length);
        docs = [doc, ...docs];
        activeId = doc.id;
        persist(); plugin.invalidate();
      },
      remove(payload){
        if(!payload?.id || docs.length <= 1) return;   // always keep one note
        docs = docs.filter(d => d.id !== payload.id);
        if(activeId === payload.id) activeId = docs[0].id;
        persist(); plugin.invalidate();
      },
      /* Look a query up in a service the shell can reach and the surface cannot.
         The reply lands on the scene; the surface decides what to do with it. */
      search(payload){
        const service = String(payload?.service || '');
        const query = String(payload?.query || '').trim();
        const endpoint = SERVICE_ENDPOINTS[service];
        if(!endpoint){
          setSearch({ service, query, status:'unsupported', results:[] });
          return;
        }
        if(!query){ setSearch(null); return; }
        setSearch({ service, query, status:'loading', results:[] });
        const token = searchSeq;
        fetch(endpoint(query), { headers:{ Accept:'application/json' } })
          .then(response => response.json().then(
            body => ({ ok:response.ok, body }),
            /* A 503 from an unreachable vault has a JSON body; a proxy error
               page does not, and must not read as an empty result set. */
            () => ({ ok:false, body:{} }),
          ))
          .then(({ ok, body })=>{
            if(token !== searchSeq) return;             // superseded
            if(!ok){
              setSearch({ service, query, status:'error', results:[],
                          error:body.detail || 'Search failed' });
              return;
            }
            setSearch({
              service, query, status:'ready',
              results:Array.isArray(body.results) ? body.results : [],
              total:body.total_matches ?? 0,
            });
          })
          .catch(()=>{
            if(token !== searchSeq) return;
            setSearch({ service, query, status:'error', results:[],
                        error:'Search service unreachable' });
          });
      },
      /* The picker closed, or a result was taken. Either way the lookup is over
         and must not be re-pushed the next time the surface reconnects. */
      searchDismiss(){ if(search) setSearch(null); },
      /* The surface asks for the current notes after a reload or a rebuild. */
      sync(){ plugin.invalidate(); },
    },
  });

  /* Escape and the toggle's pressed state are handled by the dock. */
  toggle.addEventListener('click', ()=>dock.toggle());
  if(wasOpen) dock.open();
})();
