/* Semi's Pika voice-profile surface, localized as a Base44 plugin.

   The backend feature flag is the source of truth. Until it is explicitly
   enabled, the toggle remains hidden, the panel is absent from dock layout,
   and the iframe never receives a URL. The scene deliberately contains only
   shared readiness metadata: no account, profile ID, or consent credential is
   sent into the guest. */
(function(){
  const frame = document.getElementById('pikaVoiceProfileFrame');
  const panel = document.getElementById('pikaVoiceProfilePanel');
  const toggle = document.getElementById('pikaVoiceProfileBtn');
  if(!frame || !panel || !toggle) return;

  const modeLabels = {
    neutral:'Neutral',
    user_consent:'Consented',
    licensed:'Licensed',
  };
  let scene = {
    status:'loading',
    backendConfigured:false,
    profile:{ configured:false, label:'Neutral voice', mode:'neutral', modeLabel:'Neutral' },
    message:'Checking shared voice configuration…',
  };
  let plugin = null;

  function toScene(config){
    const mode = config?.voice_mode || 'neutral';
    const backendConfigured = Boolean(config?.backend_configured);
    const configured = Boolean(config?.profile_configured);
    return {
      status:'ready',
      backendConfigured,
      profile:{
        configured,
        label:config?.voice_label || 'Neutral voice',
        mode,
        modeLabel:modeLabels[mode] || 'Neutral',
      },
      message:backendConfigured && configured
        ? 'Shared configuration is ready for host-managed playback.'
        : 'Voice-profile controls remain unavailable while the integration is in development.',
    };
  }

  async function fetchConfiguration(){
    const response = await fetch('/api/vocals/config', { cache:'no-store' });
    if(!response.ok) throw new Error(`Voice configuration returned ${response.status}`);
    return response.json();
  }

  async function refresh(){
    scene = { ...scene, status:'loading', message:'Checking shared voice configuration…' };
    plugin?.invalidate();
    try{
      scene = toScene(await fetchConfiguration());
    }catch(error){
      scene = {
        ...scene,
        status:'error',
        backendConfigured:false,
        message:'Shared voice configuration is unavailable.',
      };
    }
    plugin?.invalidate();
  }

  fetchConfiguration().then(config=>{
    if(!config?.pika_voice_profile?.enabled) return;

    scene = toScene(config);
    toggle.hidden = false;
    panel.hidden = false;

    const dock = PluginDock.register({
      id:'pika-voice-profile',
      el:panel,
      toggle,
      onOpen(){
        if(!frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src);
        plugin.invalidate();
      },
    });

    plugin = Base44AppPlugin.create({
      id:'base44-semi-voice-profile',
      surface:'voice-profile',
      frame,
      frameFloats:0,
      uniformKeys:[],
      scene(){ return scene; },
      frame_(){ return null; },
      paused(){ return !dock.isOpen(); },
      intents:{ refresh },
    });

    toggle.addEventListener('click', ()=>dock.toggle());
  }).catch(()=>{
    /* A missing or unreachable backend keeps the pre-release feature absent. */
  });
})();
