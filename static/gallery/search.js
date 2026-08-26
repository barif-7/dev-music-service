/* Phase · Field — centered music-search modal with live /api/autocomplete and
   session-scoped recently played tracks. The field does not exist visually until
   the dock search button, '/' or Command/Ctrl-K invokes it. */
(function(){
  const $ = (s,r=document)=> r.querySelector(s);
  const omni = $('#omni'), input = $('#omniInput'), drop = $('#omniDrop');
  const trigger = $('#btnSearch'), closeBtn = $('#musicSearchClose'), scrim = $('#musicSearchScrim');
  if(!input) return;

  let results = [], sel = -1, dropOpen = false;
  let acTimer = null, acInFlight = null;
  let returnFocus = null;
  const cache = new Map();
  const esc = s => (s==null?'':String(s)).replace(/[&<>]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

  function setOpen(v){
    dropOpen = v;
    omni.classList.toggle('open', v);
    input.setAttribute('aria-expanded', String(v));
    if(!v) input.removeAttribute('aria-activedescendant');
  }

  function render(pool){
    results = pool; sel = pool.length ? 0 : -1;
    if(!pool.length){
      drop.innerHTML = input.value.trim() ? `<div class="r-empty">No match for “${esc(input.value.trim())}”</div>` : '';
      setOpen(!!input.value.trim());
      return;
    }
    drop.innerHTML = pool.map((s,idx)=>{
      const conf = Math.min(99, Math.max(20, s.confidence||50));
      const tier = conf>=85?'high':conf>=60?'mid':'low';
      const meta = [s.artist||'—', s.album||'—', s.release_year||'—'].map(esc);
      const art = s.thumbnail
        ? `<img src="${esc(s.thumbnail)}" alt="" loading="lazy">`
        : `<span class="r-ph">♪</span>`;
      return `<button type="button" class="result" id="omniResult-${idx}" role="option" data-idx="${idx}" aria-selected="${idx===0}">
        <span class="r-art">${art}<span class="r-src">${srcShortFor(s)}</span></span>
        <span class="r-body">
          <span class="r-name">${esc(s.title||'Untitled')}</span>
          <span class="r-meta">${meta[0]} <span class="r-dim">· ${meta[1]} · ${meta[2]}</span></span>
        </span>
        <span class="r-conf ${tier}">${conf}%</span>
      </button>`;
    }).join('');
    [...drop.querySelectorAll('.result')].forEach(el=>{
      el.addEventListener('mousedown', e=> e.preventDefault());   // keep input focus through click
      el.addEventListener('click', ()=> choose(+el.dataset.idx));
      el.addEventListener('pointermove', ()=> setSel(+el.dataset.idx));
    });
    setOpen(true);
  }

  function setSel(i){
    if(!results.length) return;
    sel = (i + results.length) % results.length;
    const opts = [...drop.querySelectorAll('.result')];
    opts.forEach((el,idx)=> el.setAttribute('aria-selected', idx===sel));
    const cur = opts[sel];
    if(cur){
      input.setAttribute('aria-activedescendant', cur.id);
      const top = cur.offsetTop, bot = top + cur.offsetHeight;
      if(top < drop.scrollTop) drop.scrollTop = top - 6;
      else if(bot > drop.scrollTop + drop.clientHeight) drop.scrollTop = bot - drop.clientHeight + 6;
    }
  }

  function choose(i){
    const s = results[i]; if(!s) return;
    input.value = s.title || '';
    closeModal();
    loadTrack(s);
  }

  function focusableIn(root){
    return [...root.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    )].filter(el=>el.tabIndex >= 0 && !el.hidden && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function openModal(){
    if(typeof activeDialog !== 'undefined' && activeDialog && typeof closeManagedDialog === 'function'){
      closeManagedDialog(activeDialog);
    }
    returnFocus = document.activeElement;
    omni.classList.add('show');
    omni.setAttribute('aria-hidden', 'false');
    omni.inert = false;
    omni.removeAttribute('inert');
    trigger?.setAttribute('aria-expanded', 'true');
    if(typeof state === 'object') state.searchOpen = true;
    if(typeof renderRecentlyPlayed === 'function') renderRecentlyPlayed();
    if(typeof wake === 'function') wake();
    requestAnimationFrame(()=>{ input.focus({ preventScroll:true }); input.select(); });
  }

  function closeModal(){
    clearTimeout(acTimer);
    if(acInFlight){ acInFlight.abort(); acInFlight = null; }
    setOpen(false);
    omni.classList.remove('show');
    omni.setAttribute('aria-hidden', 'true');
    omni.inert = true;
    omni.setAttribute('inert', '');
    trigger?.setAttribute('aria-expanded', 'false');
    if(typeof state === 'object') state.searchOpen = false;
    if(returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll:true });
    if(typeof wake === 'function') wake();
  }
  window.openMusicSearchModal = openModal;
  window.closeMusicSearchModal = closeModal;

  function query(){
    const q = input.value.trim();
    if(!q){ render([]); return; }
    const key = q.toLowerCase();
    if(cache.has(key)){ render(cache.get(key)); return; }
    clearTimeout(acTimer);
    if(acInFlight){ acInFlight.abort(); acInFlight = null; }
    acTimer = setTimeout(async ()=>{
      const ctrl = new AbortController(); acInFlight = ctrl;
      try{
        const pool = await fetchAutocomplete(key, ctrl.signal);
        if(acInFlight !== ctrl) return;
        cache.set(key, pool);
        if(input.value.trim().toLowerCase() !== key) return;
        render(pool);
      }catch(e){ if(e.name !== 'AbortError') console.warn('search', e); }
      finally{ if(acInFlight === ctrl) acInFlight = null; }
    }, 120);
  }

  input.addEventListener('input', query);
  input.addEventListener('focus', ()=>{ if(typeof wake==='function') wake(); if(results.length || input.value.trim()) setOpen(true); });
  input.addEventListener('blur', ()=>{ setTimeout(()=>{ setOpen(false); if(typeof wake==='function') wake(); }, 160); });
  input.addEventListener('keydown', (e)=>{
    switch(e.key){
      case 'ArrowDown': e.preventDefault(); if(dropOpen) setSel(sel+1); else query(); break;
      case 'ArrowUp':   e.preventDefault(); setSel(sel-1); break;
      case 'Enter':     e.preventDefault(); if(sel>=0) choose(sel); break;
      case 'Escape':    e.preventDefault(); closeModal(); break;
    }
  });

  trigger?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  scrim?.addEventListener('click', closeModal);
  omni.addEventListener('keydown', e=>{
    if(e.key !== 'Tab') return;
    const nodes = focusableIn(omni);
    if(!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length-1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
  window.addEventListener('keydown', (e)=>{
    if(document.activeElement === input) return;
    if((e.key==='k'||e.key==='K') && (e.metaKey||e.ctrlKey)){ e.preventDefault(); openModal(); return; }
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName||'') || e.target.isContentEditable;
    if(e.key==='/' && !typing){ e.preventDefault(); openModal(); }
  });
})();
