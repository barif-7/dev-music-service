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
  root.hidden = false;

  const clockEl = $('#pomodoroClock'), phaseEl = $('#pomodoroPhase'), statusEl = $('#pomodoroStatus'),
    listEl = $('#pomodoroPlaylist'), startBtn = $('#pomodoroStart'), pauseBtn = $('#pomodoroPause'),
    resetBtn = $('#pomodoroReset');
  const presetButtons = [...root.querySelectorAll('.pom-preset')];

  let minutes = DEFAULT_MINUTES;
  let remaining = minutes * 60000;
  let endsAt = 0;
  let running = false;
  let building = false;
  let ticker = null;
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
    if(!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.hidden = !message;
    statusEl.classList.toggle('error', Boolean(message) && error);
  }

  function paintClock(){
    if(!clockEl) return;
    clockEl.textContent = format(remaining);
    clockEl.setAttribute('aria-label', spokenTime(remaining));
  }

  function paintControls(){
    startBtn.hidden = running;
    startBtn.disabled = building;
    startBtn.textContent = building ? 'Building playlist…'
      : remaining > 0 && remaining < minutes * 60000 ? 'Resume session' : `Start ${minutes} minute session`;
    pauseBtn.hidden = !running;
    resetBtn.hidden = !running && remaining === minutes * 60000;
    resetBtn.disabled = building;
    for(const preset of presetButtons){
      const value = Number(preset.dataset.minutes);
      preset.setAttribute('aria-pressed', value === minutes ? 'true' : 'false');
      preset.disabled = building;
    }
    phaseEl.textContent = building ? 'Curating' : running ? 'Focusing'
      : remaining === 0 ? 'Complete' : remaining < minutes * 60000 ? 'Paused' : 'Ready';
    panel.classList.toggle('pom-running', running);
  }

  function paint(){ paintClock(); paintControls(); }

  function tick(){
    remaining = clamp(endsAt - Date.now());
    paintClock();
    if(remaining > 0) return;
    stopTicker();
    running = false;
    playback()?.pause();
    setStatus(`${minutes} minute session complete. Nicely done.`);
    paintControls();
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
    listEl.replaceChildren();
    setStatus('');
    paint();
  }

  function renderSession(session){
    listEl.replaceChildren();
    for(const track of session.tracks){
      const row = document.createElement('li');
      row.className = 'pom-track';
      const copy = document.createElement('span');
      copy.className = 'pom-track-copy';
      const title = document.createElement('strong');
      title.textContent = track.title || 'Untitled track';
      const artist = document.createElement('span');
      artist.textContent = track.artist || '—';
      copy.append(title, artist);
      const length = document.createElement('span');
      length.className = 'pom-track-length';
      length.textContent = Number.isFinite(Number(track.duration)) ? format(Number(track.duration) * 1000) : '—';
      row.append(copy, length);
      listEl.append(row);
    }
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
      paintControls();
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
        paintControls();
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
    paintControls();
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
      paintControls();
    }
  }

  function pause(){
    if(!running) return;
    remaining = clamp(endsAt - Date.now());
    stopTicker();
    running = false;
    playback()?.pause();
    setStatus('Session paused.');
    paint();
  }

  function reset(){
    if(building) return;
    stopTicker();
    running = false;
    building = false;
    remaining = minutes * 60000;
    listEl.replaceChildren();
    setStatus('');
    playback()?.pause();
    paint();
  }

  for(const preset of presetButtons){
    preset.addEventListener('click', ()=>selectPreset(Number(preset.dataset.minutes)));
  }
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);

  /* Placement, sizing, stacking, Escape and the toggle's pressed state come
     from the dock, exactly as they did for the clock. */
  const dock = PluginDock.register({ id:'clock', el:panel, toggle:btn });
  btn.addEventListener('click', ()=> dock.toggle());
  $('#clockModalCloseBtn')?.addEventListener('click', ()=> dock.close());

  selectPreset(DEFAULT_MINUTES);
})();
