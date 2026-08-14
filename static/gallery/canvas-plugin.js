/* The Canvas editor, mounted as a Base44 plugin.

   Same contract as the lyric reader: the shell owns the state and the surface
   is a view. Here the state is the note itself — the editor holds only the
   text being typed between saves, and the shell decides where it lives.

   Storage is the shell's localStorage rather than a Canvas backend. The editor
   is a scratchpad that sits beside playback, so it should not require a second
   server to be running, and a note written here should survive the surface
   being unloaded, rebuilt or replaced.

   The surface has no per-frame needs, so the plugin declares no uniforms and
   the frame channel stays idle. */
(function(){
  const frameEl = document.getElementById('canvasEditorFrame');
  const panel   = document.getElementById('canvasEditor');
  const toggle  = document.getElementById('canvasToggle');
  if(!frameEl || !panel || !toggle) return;

  const DOC_KEY  = 'phaseField.canvasNote';
  const OPEN_KEY = 'phaseField.canvasOpen';

  function loadDoc(){
    try{
      const stored = JSON.parse(localStorage.getItem(DOC_KEY) || 'null');
      if(stored && typeof stored === 'object') return stored;
    }catch(e){ /* fall through to a fresh note */ }
    return { id:'note-1', title:'Untitled note', body:'', tags:[] };
  }

  let doc = loadDoc();
  let open = false;
  try{ open = localStorage.getItem(OPEN_KEY) === 'true'; }catch(e){ /* default closed */ }

  function persist(){
    try{ localStorage.setItem(DOC_KEY, JSON.stringify(doc)); }
    catch(e){ /* storage unavailable — the note stays in memory */ }
  }

  function applyOpen(){
    panel.hidden = !open;
    panel.classList.toggle('open', open);
    toggle.classList.toggle('on', open);
    toggle.setAttribute('aria-pressed', open ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('canvas-open', open);
    try{ localStorage.setItem(OPEN_KEY, String(open)); }catch(e){ /* ignore */ }
  }

  const plugin = Base44AppPlugin.create({
    id:'base44-canvas',
    surface:'editor',
    frame:frameEl,
    frameFloats:0,          /* a text editor needs no per-frame channel */
    uniformKeys:[],
    scene(){ return { doc }; },
    /* Nothing to push per frame; returning null idles that channel. */
    frame_(){ return null; },
    paused(){ return !open; },
    intents:{
      save(payload){
        if(!payload || typeof payload !== 'object') return;
        doc = {
          id:String(payload.id || doc.id),
          title:String(payload.title ?? doc.title),
          body:String(payload.body ?? doc.body),
          tags:Array.isArray(payload.tags) ? payload.tags : doc.tags,
        };
        persist();
        /* Deliberately no invalidate(): echoing the note back while it is being
           typed would re-seed the editor and fight the caret. */
      },
    },
  });

  function setOpen(next){
    open = !!next;
    applyOpen();
    if(open) plugin.invalidate();      // re-push the note when reopened
  }

  toggle.addEventListener('click', ()=>setOpen(!open));
  document.addEventListener('keydown', event=>{
    /* Escape closes the panel, but not while the editor has focus — there it
       belongs to the editor's own dismissables. */
    if(event.key === 'Escape' && open && document.activeElement !== frameEl) setOpen(false);
  });

  applyOpen();
})();
