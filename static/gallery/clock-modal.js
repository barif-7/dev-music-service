/* Phase · Field — solar clock: #clockOpenBtn toggles the compact floating
   clock panel (#clockModal). The panel is a .chrome element like the video
   hero — no scrim, and it fades with the rest of the interface when the
   stage goes idle. The iframe src is deferred until first open so the bundle
   (and its geolocation prompt) never loads for sessions that don't use it. */
(function(){
  /* The panel is the Pomodoro focus timer by default — pomodoro.js owns it,
     and this file stands down. The solar clock is still one query parameter
     away: add ?clock=1 or set localStorage['pf.clock.enabled']='1'. */
  let override = false;
  try{
    override = new URLSearchParams(location.search).has('clock') ||
      localStorage.getItem('pf.clock.enabled') === '1';
  }catch(_error){ /* a blocked localStorage just means the default panel */ }
  if(!override) return;

  const $ = (s,r=document)=> r.querySelector(s);
  const btn = $('#clockOpenBtn'), panel = $('#clockModal'), frame = $('#clockFrame');
  if(!btn || !panel || !frame) return;
  btn.setAttribute('aria-label', 'Toggle solar clock');
  btn.dataset.label = 'Solar clock';
  panel.setAttribute('aria-label', 'Solar clock');
  $('#clockModalCloseBtn')?.setAttribute('aria-label', 'Close solar clock');
  /* The timer markup ships in the same panel; only one of them is ever live. */
  $('#pomodoro')?.remove();

  /* The markup carries the URL in data-src so neither the clock bundle nor its
     geolocation prompt loads for the sessions that never open the panel. */
  const src = frame.dataset.src;

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
