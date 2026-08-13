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
    return;
  }

  const src = frame.getAttribute('src');
  frame.removeAttribute('src');

  function setOpen(v){
    if(v && !frame.getAttribute('src')) frame.setAttribute('src', src);
    panel.classList.toggle('show', v);
    btn.setAttribute('aria-expanded', String(v));
  }

  btn.addEventListener('click', ()=> setOpen(!panel.classList.contains('show')));
  $('#clockModalCloseBtn').addEventListener('click', ()=> setOpen(false));
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && panel.classList.contains('show')) setOpen(false);
  });
})();
