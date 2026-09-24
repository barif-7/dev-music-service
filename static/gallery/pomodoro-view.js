/* The timer's view only applies the controller's config and forwards actions.
   Session state, playback, timing and dock geometry belong to their owners. */
(function(){
  'use strict';

  function create({ root }){
    const $ = selector => root.querySelector(selector);
    const clock = $('#pomodoroClock'), phase = $('#pomodoroPhase'), status = $('#pomodoroStatus'),
      list = $('#pomodoroPlaylist'), start = $('#pomodoroStart'), pause = $('#pomodoroPause'),
      reset = $('#pomodoroReset');
    const presets = [...root.querySelectorAll('.pom-preset')];
    let config;
    let tracks;

    start.addEventListener('click', ()=>config.actions.start());
    pause.addEventListener('click', ()=>config.actions.pause());
    reset.addEventListener('click', ()=>config.actions.reset());
    for(const preset of presets){
      preset.addEventListener('click', ()=>config.actions.selectPreset(Number(preset.dataset.minutes)));
    }

    return function render(next){
      const previous = config;
      config = next;
      root.hidden = config.hidden;
      clock.textContent = config.clock.text;
      clock.setAttribute('aria-label', config.clock.label);
      phase.textContent = config.phase;
      if(config.status !== previous?.status){
        status.textContent = config.status.text;
        status.hidden = config.status.hidden;
        status.classList.toggle('error', config.status.error);
      }
      start.hidden = config.start.hidden;
      start.disabled = config.start.disabled;
      start.textContent = config.start.text;
      pause.hidden = config.pause.hidden;
      reset.hidden = config.reset.hidden;
      reset.disabled = config.reset.disabled;
      for(const preset of presets){
        const state = config.presets.find(item => item.minutes === Number(preset.dataset.minutes));
        preset.setAttribute('aria-pressed', String(state.pressed));
        preset.disabled = state.disabled;
      }
      root.classList.toggle('pom-running', config.running);

      // The controller keeps this array stable while only the clock changes.
      if(tracks === config.tracks) return;
      tracks = config.tracks;
      list.replaceChildren();
      for(const track of tracks){
        const row = document.createElement('li');
        row.className = 'pom-track';
        const copy = document.createElement('span');
        copy.className = 'pom-track-copy';
        const title = document.createElement('strong');
        title.textContent = track.title;
        const artist = document.createElement('span');
        artist.textContent = track.artist;
        copy.append(title, artist);
        const length = document.createElement('span');
        length.className = 'pom-track-length';
        length.textContent = track.length;
        row.append(copy, length);
        list.append(row);
      }
    };
  }

  window.PhasePomodoroView = { create };
})();
