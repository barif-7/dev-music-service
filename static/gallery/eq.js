/* Phase · Field — spectrum: ambient FFT strip with edit controls
   (view / bands / colour / scale / peaks). Ported from the player's EQ. */
const EQ = {
  opts: { style:'bars', bands:48, palette:'lime', scale:'linear', peaks:true },
  levels: new Float32Array(48),
  peaks:  new Float32Array(48),
  pal: {
    lime:  {base:'rgba(215,255,58,0.10)',  mid:'rgba(215,255,58,0.55)',  hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', sw:'#d7ff3a'},
    ice:   {base:'rgba(122,217,255,0.12)', mid:'rgba(122,217,255,0.55)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', sw:'#7ad9ff'},
    magma: {base:'rgba(255,106,61,0.12)',  mid:'rgba(255,106,61,0.60)',  hot:'rgba(255,230,150,0.95)', peak:'rgba(255,240,210,0.85)', sw:'#ff6a3d'},
    mono:  {base:'rgba(244,244,245,0.12)', mid:'rgba(244,244,245,0.45)', hot:'rgba(255,255,255,0.95)', peak:'rgba(255,255,255,0.85)', sw:'#f4f4f5'},
  },
  setBands(n){ n=+n; if(n===this.levels.length) return; this.levels=new Float32Array(n); this.peaks=new Float32Array(n); },
  shape(v){ return this.opts.scale==='log' ? Math.max(0, Math.min(1, Math.log10(1+v*9))) : v; },

  update(){
    const N = this.levels.length;
    if(typeof AUDIO==='object' && AUDIO.active && AUDIO.freq && AUDIO.analyser){
      const freq=AUDIO.freq, bins=freq.length, nyq=AUDIO.ctx.sampleRate/2, binHz=nyq/bins;
      const lo=Math.log10(40), hi=Math.log10(18000);   // log frequency map 40Hz–18kHz
      for(let i=0;i<N;i++){
        const f0=Math.pow(10, lo+(i/N)*(hi-lo)), f1=Math.pow(10, lo+((i+1)/N)*(hi-lo));
        const b0=Math.max(0,Math.floor(f0/binHz)), b1=Math.min(bins-1,Math.ceil(f1/binHz));
        let s=0,c=0; for(let b=b0;b<=b1;b++){ s+=freq[b]; c++; }
        const v=Math.min(1,(c?s/c/255:0)*1.6);
        const prev=this.levels[i];
        this.levels[i]=prev+(v-prev)*(v>prev?0.65:0.14);
        this.peaks[i]=Math.max(this.levels[i], this.peaks[i]-0.008);
      }
    } else {
      for(let i=0;i<N;i++){ this.levels[i]*=0.88; this.peaks[i]=Math.max(this.levels[i], this.peaks[i]-0.005); }
    }
  },

  draw(canvas){
    canvas.classList.toggle('live', !!(typeof AUDIO==='object' && AUDIO.active));
    const ctx=canvas.getContext('2d');
    const dpr=Math.min(window.devicePixelRatio||1, 2);
    const w=Math.round(canvas.clientWidth*dpr), h=Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
    ctx.clearRect(0,0,w,h);
    const o=this.opts, c=this.pal[o.palette]||this.pal.lime, n=this.levels.length, style=o.style, showPeaks=o.peaks;
    const lv=this.levels, pk=this.peaks, shp=v=>this.shape(v);
    const gap=Math.max(1*dpr, w*0.003), bw=(w-gap*(n-1))/n;

    if(style==='wave'||style==='ribbon'||style==='dots'){
      const pts=[];
      for(let i=0;i<n;i++){ const v=shp(lv[i]); pts.push([i*(bw+gap)+bw/2, h-Math.max(2*dpr, v*h*0.94)]); }
      if(style==='wave'){
        ctx.lineWidth=2*dpr; ctx.strokeStyle=c.hot; ctx.shadowColor=c.mid; ctx.shadowBlur=6*dpr;
        ctx.beginPath(); pts.forEach((p,i)=> i===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1])); ctx.stroke(); ctx.shadowBlur=0;
        const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,c.mid); g.addColorStop(1,c.base);
        ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(0,h); pts.forEach(p=>ctx.lineTo(p[0],p[1])); ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
      } else if(style==='ribbon'){
        const mid=h/2; ctx.fillStyle=c.mid; ctx.beginPath();
        pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; i===0?ctx.moveTo(p[0],mid-dy):ctx.lineTo(p[0],mid-dy); });
        for(let i=pts.length-1;i>=0;i--){ const p=pts[i], dy=(h-p[1])*0.5; ctx.lineTo(p[0],mid+dy); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle=c.hot; ctx.lineWidth=1*dpr;
        ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; i===0?ctx.moveTo(p[0],mid-dy):ctx.lineTo(p[0],mid-dy); }); ctx.stroke();
        ctx.beginPath(); pts.forEach((p,i)=>{ const dy=(h-p[1])*0.5; i===0?ctx.moveTo(p[0],mid+dy):ctx.lineTo(p[0],mid+dy); }); ctx.stroke();
      } else { // dots
        ctx.fillStyle=c.hot; const r=Math.max(1.5*dpr, bw*0.32);
        pts.forEach(p=>{ ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fill(); });
      }
      return;
    }

    for(let i=0;i<n;i++){
      const v=shp(lv[i]), pv=shp(pk[i]), x=i*(bw+gap);
      if(style==='mirror'){
        const mid=h/2, bh=Math.max(1.5*dpr, v*mid*0.94);
        let g=ctx.createLinearGradient(0,mid,0,0); g.addColorStop(0,c.base); g.addColorStop(0.6,c.mid); g.addColorStop(1,c.hot);
        ctx.fillStyle=g; ctx.fillRect(x,mid-bh,bw,bh);
        g=ctx.createLinearGradient(0,mid,0,h); g.addColorStop(0,c.base); g.addColorStop(0.6,c.mid); g.addColorStop(1,c.hot);
        ctx.fillStyle=g; ctx.fillRect(x,mid,bw,bh);
        if(showPeaks){ const ph=pv*mid*0.94; ctx.fillStyle=c.peak; ctx.fillRect(x,mid-ph-1*dpr,bw,1.2*dpr); ctx.fillRect(x,mid+ph,bw,1.2*dpr); }
        continue;
      }
      const bh=Math.max(2*dpr, v*h*0.96), y=h-bh;
      const g=ctx.createLinearGradient(0,h,0,y); g.addColorStop(0,c.base); g.addColorStop(0.55,c.mid); g.addColorStop(1,c.hot);
      ctx.fillStyle=g; ctx.fillRect(x,y,bw,bh);
      if(showPeaks){ const py=h-pv*h*0.96; ctx.fillStyle=c.peak; ctx.fillRect(x,py-2*dpr,bw,1.5*dpr); }
    }
  },

  wire(){
    const root=document.getElementById('eqControls'); if(!root) return;
    const reflect=()=> root.querySelectorAll('.eqChips').forEach(g=>{
      const key=g.dataset.key;
      g.querySelectorAll('.eqChip').forEach(chip=> chip.classList.toggle('on',
        key==='peaks' ? this.opts.peaks : String(this.opts[key])===chip.dataset.v));
    });
    root.addEventListener('click', e=>{
      const chip=e.target.closest('.eqChip'); if(!chip) return;
      const key=chip.parentElement.dataset.key, v=chip.dataset.v;
      if(key==='peaks')      this.opts.peaks=!this.opts.peaks;
      else if(key==='bands'){ this.opts.bands=+v; this.setBands(+v); }
      else                   this.opts[key]=v;
      reflect();
    });
    reflect();
    const btn=document.getElementById('btnEq'), pop=root;
    btn?.addEventListener('click', e=>{ e.stopPropagation(); pop.classList.toggle('show'); });
    document.addEventListener('click', e=>{
      if(pop.classList.contains('show') && !pop.contains(e.target) && e.target!==btn) pop.classList.remove('show');
    });
  },
};
EQ.wire();
