/* Phase · Field — focus timer: the dock panel that used to host the solar
   clock now runs Pomodoro sessions. Picking a preset asks
   /api/recommendations/focus-session for a focus-profile playlist long enough
   to cover it, then launches that playlist and counts the session down.

   The solar clock is still reachable behind ?clock=1 (or
   localStorage['pf.clock.enabled']); clock-modal.js owns the panel in that
   case and this file stands down so the two never fight over it. */
(function(){
  'use strict';
  const PRESETS = [5, 10, 15, 20, 25];
  const DEFAULT_MINUTES = 25;
  const $ = (s, r=document)=> r.querySelector(s);

  let override = false;
  try{
    override = new URLSearchParams(location.search).has('clock') ||
      localStorage.getItem('pf.clock.enabled') === '1';
  }catch(_error){ /* a blocked localStorage just means the default panel */ }
  if(override) return;

  const btn = $('#clockOpenBtn'), panel = $('#clockModal'), root = $('#pomodoro');
  if(!btn || !panel || !root) return;
  /* The clock bundle (and its geolocation prompt) has no business loading for
     a timer, and the iframe would otherwise sit behind the panel. */
  $('#clockFrame')?.remove();
  const renderView = window.PhasePomodoroView.create({ root });

  let minutes = DEFAULT_MINUTES;
  let remaining = minutes * 60000;
  let endsAt = 0;
  let running = false;
  let building = false;
  let ticker = null;
  let tracks = [];
  let status = { text:'', hidden:true, error:false };
  const playback = ()=>window.recommendationClient?.player;

  const clamp = ms => Math.max(0, Math.round(ms));
  function format(ms){
    const total = Math.ceil(clamp(ms) / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function spokenTime(ms){
    const total = Math.ceil(clamp(ms) / 1000);
    const mins = Math.floor(total / 60), secs = total % 60;
    return `${mins} minute${mins === 1 ? '' : 's'} ${secs} second${secs === 1 ? '' : 's'} remaining`;
  }

  function setStatus(message, error=false){
    status = { text:message || '', hidden:!message, error:Boolean(message) && error };
    paint();
  }

  function projectConfig(){
    return {
      hidden:false,
      clock:{ text:format(remaining), label:spokenTime(remaining) },
      phase:building ? 'Curating' : running ? 'Focusing'
        : remaining === 0 ? 'Complete' : remaining < minutes * 60000 ? 'Paused' : 'Ready',
      status,
      start:{
        hidden:running,
        disabled:building,
        text:building ? 'Building playlist…'
          : remaining > 0 && remaining < minutes * 60000 ? 'Resume session' : `Start ${minutes} minute session`
      },
      pause:{ hidden:!running },
      reset:{ hidden:!running && remaining === minutes * 60000, disabled:building },
      presets:PRESETS.map(value => ({ minutes:value, pressed:value === minutes, disabled:building })),
      running,
      tracks,
      actions
    };
  }

  function paint(){ dock.updateConfig(projectConfig()); }

  function tick(){
    remaining = clamp(endsAt - Date.now());
    if(remaining > 0){ paint(); return; }
    stopTicker();
    running = false;
    playback()?.pause();
    setStatus(`${minutes} minute session complete. Nicely done.`);
  }

  function stopTicker(){ clearInterval(ticker); ticker = null; }

  function startTicker(){
    endsAt = Date.now() + remaining;
    stopTicker();
    ticker = setInterval(tick, 250);
    running = true;
    paint();
  }

  function selectPreset(value){
    if(!PRESETS.includes(value) || building) return;
    if(running) playback()?.pause();
    minutes = value;
    stopTicker();
    running = false;
    remaining = minutes * 60000;
    tracks = [];
    setStatus('');
  }

  function renderSession(session){
    tracks = session.tracks.map(track => ({
      title:track.title || 'Untitled track',
      artist:track.artist || '—',
      length:Number.isFinite(Number(track.duration)) ? format(Number(track.duration) * 1000) : '—'
    }));
    paint();
  }

  function sessionSummary(session){
    const songs = session.tracks.length;
    const covered = format(Number(session.total_seconds || 0) * 1000);
    return `${songs} song${songs === 1 ? '' : 's'} · ${covered} of music for a ${minutes} minute session.`;
  }

  async function start(){
    if(running || building) return;
    /* A paused session resumes on the playlist it was launched with. */
    if(remaining < minutes * 60000 && remaining > 0){
      building = true;
      paint();
      try{
        const player = playback();
        if(!player?.hasSource) throw new Error('This session no longer has a playable song. Reset to build a new playlist.');
        await player.play();
        setStatus('Focus session resumed.');
        startTicker();
      }catch(error){
        setStatus(error?.message || 'Playback could not resume. Try again.', true);
      }finally{
        building = false;
        paint();
      }
      return;
    }
    const client = window.recommendationClient;
    if(!client){
      setStatus('The recommendations service is unavailable, so a playlist cannot be built.', true);
      return;
    }
    building = true;
    setStatus('Building a focus playlist for this session…');
    try{
      const session = await client.createFocusSession(minutes);
      renderSession(session);
      const warnings = Array.isArray(session.warnings) ? session.warnings.filter(Boolean) : [];
      if(!session.tracks.length){
        setStatus([session.message || 'No songs are available for this session yet.', ...warnings].join(' '), true);
        return;
      }
      await client.launchSession(session, minutes);
      remaining = minutes * 60000;
      setStatus([sessionSummary(session), session.message, ...warnings].filter(Boolean).join(' '), !session.covered);
      startTicker();
    }catch(error){
      setStatus(error?.message || 'This session could not be started. Try again.', true);
    }finally{
      building = false;
      paint();
    }
  }

  function pause(){
    if(!running) return;
    remaining = clamp(endsAt - Date.now());
    stopTicker();
    running = false;
    playback()?.pause();
    setStatus('Session paused.');
  }

  function reset(){
    if(building) return;
    stopTicker();
    running = false;
    building = false;
    remaining = minutes * 60000;
    tracks = [];
    setStatus('');
    playback()?.pause();
  }

  const actions = { start, pause, reset, selectPreset };

  /* Placement, sizing, stacking, Escape and the toggle's pressed state come
     from the dock, exactly as they did for the clock. */
  const dock = PluginDock.register({ id:'clock', el:panel, toggle:btn, config:projectConfig(), render:renderView });
  btn.addEventListener('click', ()=> dock.toggle());
  $('#clockModalCloseBtn')?.addEventListener('click', ()=> dock.close());

  selectPreset(DEFAULT_MINUTES);
})();
