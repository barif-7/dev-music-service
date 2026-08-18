/* Phase · Field — solar clock: #clockOpenBtn toggles the compact floating
   clock panel (#clockModal). The panel is a .chrome element like the video
   hero — no scrim, and it fades with the rest of the interface when the
   stage goes idle. The iframe src is deferred until first open so the bundle
   (and its geolocation prompt) never loads for sessions that don't use it. */
(function(){
  /* Feature flag — clock is parked until the pomodoro/focus-session idea is
     fleshed out. Flip to true, add ?clock=1, or set
     localStorage['pf.clock.enabled']='1' to bring it back. */
  const CLOCK_ENABLED = false;

  const $ = (s,r=document)=> r.querySelector(s);
  const btn = $('#clockOpenBtn'), panel = $('#clockModal'), frame = $('#clockFrame');
  if(!btn || !panel || !frame) return;

  const override = new URLSearchParams(location.search).has('clock') ||
    localStorage.getItem('pf.clock.enabled') === '1';
  if(!CLOCK_ENABLED && !override){
    btn.style.display = 'none';
    /* Take the panel out of the layout entirely. It carries dock-panel in the
       markup so it is placed correctly without this script, but a disabled
       feature should not leave an invisible box sitting in the row. */
    panel.hidden = true;
    return;
  }

  const src = frame.getAttribute('src');
  frame.removeAttribute('src');

  /* Placement, sizing, stacking, Escape and the toggle's pressed state come
     from the dock, so this file keeps only the deferred-src behaviour. */
  const dock = PluginDock.register({
    id:'clock',
    el:panel,
    toggle:btn,
    onOpen(){
      if(!frame.getAttribute('src')) frame.setAttribute('src', src);
    },
  });

  btn.addEventListener('click', ()=> dock.toggle());
  $('#clockModalCloseBtn').addEventListener('click', ()=> dock.close());
})();
