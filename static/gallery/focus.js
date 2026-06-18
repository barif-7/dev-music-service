/* Phase · Field — Focus mode. Analyse your Spotify top tracks against a focus
   profile (BPM / energy / instrumentalness), ranked by focus_score, with a BPM
   insight. Playing a track streams it via loadTrack(). Ported from the player. */
(function(){
  const $ = (s,r=document)=> r.querySelector(s);
  const esc = s => (s==null?'':String(s)).replace(/[&<>]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  let timeRange = 'short_term', data = null;

  function syncEnergy(){
    $('#energyVal').textContent = `${(+$('#energyMin').value).toFixed(2)} – ${(+$('#energyMax').value).toFixed(2)}`;
  }

  async function loadProfile(){
    try{
      const r = await fetch('/api/focus/profile'); if(!r.ok) return;
      const p = await r.json();
      $('#bpmMin').value = p.bpm_min; $('#bpmMax').value = p.bpm_max;
      $('#instrMin').value = p.instrumentalness_min; $('#instrVal').textContent = (+p.instrumentalness_min).toFixed(2);
      $('#energyMin').value = p.energy_min; $('#energyMax').value = p.energy_max; syncEnergy();
    }catch(e){}
  }
  async function saveProfile(){
    const profile = {
      bpm_min:+$('#bpmMin').value, bpm_max:+$('#bpmMax').value,
      instrumentalness_min:+$('#instrMin').value,
      energy_min:+$('#energyMin').value, energy_max:+$('#energyMax').value,
      valence_min:0, valence_max:1,
    };
    try{
      const r = await fetch('/api/focus/profile', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});
      if(r.ok && data) analyse();
    }catch(e){}
  }
  async function resetProfile(){ await fetch('/api/focus/profile/reset',{method:'POST'}); await loadProfile(); if(data) analyse(); }

  async function checkStatus(){
    try{
      const r = await fetch('/api/import/spotify/status'); if(!r.ok) return;
      const s = await r.json();
      const btn = $('#analyseTopBtn'), st = $('#focusSpotifyStatus');
      if(s.connected){ btn.disabled = false; st.textContent = 'Spotify connected'; }
      else { btn.disabled = true; st.textContent = s.configured ? 'connect Spotify to begin' : 'Spotify not configured'; }
    }catch(e){}
  }

  async function analyse(){
    $('#focusEmpty').style.display = 'none';
    $('#focusTracks').innerHTML = '<div class="fc-load">Analysing your top tracks…</div>';
    $('#focusStats').style.display = 'none'; $('#bpmInsight').style.display = 'none';
    try{
      const r = await fetch(`/api/focus/top-tracks?time_range=${timeRange}`);
      if(!r.ok){ const e = await r.json().catch(()=>({})); fail(e.detail || 'Failed to load top tracks.'); return; }
      data = await r.json(); render(data);
    }catch(err){ fail(err.message || 'Request failed.'); }
  }
  function fail(msg){ $('#focusTracks').innerHTML=''; $('#focusEmpty').style.display=''; $('#focusEmpty').textContent = msg; }

  function render(d){
    $('#focusStats').style.display = 'flex';
    $('#statTotal').textContent   = d.total_top_tracks ?? '—';
    $('#statFocus').textContent   = d.audio_features_available===false ? '—' : (d.focus_tracks_count ?? '—');
    $('#statAvgBpm').textContent  = d.bpm_insight ? d.bpm_insight.mean : '—';
    $('#statTopScore').textContent= d.focus_tracks?.[0]?.focus_score!=null ? d.focus_tracks[0].focus_score.toFixed(0) : '—';
    const ins = $('#bpmInsight');
    if(d.bpm_insight){ ins.innerHTML = `<b>Your listening BPM: avg ${d.bpm_insight.mean}, range ${d.bpm_insight.min}–${d.bpm_insight.max}.</b> ${esc(d.bpm_insight.suggestion||'')}`; ins.style.display=''; }
    else ins.style.display = 'none';

    const c = $('#focusTracks'); c.innerHTML = '';
    const hasFeat = d.audio_features_available !== false;
    const list = hasFeat ? (d.focus_tracks || []) : (d.top_tracks || []).slice(0,20);
    if(!list.length){
      c.innerHTML = `<div class="fc-load">${hasFeat ? 'No tracks matched your focus profile. Widen the BPM range or lower the instrumentalness threshold.' : esc(d.warning||'Spotify audio features are unavailable.')}</div>`;
      return;
    }
    list.forEach(t=>{
      const row = document.createElement('button'); row.className = 'fc-track';
      const art = t.thumbnail ? `<img src="${esc(t.thumbnail)}" alt="" loading="lazy">` : `<span class="r-ph">♪</span>`;
      const score = hasFeat && t.focus_score!=null
        ? `<span class="fc-score">${t.focus_score.toFixed(0)}<span class="fc-bar"><i style="width:${Math.max(0,Math.min(100,Math.round(t.focus_score)))}%"></i></span></span>`
        : `<span class="r-conf">${t.tempo? t.tempo+' bpm':'—'}</span>`;
      row.innerHTML =
        `<span class="r-art">${art}</span>`+
        `<span class="r-body"><span class="r-name">${esc(t.title)}</span>`+
        `<span class="r-meta">${esc(t.artist)}${t.album?' · '+esc(t.album):''}${hasFeat&&t.tempo?` · ${t.tempo} bpm`:''}</span></span>`+
        score;
      row.addEventListener('click', ()=>{
        closeFocusPanel();
        loadTrack({ title:t.title, artist:t.artist, album:t.album, thumbnail:t.thumbnail,
          duration: t.duration_ms ? Math.round(t.duration_ms/1000) : undefined,
          spotifyId: t.id || t.track_id });
      });
      c.appendChild(row);
    });
  }

  // ---- wiring ----
  $('#analyseTopBtn')?.addEventListener('click', analyse);
  $('#focusSaveBtn')?.addEventListener('click', saveProfile);
  $('#focusResetBtn')?.addEventListener('click', resetProfile);
  $('#instrMin')?.addEventListener('input', ()=> $('#instrVal').textContent = (+$('#instrMin').value).toFixed(2));
  $('#energyMin')?.addEventListener('input', syncEnergy);
  $('#energyMax')?.addEventListener('input', syncEnergy);
  $('#timeTabs')?.addEventListener('click', e=>{
    const b = e.target.closest('.time-tab'); if(!b) return;
    timeRange = b.dataset.range;
    [...$('#timeTabs').children].forEach(x=> x.classList.toggle('active', x===b));
    analyse();
  });

  // app.js calls this when the panel opens
  window.focusOnOpen = ()=>{ loadProfile(); checkStatus(); };
})();
