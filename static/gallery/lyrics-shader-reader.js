/* The Shader Lab reader, mounted as a Base44 plugin.

   Phase remains the single source of truth for playback, timed lyrics, FFT and
   reader preferences. This file resolves that state into a scene and pushes a
   packed uniform frame each rAF; the surface only renders it and sends back
   intents. Everything it used to derive now lives in LyricScene. */
(function(){
  const frameEl = document.getElementById('lyricsShaderReaderFrame');
  const reader  = document.getElementById('lyricReader');
  if(!frameEl || !reader) return;

  let lines = [];
  let signature = '';
  let activeIndex = -1;
  let analysis = LyricScene.analyze('');
  let analysedIndex = -2;

  function wallpaper(){
    if(typeof ALTS === 'undefined' || !ALTS.length) return null;
    const index = typeof Wallpaper !== 'undefined' ? Wallpaper.index : 0;
    const entry = ALTS[index] || ALTS[0];
    return {
      index,
      id:String(entry.id || ''),
      name:String(entry.name || 'Wallpaper'),
      preset:String(entry.preset || ''),
      bpm:Number(entry.bpm || 0),
      palette:Array.isArray(entry.palette) ? entry.palette.slice(0, 5) : [],
    };
  }

  /* Cheap signal for "the lyric scene changed". Localized text streams in a
     line at a time, so the count of localized lines is part of it. Replaces
     serializing the whole snapshot every tick just to compare it. */
  function sceneSignature(){
    const source = Array.isArray(player?.lyrics) ? player.lyrics : [];
    let localized = 0;
    for(const line of source) if(line.localized) localized++;
    return [
      player?.current?.webpage_url || '',
      source.length,
      localized,
      typeof lyricLocale === 'string' ? lyricLocale : '',
      lastLyricsMeta?.source_locale || '',
      player?.current?.title || '',
    ].join('|');
  }

  function syncLines(){
    const next = sceneSignature();
    if(next === signature) return;
    signature = next;
    lines = LyricScene.lines(player?.lyrics);
    analysedIndex = -2;
    plugin.invalidate();
  }

  function buildScene(){
    const paper = wallpaper();
    /* One computation, two consumers: the shell's own frame styling and the
       surface, which sets it as --reader-soft-gradient on its root. */
    const gradient = WallpaperPalette.gradient(paper);
    reader.style.setProperty('--lyrics-reader-soft-gradient', gradient);
    return {
      gradient,
      preset:LyricScene.preset(paper),
      track:player?.current ? {
        title:player.current.title || 'Untitled track',
        artist:player.current.artist || '',
        album:player.current.album || '',
      } : null,
      lines,
      duration:Number(player?.playbackDuration || player?.current?.duration || 0),
      translationLabel:typeof selectedLyricLocaleLabel === 'function' ? selectedLyricLocaleLabel() : '',
      translationLocale:typeof lyricLocale === 'string' ? lyricLocale : '',
      sourceLocale:lastLyricsMeta?.source_locale || '',
      wallpaper:paper,
      prefs:ReaderPreferences.values,
      view:ReaderPreferences.view,
      backgroundVisible:ReaderPreferences.backgroundVisible,
    };
  }

  function packFrame(out){
    const time = Number(player?.currentTime || 0);
    activeIndex = LyricScene.activeIndex(lines, time);
    if(activeIndex !== analysedIndex){
      analysedIndex = activeIndex;
      const line = activeIndex >= 0 ? lines[activeIndex] : null;
      analysis = LyricScene.analyze(line?.text || '', line?.section || 'intro');
    }
    LyricScene.writeUniforms(out, {
      analysis,
      wallpaper:wallpaper(),
      time,
      frame:typeof AUDIO === 'object' ? AUDIO : null,
    });
    return {
      time,
      active:activeIndex,
      playing:Boolean(player?.isPlaying),
      mood:analysis.mood,
      level:LyricScene.clamp01(typeof AUDIO === 'object' ? AUDIO.level : 0),
    };
  }

  function saveList(key, entry, cap){
    try{
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      const next = [...saved.filter(item=>item.id !== entry.id), entry].slice(-cap);
      localStorage.setItem(key, JSON.stringify(next));
      return true;
    }catch(e){ return false; }
  }

  function setPlaybackRate(value){
    const rate = Number.isFinite(value) ? Math.max(.5, Math.min(1.5, value)) : 1;
    if(typeof streamEl !== 'undefined' && streamEl) streamEl.playbackRate = rate;
    if(typeof videoEl !== 'undefined' && videoEl) videoEl.playbackRate = rate;
    if(typeof translatedVocalEl !== 'undefined' && translatedVocalEl) translatedVocalEl.playbackRate = rate;
  }

  const plugin = Base44AppPlugin.create({
    id:'lyrics-shader-lab',
    surface:'reader',
    frame:frameEl,
    frameFloats:14,
    uniformKeys:LyricScene.uniformKeys,
    scene:buildScene,
    frame_:packFrame,          /* named frame_ so it cannot collide with `frame` */
    paused(){ return !reader.classList.contains('lab-ready'); },
    onReady(){ reader.classList.add('lab-ready'); },
    onLost(){ reader.classList.remove('lab-ready'); },
    intents:{
      seek(payload){
        const time = Number(payload?.time);
        if(Number.isFinite(time) && time >= 0) player.seekTo(time);
      },
      rate(payload){ setPlaybackRate(Number(payload?.rate)); },
      translate(){ localizeAhead(Number(player?.currentTime || 0) * 1000); },
      view(payload){ ReaderPreferences.setView(payload?.view); },
      background(payload){ ReaderPreferences.setBackgroundVisible(payload?.visible); },
      preference(payload){ ReaderPreferences.set(payload?.key, payload?.value); },
      practice(payload){
        const line = lines[payload?.index];
        if(!line?.text) return;
        saveList('phaseField.lyricPracticeLines', {
          id:`${player?.current?.title || 'track'}:${line.time}:${payload.index}`,
          track:player?.current ? { title:player.current.title, artist:player.current.artist } : null,
          original:line.text,
          localized:line.localized || '',
          locale:typeof lyricLocale === 'string' ? lyricLocale : '',
        }, 100);
      },
      vocabulary(payload){
        if(!payload?.word) return;
        saveList('phaseField.lyricVocabulary', {
          ...payload,
          id:`${payload.word}:${typeof lyricLocale === 'string' ? lyricLocale : ''}`,
          savedAt:new Date().toISOString(),
        }, 200);
      },
    },
  });

  /* The frame pump is rAF-driven; only the O(n) staleness check is throttled. */
  window.setInterval(syncLines, 250);
  ReaderPreferences.subscribe(()=>plugin.invalidate());
  if(typeof Wallpaper !== 'undefined') Wallpaper.subscribe(()=>plugin.invalidate());
  syncLines();
})();
