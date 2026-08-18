/* Phase · Field — spectrum: ambient FFT strip with persistent view controls. */
const SPECTRUM_DEFAULTS = Object.freeze({
  style:'bars',
  bands:48,
  palette:'lime',
  scale:'linear',
  frequency:'log',
  direction:'forward',
  spacing:'normal',
  opacity:'balanced',
  peaks:true,
  response:'balanced',
  gain:'normal',
  height:'standard',
  caps:'soft',
  glow:true,
});

const EQ = {
  storageKey:'phase-field-spectrum-view-v1',
  opts: {...SPECTRUM_DEFAULTS},
  levels: new Float32Array(48),
  peaks:  new Float32Array(48),
  pal: {
    lime:  {base:'rgba(215,255,58,0.10)',  mid:'rgba(215,255,58,0.55)',  hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', sw:'#d7ff3a'},
    ice:   {base:'rgba(122,217,255,0.12)', mid:'rgba(122,217,255,0.55)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', sw:'#7ad9ff'},
    magma: {base:'rgba(255,106,61,0.12)',  mid:'rgba(255,106,61,0.60)',  hot:'rgba(255,230,150,0.95)', peak:'rgba(255,240,210,0.85)', sw:'#ff6a3d'},
    mono:  {base:'rgba(244,244,245,0.12)', mid:'rgba(244,244,245,0.45)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', sw:'#f4f4f5'},
    violet:{base:'rgba(178,132,255,0.12)', mid:'rgba(178,132,255,0.58)', hot:'rgba(255,245,255,0.96)', peak:'rgba(255,245,255,0.84)', sw:'#b284ff'},
    aurora:{base:'rgba(72,220,166,0.12)',  mid:'rgba(72,220,166,0.54)',  hot:'rgba(146,218,255,0.96)', peak:'rgba(236,255,248,0.86)', sw:'#48dca6'},
  },
  responseMap: {
    calm: { attack:0.38, release:0.08, peakFall:0.004 },
    balanced: { attack:0.65, release:0.14, peakFall:0.008 },
    punchy: { attack:0.82, release:0.22, peakFall:0.014 },
  },
  gainMap: { soft:1.15, normal:1.6, boost:2.15 },
  heightMap: { slim:48, standard:80, tall:128 },
  opacityMap: { subtle:0.3, balanced:0.55, vivid:0.82 },
  spacingMap: { tight:0.0014, normal:0.003, airy:0.006 },
  choices: {
    style:['bars','mirror','wave','dots','ribbon','skyline','needles','prism','halo'],
    bands:[16,32,48,72,96],
    palette:['lime','ice','magma','mono','violet','aurora'],
    scale:['linear','log'],
    frequency:['log','linear'],
    direction:['forward','reverse'],
    spacing:['tight','normal','airy'],
    opacity:['subtle','balanced','vivid'],
    response:['calm','balanced','punchy'],
    gain:['soft','normal','boost'],
    height:['slim','standard','tall'],
    caps:['soft','square'],
  },
  load(){
    let saved=null;
    try{ saved=JSON.parse(localStorage.getItem(this.storageKey)||'null'); }catch(_error){ saved=null; }
    if(!saved || typeof saved!=='object') return;
    Object.entries(this.choices).forEach(([key, values])=>{
      if(values.includes(saved[key])) this.opts[key]=saved[key];
    });
    ['peaks','glow'].forEach(key=>{ if(typeof saved[key]==='boolean') this.opts[key]=saved[key]; });
    this.setBands(this.opts.bands);
  },
  save(){
    try{ localStorage.setItem(this.storageKey, JSON.stringify(this.opts)); }catch(_error){ /* preferences are optional */ }
  },
  reset(){
    this.opts={...SPECTRUM_DEFAULTS};
    this.setBands(this.opts.bands);
    this.save();
  },
  setBands(n){ n=+n; if(n===this.levels.length) return; this.levels=new Float32Array(n); this.peaks=new Float32Array(n); },
  shape(v){ return this.opts.scale==='log' ? Math.max(0, Math.min(1, Math.log10(1+v*9))) : v; },
  applyGlow(ctx, color, dpr, amount=6){
    if(!this.opts.glow){ ctx.shadowBlur=0; return; }
    ctx.shadowColor=color;
    ctx.shadowBlur=amount*dpr;
  },
  fillBar(ctx, x, y, width, height, radius=4){
    if(this.opts.caps==='soft' && typeof ctx.roundRect==='function'){
      const r=Math.min(radius, width/2, height/2);
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, r);
      ctx.fill();
      return;
    }
    ctx.fillRect(x, y, width, height);
  },

  update(){
    const N = this.levels.length;
    const response=this.responseMap[this.opts.response] || this.responseMap.balanced;
    if(typeof AUDIO==='object' && AUDIO.active && AUDIO.freq && AUDIO.analyser){
      const gain=this.gainMap[this.opts.gain] || this.gainMap.normal;
      const freq=AUDIO.freq, bins=freq.length, nyq=AUDIO.ctx.sampleRate/2, binHz=nyq/bins;
      const minHz=40, maxHz=Math.min(18000, nyq), lo=Math.log10(minHz), hi=Math.log10(maxHz);
      for(let i=0;i<N;i++){
        const t0=i/N, t1=(i+1)/N;
        const f0=this.opts.frequency==='linear' ? minHz+t0*(maxHz-minHz) : Math.pow(10,lo+t0*(hi-lo));
        const f1=this.opts.frequency==='linear' ? minHz+t1*(maxHz-minHz) : Math.pow(10,lo+t1*(hi-lo));
        const b0=Math.max(0,Math.floor(f0/binHz)), b1=Math.min(bins-1,Math.ceil(f1/binHz));
        let s=0,c=0; for(let b=b0;b<=b1;b++){ s+=freq[b]; c++; }
        const v=Math.min(1,(c?s/c/255:0)*gain);
        const prev=this.levels[i];
        this.levels[i]=prev+(v-prev)*(v>prev?response.attack:response.release);
        this.peaks[i]=Math.max(this.levels[i], this.peaks[i]-response.peakFall);
      }
    } else {
      const idleFall=Math.max(0.004, response.peakFall*0.7);
      for(let i=0;i<N;i++){ this.levels[i]*=(1-response.release*0.6); this.peaks[i]=Math.max(this.levels[i], this.peaks[i]-idleFall); }
    }
  },

  draw(canvas){
    canvas.classList.toggle('live', !!(typeof AUDIO==='object' && AUDIO.active));
    const o=this.opts;
    const cssHeight=this.heightMap[o.height] || this.heightMap.standard;
    const targetHeight=`${cssHeight}px`;
    if(canvas.style.height!==targetHeight) canvas.style.height=targetHeight;
    canvas.style.setProperty('--spectrum-opacity', this.opacityMap[o.opacity] || this.opacityMap.balanced);
    const ctx=canvas.getContext('2d');
    const dpr=Math.min(window.devicePixelRatio||1, 2);
    const w=Math.round(canvas.clientWidth*dpr), h=Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
    ctx.clearRect(0,0,w,h);
    const c=this.pal[o.palette]||this.pal.lime, n=this.levels.length, style=o.style, showPeaks=o.peaks;
    const lv=this.levels, pk=this.peaks, shp=v=>this.shape(v);
    const requestedGap=Math.max(1*dpr, w*(this.spacingMap[o.spacing] || this.spacingMap.normal));
    const maxGap=Math.max(0,(w-n*dpr)/Math.max(1,n-1));
    const gap=Math.min(requestedGap,maxGap), bw=(w-gap*(n-1))/n;
    const sourceIndex=i=>o.direction==='reverse' ? n-1-i : i;

    if(style==='wave'||style==='ribbon'||style==='dots'||style==='skyline'||style==='halo'){
      const pts=[];
      for(let i=0;i<n;i++){ const v=shp(lv[sourceIndex(i)]); pts.push([i*(bw+gap)+bw/2, h-Math.max(2*dpr, v*h*0.94)]); }
      if(style==='wave'){
        ctx.lineWidth=2*dpr; ctx.strokeStyle=c.hot; this.applyGlow(ctx, c.mid, dpr, 6);
        ctx.beginPath(); pts.forEach((p,i)=> i===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1])); ctx.stroke(); ctx.shadowBlur=0;
        const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,c.mid); g.addColorStop(1,c.base);
        ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(0,h); pts.forEach(p=>ctx.lineTo(p[0],p[1])); ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
      } else if(style==='ribbon'){
        const mid=h/2; ctx.fillStyle=c.mid; ctx.beginPath();
        pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; i===0?ctx.moveTo(p[0],mid-dy):ctx.lineTo(p[0],mid-dy); });
        for(let i=pts.length-1;i>=0;i--){ const p=pts[i], dy=(h-p[1])*0.5; ctx.lineTo(p[0],mid+dy); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle=c.hot; ctx.lineWidth=1*dpr; this.applyGlow(ctx, c.mid, dpr, 4);
        ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; i===0?ctx.moveTo(p[0],mid-dy):ctx.lineTo(p[0],mid-dy); }); ctx.stroke();
        ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; i===0?ctx.moveTo(p[0],mid+dy):ctx.lineTo(p[0],mid+dy); }); ctx.stroke();
        ctx.shadowBlur=0;
      } else if(style==='dots'){
        ctx.fillStyle=c.hot; const r=Math.max(1.5*dpr, bw*0.32); this.applyGlow(ctx, c.mid, dpr, 5);
        pts.forEach(p=>{ ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fill(); });
        ctx.shadowBlur=0;
      } else if(style==='skyline'){
        const left=i=>Math.max(0,pts[i][0]-bw/2), right=i=>Math.min(w,pts[i][0]+bw/2);
        const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,c.mid); g.addColorStop(1,c.base);
        ctx.fillStyle=g; this.applyGlow(ctx,c.mid,dpr,3);
        ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(left(0),pts[0][1]);
        pts.forEach((p,i)=>{
          if(i){ ctx.lineTo(left(i),pts[i-1][1]); ctx.lineTo(left(i),p[1]); }
          ctx.lineTo(right(i),p[1]);
        });
        ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
        ctx.strokeStyle=c.hot; ctx.lineWidth=1*dpr; ctx.beginPath(); ctx.moveTo(left(0),pts[0][1]);
        pts.forEach((p,i)=>{
          if(i){ ctx.lineTo(left(i),pts[i-1][1]); ctx.lineTo(left(i),p[1]); }
          ctx.lineTo(right(i),p[1]);
        });
        ctx.stroke(); ctx.shadowBlur=0;
      } else { // halo — three low-cost, smoothed contour traces
        const trace=(amount,color,width)=>{
          const y=p=>h-(h-p[1])*amount;
          ctx.strokeStyle=color; ctx.lineWidth=width*dpr; ctx.beginPath();
          ctx.moveTo(pts[0][0],y(pts[0]));
          for(let i=1;i<pts.length-1;i++){
            const mx=(pts[i][0]+pts[i+1][0])/2, my=(y(pts[i])+y(pts[i+1]))/2;
            ctx.quadraticCurveTo(pts[i][0],y(pts[i]),mx,my);
          }
          const last=pts[pts.length-1]; ctx.lineTo(last[0],y(last)); ctx.stroke();
        };
        trace(0.42,c.base,1); trace(0.7,c.mid,1.4);
        this.applyGlow(ctx,c.mid,dpr,5); trace(1,c.hot,1.8); ctx.shadowBlur=0;
      }
      return;
    }

    if(style==='needles'){
      const g=ctx.createLinearGradient(0,h,0,0); g.addColorStop(0,c.base); g.addColorStop(0.72,c.mid); g.addColorStop(1,c.hot);
      ctx.strokeStyle=g; ctx.lineWidth=Math.max(1*dpr,Math.min(3*dpr,bw*0.18));
      ctx.lineCap=o.caps==='soft'?'round':'butt'; this.applyGlow(ctx,c.mid,dpr,4);
      for(let i=0;i<n;i++){
        const source=sourceIndex(i), v=shp(lv[source]), pv=shp(pk[source]);
        const x=i*(bw+gap)+bw/2, y=h-Math.max(2*dpr,v*h*0.96);
        ctx.beginPath(); ctx.moveTo(x,h); ctx.lineTo(x,y); ctx.stroke();
        if(showPeaks){ const py=h-pv*h*0.96; ctx.fillStyle=c.peak; ctx.fillRect(x-dpr,py-1.5*dpr,2*dpr,2*dpr); }
      }
      ctx.shadowBlur=0; ctx.lineCap='butt';
      return;
    }

    if(style==='prism'){
      const g=ctx.createLinearGradient(0,h,0,0); g.addColorStop(0,c.base); g.addColorStop(0.62,c.mid); g.addColorStop(1,c.hot);
      ctx.fillStyle=g; ctx.strokeStyle=c.mid; ctx.lineWidth=.75*dpr; this.applyGlow(ctx,c.mid,dpr,3);
      for(let i=0;i<n;i++){
        const source=sourceIndex(i), v=shp(lv[source]), pv=shp(pk[source]);
        const x=i*(bw+gap), apex=x+bw/2, y=h-Math.max(2*dpr,v*h*0.96);
        ctx.beginPath(); ctx.moveTo(x,h); ctx.lineTo(apex,y); ctx.lineTo(x+bw,h); ctx.closePath(); ctx.fill(); ctx.stroke();
        if(showPeaks){ const py=h-pv*h*0.96; ctx.fillStyle=c.peak; ctx.fillRect(apex-dpr,py-1*dpr,2*dpr,1.5*dpr); ctx.fillStyle=g; }
      }
      ctx.shadowBlur=0;
      return;
    }

    for(let i=0;i<n;i++){
      const source=sourceIndex(i), v=shp(lv[source]), pv=shp(pk[source]), x=i*(bw+gap);
      if(style==='mirror'){
        const mid=h/2, bh=Math.max(1.5*dpr, v*mid*0.94);
        let g=ctx.createLinearGradient(0,mid,0,0); g.addColorStop(0,c.base); g.addColorStop(0.6,c.mid); g.addColorStop(1,c.hot);
        this.applyGlow(ctx, c.mid, dpr, 4);
        ctx.fillStyle=g; this.fillBar(ctx,x,mid-bh,bw,bh,4*dpr);
        g=ctx.createLinearGradient(0,mid,0,h); g.addColorStop(0,c.base); g.addColorStop(0.6,c.mid); g.addColorStop(1,c.hot);
        ctx.fillStyle=g; this.fillBar(ctx,x,mid,bw,bh,4*dpr);
        ctx.shadowBlur=0;
        if(showPeaks){ const ph=pv*mid*0.94; ctx.fillStyle=c.peak; ctx.fillRect(x,mid-ph-1*dpr,bw,1.2*dpr); ctx.fillRect(x,mid+ph,bw,1.2*dpr); }
        continue;
      }
      const bh=Math.max(2*dpr, v*h*0.96), y=h-bh;
      const g=ctx.createLinearGradient(0,h,0,y); g.addColorStop(0,c.base); g.addColorStop(0.55,c.mid); g.addColorStop(1,c.hot);
      this.applyGlow(ctx, c.mid, dpr, 4);
      ctx.fillStyle=g; this.fillBar(ctx,x,y,bw,bh,4*dpr);
      ctx.shadowBlur=0;
      if(showPeaks){ const py=h-pv*h*0.96; ctx.fillStyle=c.peak; ctx.fillRect(x,py-2*dpr,bw,1.5*dpr); }
    }
  },

  wire(){
    const root=document.getElementById('eqControls'); if(!root) return;
    this.load();
    const reflect=()=> root.querySelectorAll('.eqChips').forEach(g=>{
      const key=g.dataset.key;
      g.querySelectorAll('.eqChip').forEach(chip=>{
        const on = key==='peaks' ? this.opts.peaks : key==='glow' ? this.opts.glow : String(this.opts[key])===chip.dataset.v;
        chip.classList.toggle('on', on);
        chip.setAttribute('aria-pressed', String(on));
      });
    });
    root.addEventListener('click', e=>{
      if(e.target.closest('#eqReset')){
        this.reset();
        reflect();
        return;
      }
      const chip=e.target.closest('.eqChip'); if(!chip) return;
      const key=chip.parentElement.dataset.key, v=chip.dataset.v;
      if(key==='peaks')      this.opts.peaks=!this.opts.peaks;
      else if(key==='glow')  this.opts.glow=!this.opts.glow;
      else if(key==='bands'){ this.opts.bands=+v; this.setBands(+v); }
      else                   this.opts[key]=v;
      this.save();
      reflect();
    });
    reflect();
    const btn=document.getElementById('btnEq'), pop=root;
    /* A dock panel: placement, sizing, stacking, Escape and the toggle's
       pressed state all come from PluginDock. Spectrum settings are worth
       adjusting while the visuals react, so this is deliberately not modal —
       no scrim, no focus trap, and no closing on an outside click. */
    const dock = PluginDock.register({
      id:'spectrum',
      el:pop,
      toggle:btn,
      showClass:'show',
      focusFirst:'.eqChip',
      onOpen(){ if(typeof wake==='function') wake(); },
    });
    btn?.addEventListener('click', e=>{ e.stopPropagation(); dock.toggle(); });
  },
};
EQ.wire();
