/* Phase · Field — audio engine.
   Sources: synthetic (default), mic, or a local file. Active sources feed the
   advanced analysis: log-spaced bands, per-band AGC, an asymmetric envelope
   follower (fast attack / slow release), and spectral-flux onset detection — the
   same pipeline as the player engine. Bands are 0..1, ready for the shaders.
   setStatus()/reflectButtons() are provided by app.js. */
const AUDIO = {
  ctx:null, analyser:null, freq:null, prevFreq:null, src:null, el:null, stream:null,
  active:false, mode:null,
  bass:0, mid:0, vocal:0, treble:0, level:0, pulse:0,
  _bandMax:new Float32Array([0.04,0.04,0.04,0.04,0.04]),  // sub/bass, mid, treble, level, vocal
  _flux:new Float32Array(43), _fluxIdx:0, _onset:0, _lastBeat:0,

  _ensureCtx(){
    if(!this.ctx){
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096;                 // ~10.8 Hz/bin → real sub/bass resolution
      this.analyser.smoothingTimeConstant = 0.5;    // light; the envelope follower smooths
      this.analyser.minDecibels = -90;              // dynamic-range window tuned for music
      this.analyser.maxDecibels = -25;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.prevFreq = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if(this.ctx.state === 'suspended') this.ctx.resume();
  },
  _disconnect(){
    if(this.src){ try{ this.src.disconnect(); }catch(e){} this.src = null; }
    if(this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream = null; }
    if(this.el){ this.el.pause(); this.el = null; }
    // a media element can only be wrapped in a MediaElementSource once, so the
    // stream source is created lazily and kept — just disconnect + pause it.
    if(this._streamSrc){ try{ this._streamSrc.disconnect(); }catch(e){} }
    if(this._streamEl){ try{ this._streamEl.pause(); }catch(e){} }
  },
  /* drive the analysis from a streaming <audio> element (the playing track) */
  useStream(el){
    this._ensureCtx();
    this._disconnect();
    this._streamEl = el;
    if(!this._streamSrc) this._streamSrc = this.ctx.createMediaElementSource(el);
    this._streamSrc.connect(this.analyser);
    this._streamSrc.connect(this.ctx.destination);   // hear it
    this.active = true; this.mode = 'stream';
    this._bandMax.fill(0.04);
    setStatus('now playing', true); reflectButtons();
  },
  async useMic(){
    this._ensureCtx();
    if(this.mode === 'mic'){ this.stop(); return; }
    this._disconnect();
    try{
      this.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    }catch(e){ setStatus('mic denied', false); return; }
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.src.connect(this.analyser);              // not to destination — avoid feedback
    this.active = true; this.mode = 'mic';
    this._bandMax.fill(0.04);
    setStatus('mic live', true); reflectButtons();
  },
  useFile(file){
    this._ensureCtx();
    this._disconnect();
    const url = URL.createObjectURL(file);
    this.el = new Audio(url);
    this.el.crossOrigin = 'anonymous';
    this.el.loop = true;
    this.src = this.ctx.createMediaElementSource(this.el);
    this.src.connect(this.analyser);
    this.src.connect(this.ctx.destination);       // hear it
    this.el.play();
    this.active = true; this.mode = 'file';
    this._bandMax.fill(0.04);
    setStatus(file.name.replace(/\.[^.]+$/,''), true); reflectButtons();
  },
  stop(){
    this._disconnect();
    this.active = false; this.mode = null;
    this.bass=this.mid=this.vocal=this.treble=this.level=this.pulse=0;
    this._onset = 0;
    setStatus('synthetic', false); reflectButtons();
  },
  update(t){
    if(!this.active || !this.analyser){
      // glide back to rest so a stop doesn't snap the visuals
      this.bass*=0.9; this.mid*=0.9; this.vocal*=0.9; this.treble*=0.9; this.level*=0.9; this.pulse*=0.9;
      this._onset *= 0.9;
      return;
    }
    this.analyser.getByteFrequencyData(this.freq);
    const bins = this.freq, n = bins.length;
    const hzPerBin = this.ctx.sampleRate / this.analyser.fftSize;
    const band = (loHz,hiHz)=>{
      const lo = Math.max(1, Math.round(loHz/hzPerBin));
      const hi = Math.min(n, Math.round(hiHz/hzPerBin));
      let s=0,c=0; for(let i=lo;i<hi;i++){ s+=bins[i]/255; c++; } return c?s/c:0;
    };
    const rawSub=band(20,60), rawBass=band(60,170), rawMid=band(170,1500),
          rawVoc=band(300,3000), rawTreb=band(1500,6500), rawLvl=band(30,8000);
    /* per-band AGC: normalize against a slowly-decaying running max so quiet and
       loud sources drive the visuals with comparable range. */
    const agc=(i,raw)=>{ this._bandMax[i]=Math.max(raw,this._bandMax[i]*0.9995); return Math.min(1, raw/Math.max(this._bandMax[i],0.04)); };
    const nBass=Math.min(1, agc(0, 0.6*rawSub+0.4*rawBass)*1.1),
          nMid=agc(1,rawMid), nTreb=agc(2,rawTreb), nLvl=agc(3,rawLvl), nVoc=agc(4,rawVoc);
    /* asymmetric envelope follower: fast attack snaps to transients, slow release. */
    const follow=(s,raw)=> raw>s ? s+(raw-s)*0.6 : s+(raw-s)*0.12;
    this.bass=follow(this.bass,nBass); this.mid=follow(this.mid,nMid);
    this.treble=follow(this.treble,nTreb); this.level=follow(this.level,nLvl);
    this.vocal=follow(this.vocal,nVoc);
    /* spectral-flux onset detection (sum of positive bin changes, adaptive thresh) */
    let flux=0; for(let i=2;i<n;i++){ const d=this.freq[i]-this.prevFreq[i]; if(d>0) flux+=d; } flux/=n*255;
    this.prevFreq.set(this.freq);
    this._flux[this._fluxIdx%this._flux.length]=flux; this._fluxIdx++;
    let fAvg=0; for(let i=0;i<this._flux.length;i++) fAvg+=this._flux[i]; fAvg/=this._flux.length;
    let fVar=0; for(let i=0;i<this._flux.length;i++){ const d=this._flux[i]-fAvg; fVar+=d*d; } fVar/=this._flux.length;
    if(flux > fAvg + 1.4*Math.sqrt(fVar) && flux>0.008 && t-this._lastBeat>0.16){ this._onset=1; this._lastBeat=t; }
    this._onset *= 0.9;
    this.pulse = Math.max(this._onset*this._onset, this.bass*0.55);
  }
};
