/* Apps — the launcher for localized Base44 plugin surfaces.

   The dock row divides its width between open panels and evicts the least
   recent once even --dock-w-min will not fit: three or four panels, depending
   on the viewport. That is the right geometry for panels you want side by side
   with the player, and the wrong one for twenty apps. So the catalogue does not
   get twenty toggles and twenty <aside>s. It gets two panels:

     apps         a row panel listing every plugin           (one slot)
     app-surface  an overlay the chosen plugin mounts into   (no slot)

   Only one app is mounted at a time and they share a single iframe, so the row
   pressure is constant no matter how long the catalogue grows, and the plugin
   runtime holds one connection rather than twenty idle ones.

   The scene is the shell's own context — wallpaper, transport, the current
   track. Nothing here reads a plugin's storage or its Base44 account: a surface
   renders what the host sends and asks for changes through intents, which is
   the whole point of the pipeline. */
(function(){
  const panel   = document.getElementById('appsPanel');
  const list    = document.getElementById('appsList');
  const toggle  = document.getElementById('appsBtn');
  const surface = document.getElementById('appSurfacePanel');
  const frame   = document.getElementById('appSurfaceFrame');
  const title   = document.getElementById('appSurfaceTitle');
  const status  = document.getElementById('appSurfaceStatus');
  const closeBtn= document.getElementById('appSurfaceCloseBtn');
  if(!panel || !list || !toggle || !surface || !frame) return;

  let catalog = [];
  let mounted = null;          // { entry, plugin }
  let activeCategory = 'all';  // Phase 4: category filter

  /* Chrome — the backdrop this app sits on — is resolved by PluginChrome from
     the same catalogue, and shared with the bespoke panels that do the same. */
  const chromeFor = (entry) => PluginChrome.resolve(entry?.id);
  const applyChrome = (entry) => PluginChrome.apply(entry?.id, surface);

  /* ---- the scene: shell state, resolved once and pushed on change ---- */

  function currentWallpaper(){
    return typeof ALTS !== 'undefined' && typeof state === 'object'
      ? ALTS[state.index] : null;
  }

  function scene(){
    const wallpaper = currentWallpaper();
    const track = typeof nowPlaying !== 'undefined' ? nowPlaying : null;
    return {
      status:'ready',
      app: mounted ? {
        id:mounted.entry.id, name:mounted.entry.name,
        surface:mounted.entry.surface, blurb:mounted.entry.blurb || '',
      } : null,
      shell:{
        reducedMotion: typeof MotionSafety !== 'undefined' ? MotionSafety.reduced() : false,
        playing: Boolean(track),
      },
      /* The app's own backdrop, resolved by the host. A surface should paint
         this rather than the wallpaper: the wallpaper is already behind it. */
      chrome: mounted ? chromeFor(mounted.entry) : null,
      wallpaper: wallpaper ? {
        id:wallpaper.id, name:wallpaper.name, palette:wallpaper.palette || [],
        gradient: typeof WallpaperPalette !== 'undefined'
          ? WallpaperPalette.gradient(wallpaper) : null,
      } : null,
      track: track ? {
        title:track.title || '', artist:track.artist || '',
        album:track.album || '', art:track.art || track.artwork || null,
        progress: typeof player === 'object' ? (player.progress || 0) : 0,
      } : null,
    };
  }

  const invalidate = ()=> mounted?.plugin.invalidate();

  /* ---- mounting ----
     The route is probed before the iframe is pointed at it. A surface whose
     bundle was never vendored answers 503 with the command that builds it, and
     showing that beats an empty panel with a broken frame inside. */

  async function probe(entry){
    try{
      const response = await fetch(entry.route, { headers:{ 'Accept':'text/html' } });
      if(response.ok) return null;
      const detail = await response.json().catch(()=>null);
      return detail?.detail || `${entry.name} is unavailable (${response.status})`;
    }catch(error){
      return `${entry.name} could not be reached.`;
    }
  }

  function unmount(){
    if(!mounted) return;
    mounted.plugin.destroy();
    mounted = null;
    frame.removeAttribute('src');
  }

  async function mount(entry, path){
    if(mounted?.entry.id === entry.id && !path){ appSurfaceDock.open(); return; }
    if(title) title.textContent = entry.name;
    applyChrome(entry);
    if(status){ status.textContent = 'Loading…'; status.hidden = false; }
    appSurfaceDock.open();
    reflectSelection(entry.id);

    const problem = await probe(entry);
    if(problem){
      unmount();
      if(status){ status.textContent = problem; status.hidden = false; }
      return;
    }

    unmount();
    /* Not every surface speaks the plugin protocol — the full Canvas app is a
       plain SPA — so `ready` may never arrive and onReady would never clear the
       status. The frame having loaded is the weaker but always-true signal. */
    frame.addEventListener('load', ()=>{ if(status) status.hidden = true; }, { once:true });
    const suffix = path ? `/${String(path).replace(/^\/+/, '')}` : '';
    /* `base` is the path the app is mounted at, which is not the same as the
       path it is being opened on. A surface with a router needs the first to
       set its basename and the second to route within it; it cannot tell them
       apart from location alone, so the host that chose both says which. */
    frame.setAttribute(
      'src',
      `${entry.route}${suffix}?surface=${encodeURIComponent(entry.surface)}`
        + `&base=${encodeURIComponent(entry.route)}`,
    );
    const plugin = Base44AppPlugin.create({
      id:`base44-${entry.id}`,
      surface:entry.surface,
      frame,
      frameFloats:0,              // no per-frame channel; these are view surfaces
      uniformKeys:[],
      scene,
      frame_(){ return null; },
      paused(){ return !appSurfaceDock.isOpen(); },
      onReady(){ if(status) status.hidden = true; },
      onLost(){ if(status){ status.textContent = `${entry.name} disconnected.`; status.hidden = false; } },
      intents:{
        ...(entry.id === 'vocabulary' ? { vocabulary: payload => VocabularyPlugin.request(payload) } : {}),
        close(){ appSurfaceDock.close(); },
        refresh(){ invalidate(); },
        /* An app may hand off to another app; the host still decides. */
        open(payload){
          const next = catalog.find(item => item.id === payload?.id);
          if(!next) throw new Error(`Unknown app: ${payload?.id}`);
          mount(next);
        },
      },
    });
    mounted = { entry, plugin };
  }

  /* ---- the list ---- */

  function reflectSelection(id){
    for(const row of list.querySelectorAll('.app-row')){
      const on = row.dataset.appId === id;
      row.classList.toggle('on', on);
      row.setAttribute('aria-current', on ? 'true' : 'false');
    }
  }

  /* Phase 4: render with category tabs and archived badges. */
  function render(){
    list.textContent = '';

    /* Category tabs — only shown when more than one category exists. */
    const categories = ['all', ...new Set(catalog.map(e => e.category || 'experimental'))];
    if(categories.length > 2){
      const tabBar = document.createElement('div');
      tabBar.className = 'app-categories';
      for(const cat of categories){
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'app-cat' + (cat === activeCategory ? ' on' : '');
        tab.textContent = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
        tab.addEventListener('click', ()=>{ activeCategory = cat; render(); });
        tabBar.appendChild(tab);
      }
      list.appendChild(tabBar);
    }

    const filtered = activeCategory === 'all'
      ? catalog
      : catalog.filter(e => (e.category || 'experimental') === activeCategory);

    for(const entry of filtered){
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'app-row';
      row.dataset.appId = entry.id;
      row.setAttribute('aria-current', 'false');
      const name = document.createElement('span');
      name.className = 'app-row-name';
      name.textContent = entry.name;
      /* Archived badge for exports with no active repo checkout. */
      if(entry.archived){
        const badge = document.createElement('span');
        badge.className = 'app-archived';
        badge.textContent = 'archived';
        badge.title = 'No active repo checkout — exported snapshot';
        name.append(' ', badge);
      }
      const blurb = document.createElement('span');
      blurb.className = 'app-row-blurb';
      blurb.textContent = entry.blurb || '';
      row.append(name, blurb);
      row.addEventListener('click', ()=> mount(entry));
      list.appendChild(row);
    }
  }

  /* ---- registration ---- */

  const appsDock = PluginDock.register({ id:'apps', el:panel, toggle, focusFirst:'.app-row' });
  const appSurfaceDock = PluginDock.register({
    id:'app-surface', el:surface, overlay:true,
    onOpen:invalidate,
    /* Closing tears the connection down rather than leaving a hidden surface
       holding a plugin slot and a paused pump. */
    onClose:unmount,
  });

  toggle.addEventListener('click', ()=> appsDock.toggle());
  closeBtn?.addEventListener('click', ()=> appSurfaceDock.close());

  /* Shell state the surfaces render from. Both are push-based at the mutation
     point, matching how the reader is fed — no polling. */
  if(typeof Wallpaper === 'object') Wallpaper.subscribe(invalidate);
  if(typeof MotionSafety === 'object') MotionSafety.subscribe(invalidate);
  window.addEventListener('phase:track', invalidate);

  /* The one way another host asks for an app to be surfaced. The launcher owns
     the shared surface slot, so a panel that wants to hand off — the Canvas
     editor opening its graph, say — calls this rather than touching the DOM. */
  window.AppsLauncher = {
    open(id, options){
      const entry = catalog.find(item => item.id === id);
      if(!entry){ console.warn('AppsLauncher: unknown app', id); return false; }
      mount(entry, options?.path);
      return true;
    },
    has(id){ return catalog.some(item => item.id === id); },
    close(){ appSurfaceDock.close(); },
  };

  /* Phase 3: in prod mode, only music-related plugins appear in the launcher.
     Non-music surfaces (Canvas, Champions, etc.) are dev-only. */
  const MUSIC_PLUGIN_IDS = new Set([
    'vocabulary',
    'tuneshere',   // Playlist/library view — music discovery
    'floatdesk',   // Reactions for playing track — music reactions
  ]);

  fetch('/static/gallery/plugins.json', { cache:'no-cache' })
    .then(response => response.json())
    .then(data => {
      const isProd = typeof PhaseState !== 'undefined' && PhaseState.isProd;
      catalog = (data.plugins || [])
        /* In prod: only music plugins with generic host.
           In dev: all generic-host plugins, including bespoke surfaces exposed
           through the launcher for experimentation. */
        .filter(entry => isProd
          ? (entry.host === 'generic' && MUSIC_PLUGIN_IDS.has(entry.id))
          : entry.host === 'generic')
        .map(entry => ({ ...entry, route:`/${entry.id}` }));
      render();
      toggle.hidden = catalog.length === 0;
    })
    .catch(()=>{
      /* No catalogue, no launcher — the rest of the shell is unaffected. */
      toggle.hidden = true;
    });
})();
