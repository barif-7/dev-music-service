// Shader sources — extracted verbatim from the original alternatives file.
const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const COMMON = `
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform float iClick;
uniform float iPulse;
uniform float iEnergy;
uniform float iIntensity;
uniform float iWarp;
uniform float iGrain;
uniform float iMid;    // 170-1500 Hz melodic body  (0 when no audio / default)
uniform float iVocal;  // 300-3000 Hz vocal/lead     (0 when no audio / default)
uniform float iBass;   // low band (used by the 5 built-in shaders)
uniform float iTreble; // high band
uniform float iSub;    // 20-60 Hz foundation
uniform float iLowMid; // 170-500 Hz warmth/body
uniform float iHighMid;// 2-4 kHz presence/attack
uniform float iCentroid;// spectral brightness, 0 dark .. 1 bright
uniform float iFlux;   // normalized spectral onset/change
uniform float iRms;    // normalized time-domain loudness
uniform float iPeak;   // time-domain peak amplitude
uniform float iHue;    // hue rotation (radians) — driven by track valence
uniform float iPlaying;// 1 = live
// ReccoBeats per-track features (0..1 constants; 0 / 0.5 when unknown)
uniform float iDance;      // danceability
uniform float iValence;    // mood: 0 dark .. 1 happy
uniform float iAcoustic;   // acousticness
uniform float iInstrum;    // instrumentalness
uniform float iLive;       // liveness
uniform float iSpeech;     // speechiness
uniform float iTrackEnergy;// Spotify track energy (vs live iEnergy)
uniform float iLoud;       // loudness, normalized 0..1
uniform float iTempo;      // track tempo (BPM from features)
uniform float iBpm;        // effective tempo, beats/sec (live-detected or nominal)
uniform float iBeat;       // 0..1 beat-grid phase
uniform float iProgress;   // 0..1 song position
uniform vec3  iAccent;     // dominant album-art colour (1,1,1 when unknown)
#define MID_GAIN 0.18
#define VOCAL_GAIN 0.30
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0., a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; }
  return v;
}
float grain(vec2 uv, float t){ return (hash(uv*1234.0 + t) - 0.5); }
vec3 hueShift(vec3 c, float h){
  const mat3 toYIQ = mat3(0.299,0.587,0.114, 0.596,-0.274,-0.322, 0.211,-0.523,0.312);
  const mat3 toRGB = mat3(1.0,0.956,0.621, 1.0,-0.272,-0.647, 1.0,-1.107,1.704);
  vec3 yiq = toYIQ * c;
  float cos_h=cos(h), sin_h=sin(h);
  yiq.yz = mat2(cos_h,-sin_h,sin_h,cos_h) * yiq.yz;
  return toRGB * yiq;
}

// Shared response curve for the Tame Impala set. Keeping this in COMMON means
// each shader consumes the exact uniform contract uploaded by Tile.draw(); the
// helpers are only retained by GLSL when a fragment calls tameUniformFinish.
float tameLiveDrive(){
  return clamp(
    iPulse*.08 + iEnergy*.09 + iIntensity*.07 + iGrain*.02 +
    iMid*.07 + iVocal*.07 + iBass*.09 + iTreble*.07 + iSub*.06 +
    iLowMid*.06 + iHighMid*.06 + iCentroid*.05 + iFlux*.06 +
    iRms*.05 + iPeak*.05,
    0.0, 1.25
  );
}
float tameTrackDrive(){
  float tempoDrive=iTempo>0.0 ? clamp(iTempo/180.0,0.0,1.0) : clamp(iBpm*.72,0.0,1.0);
  return clamp(
    iDance*.14 + iValence*.08 + iAcoustic*.09 + iInstrum*.10 +
    iLive*.08 + iSpeech*.07 + iTrackEnergy*.14 + iLoud*.10 +
    tempoDrive*.10 + iBeat*.04 + iProgress*.06,
    0.0, 1.0
  );
}
vec3 tameUniformFinish(vec3 col,vec2 p){
  float liveDrive=tameLiveDrive();
  float trackDrive=tameTrackDrive();
  vec2 mouse=(iMouse-.5)*2.0;
  mouse.x*=iResolution.x/iResolution.y;
  float pointer=exp(-length(p-mouse)*(3.2-1.1*iWarp));
  float clickWave=exp(-pow((length(p-mouse)-(1.0-iClick)*.82)*10.0,2.0))*iClick;
  float motionLift=pointer*iWarp*.045+clickWave*(.08+.10*liveDrive);
  vec3 accent=max(iAccent,vec3(.025));
  col=mix(col,col*accent*(1.05+.18*iValence),.035+.09*trackDrive);
  col=hueShift(col,iHue*(.06+.08*trackDrive));
  col*=.90+.16*liveDrive+.08*trackDrive+motionLift;
  col*=mix(.84,1.0,iPlaying);
  col+=mix(vec3(.65,.72,.82),accent,.45)*motionLift;
  return col;
}
`;

// API shader sources are populated lazily by app.js. The renderer prefers a
// verified API source when available and falls back to the bundled equivalent.
const API_FRAGS = Object.create(null);

const FRAGS = {
  drift: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*(0.10 + 0.10*iDance);   // danceable tracks drift faster
  vec2 q = p*1.2 + vec2(t*0.6, t*0.18);
  q += (m-p)*0.06*iWarp;
  float n1 = fbm(q + fbm(q*1.7 + t)*0.7);
  float n2 = fbm(q*2.2 - vec2(t*0.4, t*0.2));
  float n3 = fbm(p*4.0 + vec2(0, t*0.8));
  vec3 base  = vec3(0.06, 0.08, 0.10);
  vec3 deep  = vec3(0.10, 0.16, 0.20);
  vec3 sage  = vec3(0.45, 0.62, 0.55);
  vec3 coral = vec3(0.96, 0.55, 0.40);
  vec3 col = mix(base, deep, smoothstep(0.1, 0.85, n1));
  col = mix(col, sage,  smoothstep(0.40, 0.85, n1) * (0.55+0.45*iIntensity));
  col = mix(col, coral, smoothstep(0.62, 0.95, n2) * 0.70);
  col += coral * 0.18 * exp(-length(p-m)*1.6) * iPulse;
  col += sage  * 0.12 * n3 * (0.4 + 0.6*iEnergy);
  float ring = exp(-pow((length(p-m) - (1.0-iClick)*0.8)*8.0, 2.0)) * iClick;
  col += coral * ring * 0.6;
  // vignette
  col *= 0.85 + 0.15 * smoothstep(1.5, 0.2, length(p));
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  vellum: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*(0.05 + 0.04*iAcoustic);   // acoustic tracks bleed a touch faster
  // slow bleeding ink fields
  float ink1 = fbm(p*1.4 + vec2(t, 0.0));
  float ink2 = fbm(p*0.7 - vec2(0.0, t*0.7) + vec2(2.0));
  float ink = smoothstep(0.30, 0.85, ink1*ink2*2.6);
  // cursor-driven bloom (slow)
  float bloomR = 0.55 + 0.25*iWarp;
  float bloom = exp(-pow(length(p-m)/bloomR, 2.0)) * (0.25 + 0.75*iClick);
  ink = max(ink, bloom*0.85);
  // paper fiber
  float fiber = fbm(p*44.0)*0.06 + (hash(p*900.0)-0.5)*0.04;
  // edge darkening of stains
  float edge = smoothstep(0.55, 0.45, ink1*ink2*2.6) * smoothstep(0.30, 0.45, ink1*ink2*2.6);
  vec3 paper = vec3(0.92, 0.86, 0.74);
  vec3 mid   = vec3(0.62, 0.45, 0.30);
  vec3 deep  = vec3(0.22, 0.13, 0.08);
  vec3 col = paper;
  col = mix(col, mid,  ink * 0.85);
  col = mix(col, deep, ink * ink * (0.55 + 0.45*iIntensity));
  col -= edge * 0.10;
  col -= fiber * 0.18;
  // slow breathing on beat
  col *= 0.94 + 0.06 * iPulse;
  // soft vignette warming corners
  float vig = smoothstep(1.6, 0.3, length(p));
  col = mix(col*0.86, col, vig);
  col += iGrain * 0.03 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  halftone: `
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float ang = 0.45 + iEnergy*0.25 + iTime*0.02 + iProgress*0.6;  // the print angle wheels across the song
  /* Preserve the original tight print screen and its large, dense centre. */
  float gridScale = 14.0 + iWarp*6.0;
  vec2 q = rot(ang) * p * gridScale;
  vec2 cell = fract(q) - 0.5;
  vec2 cid = floor(q);

  /* Treat the large centre as the clock/brain. It stays comparatively anchored
     while the smaller surrounding dots carry its signal outward in coherent waves. */
  float ph = hash(cid);
  float beatT = iBeat * 6.2831853;
  vec2 brainQ = rot(ang) * m * gridScale;
  vec2 fromBrain = (cid + 0.5) - brainQ;
  float brainDist = length(fromBrain) / gridScale;
  float brain = exp(-pow(brainDist/0.48, 2.0));
  vec2 radial = normalize(fromBrain + vec2(0.0001));
  vec2 tangent = vec2(-radial.y, radial.x);
  float signal = max(iPulse, pow(1.0-iBeat, 3.0));
  float surround = smoothstep(0.16, 0.92, brainDist);
  float wave = sin(beatT - brainDist*8.0 + ph*0.65);
  float travel = surround * (0.025 + 0.055*signal + 0.018*iEnergy);
  vec2 motion = radial * wave * travel;
  motion += tangent * cos(beatT - brainDist*5.0 + ph*0.35) * travel * 0.42;

  // original radius profile: the computer-brain cluster is largest at the cursor
  float pd = length(p - m);
  float base = 0.42 - smoothstep(0.0, 1.0, pd)*0.30;
  base *= 0.7 + 0.3*iIntensity;
  float neural = sin(iTime*(1.5 + iBpm*1.6) + ph*6.2831853) * 0.014 * brain;
  float beat = sin(beatT + ph*1.2) * 0.025*iPulse
             + (0.018 + 0.024*brain)*pow(1.0-iBeat, 3.0);
  float radius = base + neural + beat;
  float d = length(cell - motion);
  float dot = smoothstep(radius, radius-0.08, d);
  vec2 shineDir = normalize(vec2(cos(beatT*0.9 + ph*4.0), sin(beatT*1.1 - ph*3.0)));
  float shineSpot = smoothstep(0.11, 0.0, length(cell - shineDir * (0.10 + 0.03*signal)));
  float glint = dot * shineSpot * (0.40 + 0.60*brain) * (0.35 + 0.65*signal);
  // background gradient
  vec3 bg1 = vec3(0.05, 0.05, 0.07);
  vec3 bg2 = vec3(0.10, 0.07, 0.06);
  vec3 bg  = mix(bg1, bg2, smoothstep(-1.0, 1.0, p.y));
  vec3 ink = vec3(0.95, 0.42, 0.30);   // warm red
  vec3 hot = vec3(1.00, 0.78, 0.55);
  vec3 col = bg;
  col = mix(col, ink, dot);
  // keep the brain readable through contrast, with a narrow glint instead of a broad glow
  col = mix(col, hot, dot * brain * (0.03 + 0.05*signal));
  col += vec3(1.0, 0.96, 0.90) * glint * (0.22 + 0.18*signal);
  col += hot * glint * 0.16;
  // click ring (in screen space)
  float ring = exp(-pow((pd - (1.0-iClick)*0.7)*9.0, 2.0)) * iClick;
  col += ink * ring * 0.7;
  // gentle vignette
  col *= 0.9 + 0.1 * smoothstep(1.5, 0.3, length(p));
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  caustics: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.45;
  // slow drift offset
  vec2 dp = p + m*0.35*iWarp + vec2(sin(t*0.3), cos(t*0.4))*0.05;
  // caustic field: sum of sinusoids in rotating directions
  float c = 0.0;
  for(int i=0;i<4;i++){
    float fi = float(i);
    float a  = fi*1.37 + t*0.12;
    vec2  dir = vec2(cos(a), sin(a));
    float k  = 4.5 + fi*0.6;
    float ph = sin(t*0.5 + fi*1.7)*0.5;
    c += abs(sin(dot(dp, dir)*k + t*1.1 + ph)) * (0.7 + 0.3*sin(fi));
  }
  // sharper, brighter highlights
  c = 1.0 / (c*0.55 + 0.18);
  c = pow(min(c, 3.0), 1.8);
  vec3 deep = vec3(0.02, 0.06, 0.12);
  vec3 mid  = vec3(0.08, 0.30, 0.55);
  vec3 surf = vec3(0.25, 0.65, 0.95);
  vec3 hi   = vec3(0.85, 0.95, 1.00);
  vec3 col = deep;
  col = mix(col, mid,  smoothstep(0.0, 1.0, c));
  col = mix(col, surf, smoothstep(0.9, 1.8, c) * (0.6 + 0.4*iIntensity));
  col += hi   * smoothstep(1.6, 2.6, c) * (0.7 + 0.5*iEnergy + 0.4*iLoud);  // louder masters brighter
  // beat ripple from cursor
  float ripple = exp(-pow((length(p-m) - (1.0-iClick)*0.9)*8.0, 2.0)) * iClick;
  col += hi * ripple * 0.8;
  // pulsing brightness with beat
  col *= 0.85 + 0.15*iPulse;
  // depth vignette
  col *= 0.78 + 0.22 * smoothstep(1.5, 0.3, length(p));
  col += iGrain * 0.04 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  stria: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5);
  float t = iTime*0.45;
  // warp the vertical sheets
  float warp = fbm(vec2(p.x*1.6, p.y*0.5 + t)) * (0.4 + 0.7*iWarp);
  float x = p.x + warp*0.55 + m.x*0.35*iWarp;
  // four sheets
  float s = 0.0;
  for(int i=0;i<4;i++){
    float fi = float(i);
    float off = sin(fi*1.7 + t*0.32)*0.6 - 0.05;
    float ww  = 0.40 + 0.25*sin(t*0.8+fi);
    float w   = exp(-pow((x-off)/ww, 2.0)) * (0.55 + 0.45*iIntensity);
    float vfade = smoothstep(-1.3, 0.5, p.y + sin(t*0.5+fi*1.3)*0.4);
    float ripple = 0.5 + 0.5*sin(t*1.9 + fi*2.0 + p.y*4.0);
    s += w * vfade * ripple;
  }
  // horizontal scrim
  float scrim = 0.5 + 0.5*sin(p.y*120.0 + t*4.0);
  scrim = mix(1.0, scrim, 0.08);
  vec3 bg     = vec3(0.02, 0.025, 0.04);
  vec3 green  = vec3(0.30, 1.00, 0.55);
  vec3 cyan   = vec3(0.35, 0.85, 1.00);
  vec3 magenta= vec3(1.00, 0.30, 0.85);
  vec3 col = bg;
  col += green * s * (0.5 + 0.4*iEnergy);
  col += cyan  * s * 0.4 * (0.5 + 0.5*sin(t*0.7));
  col += magenta * s * (0.55*iPulse + 0.5*pow(1.0-iBeat, 3.0));  // magenta strobes on the beat
  // click vertical flash bar
  float flash = exp(-pow((p.x - m.x*1.2)*4.0, 2.0)) * iClick;
  col += magenta * flash * 0.6;
  col *= scrim;
  // top fade
  col *= 0.75 + 0.25 * smoothstep(-1.1, 0.5, p.y);
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  ember: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.20;
  // rising heat: domain warp upward
  vec2 q = p;
  q.y += t*0.9;
  q += (m-p)*0.05*iWarp;
  float heat  = fbm(q*1.8 + fbm(q*1.2 - vec2(0.0, t))*0.8);
  float plume = fbm(vec2(p.x*2.2, p.y*1.0 - t*1.5));
  vec3 base  = vec3(0.05, 0.03, 0.04);
  vec3 dim   = vec3(0.26, 0.07, 0.05);
  vec3 ember = vec3(0.96, 0.40, 0.12);
  vec3 hot   = vec3(1.00, 0.84, 0.46);
  float rise = smoothstep(-1.1, 0.7, p.y);
  float v = smoothstep(0.20, 0.90, heat) * rise;
  vec3 col = mix(base, dim, smoothstep(0.0, 0.6, heat));
  col = mix(col, ember, v*(0.6+0.4*iIntensity));
  col += hot * smoothstep(0.70, 1.0, heat*plume*1.6) * (0.5+0.5*iEnergy + 0.4*iTrackEnergy);  // energetic tracks flare higher
  col += ember * 0.45 * exp(-length(p-m)*2.0) * iPulse;
  float ring = exp(-pow((length(p-m) - (1.0-iClick)*0.8)*8.0, 2.0)) * iClick;
  col += hot * ring * 0.6;
  col *= 0.8 + 0.2 * smoothstep(1.5, 0.2, length(p));
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  marble: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.04;
  vec2 q = p*1.3;
  q += vec2(fbm(q + t), fbm(q - vec2(t, 0.0) + 5.2)) * 0.9;
  q += (m-p)*0.04*iWarp;
  float marb = fbm(q*1.6);
  float vein = abs(fbm(q*2.4 + marb*1.5) - 0.5);
  vein = smoothstep(0.06, 0.0, vein);
  vec3 stone = vec3(0.28, 0.30, 0.34);
  vec3 dark  = vec3(0.11, 0.12, 0.15);
  vec3 light = vec3(0.62, 0.66, 0.72);
  vec3 veinC = vec3(0.54, 0.72, 0.78);
  vec3 col = mix(dark, stone, smoothstep(0.2, 0.8, marb));
  col = mix(col, light, smoothstep(0.6, 0.95, marb)*(0.5+0.5*iIntensity));
  col = mix(col, veinC, vein*(0.7 + 0.3*iAcoustic));  // acoustic tracks show more mineral veining
  col += veinC * 0.16 * exp(-pow(length(p-m)/0.5, 2.0)) * (0.3+0.7*iClick);
  col *= 0.94 + 0.06*iPulse;
  col *= 0.85 + 0.15 * smoothstep(1.6, 0.3, length(p));
  col += iGrain * 0.03 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  weave: `
mat2 rotW(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.15;
  float freq = 30.0 + iWarp*14.0;
  float a1 = 0.40 + 0.10*sin(t) + length(p-m)*0.30;
  float a2 = -0.40 - 0.10*cos(t*0.8);
  float w1 = 0.5 + 0.5*sin((rotW(a1)*p).x*freq + t*2.0);
  float w2 = 0.5 + 0.5*sin((rotW(a2)*p).y*freq - t*1.6);
  float weave = smoothstep(0.3, 0.9, w1*w2);
  vec3 bg     = vec3(0.04, 0.05, 0.06);
  vec3 thread = vec3(0.55, 0.78, 0.95);
  vec3 cross  = vec3(1.00, 0.85, 0.55);
  vec3 col = bg;
  col = mix(col, thread, weave*(0.6+0.4*iIntensity + 0.3*iInstrum));  // instrumental tracks weave denser
  col += cross * smoothstep(0.7, 1.0, w1*w2) * (0.4+0.5*iEnergy);
  col += thread * 0.30 * exp(-length(p-m)*1.8) * iPulse;
  float ring = exp(-pow((length(p-m) - (1.0-iClick)*0.7)*9.0, 2.0)) * iClick;
  col += cross * ring * 0.6;
  col *= 0.9 + 0.1 * smoothstep(1.5, 0.3, length(p));
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  prism: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.30;
  vec2 d = p - m*0.6;
  float ang = atan(d.y, d.x);
  float r = length(d);
  float base = ang*6.0 + t*1.2 + r*4.0;
  float rr = 0.5 + 0.5*sin(base + 0.0);
  float gg = 0.5 + 0.5*sin(base + 0.6);
  float bb = 0.5 + 0.5*sin(base + 1.2);
  float falloff = exp(-r*1.1);
  vec3 col = vec3(rr, gg, bb) * falloff * (0.6+0.6*iIntensity);
  col += vec3(1.0) * exp(-r*4.0) * (0.5+0.5*iEnergy + 0.4*iLive);  // live recordings sparkle at the core
  col *= 0.85 + 0.15*iPulse;
  float ring = exp(-pow((r - (1.0-iClick)*0.8)*8.0, 2.0)) * iClick;
  col += vec3(0.85, 0.92, 1.00) * ring * 0.7;
  col += vec3(0.03, 0.02, 0.05);
  col *= 0.8 + 0.2 * smoothstep(1.6, 0.3, length(p));
  col += iGrain * 0.04 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  tunnel: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5);
  float t = iTime*(0.6 + 0.4*iDance);   // danceable tracks race down the tunnel faster
  vec2 c = p - m*0.4*iWarp;
  float r = length(c);
  float ang = atan(c.y, c.x);
  float depth = 1.0/(r+0.18) + t*1.4;
  float ringv  = 0.5 + 0.5*sin(depth*6.2831);
  float spoke  = 0.5 + 0.5*sin(ang*12.0);
  float grid = max(smoothstep(0.70, 1.0, ringv), smoothstep(0.85, 1.0, spoke));
  vec3 neon1 = vec3(0.30, 1.00, 0.70);
  vec3 neon2 = vec3(0.40, 0.60, 1.00);
  vec3 neon3 = vec3(1.00, 0.35, 0.80);
  vec3 cyc = neon1*(0.5+0.5*sin(depth*0.6))
           + neon2*(0.5+0.5*sin(depth*0.6+2.1))
           + neon3*(0.5+0.5*sin(depth*0.6+4.2));
  cyc /= 1.5;
  vec3 col = vec3(0.02, 0.02, 0.04);
  col += cyc * grid * (0.6+0.4*iIntensity);
  col += neon3 * grid * 0.5 * iPulse;
  col += vec3(0.6, 0.8, 1.0) * exp(-r*5.0) * (0.4+0.4*iEnergy);
  float flash = smoothstep(0.90, 1.0, ringv) * iClick;
  col += neon1 * flash * 0.6;
  col *= 0.85 + 0.15 * smoothstep(1.6, 0.2, r);
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  pulse: `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*iResolution)/min(iResolution.x,iResolution.y);
  vec2 m  = (iMouse - 0.5) * vec2(iResolution.x/iResolution.y, 1.0);
  vec2 d = uv - m; float r = length(d);
  float warp = 0.12 + 0.5*iWarp;
  uv -= d * warp * exp(-r*2.4);
  float rr = length(uv);
  /* rings — modest brightening with energy */
  float rings = 0.0;
  for(int i=0;i<4;i++){
    float age = iPulse - float(i)*0.14;
    if(age>0.0){
      float ring = exp(-pow((rr - age*0.95)*9.0, 2.0));
      rings += ring * (1.0 - age) * (0.7 + 0.25*iEnergy);
    }
  }
  float clickR = exp(-pow((length(uv-m) - (1.0-iClick)*0.9)*8.0, 2.0)) * iClick;
  float a = atan(uv.y, uv.x);
  /* energy slightly accelerates time */
  float tmod = iTime * (0.25 + 0.20*iEnergy);
  float wob = fbm(vec2(rr*3.0 - tmod, a*0.7 + tmod*0.4));
  /* bass gently expands the orb */
  float body = smoothstep(1.0, 0.05, rr - 0.16*wob - 0.10*iBass);
  /* treble shimmer in outer halo (subtle) */
  float shimmer = noise(vec2(uv.x*9.0 + iTime*2.0, uv.y*9.0 - iTime*1.5)) * exp(-rr*2.2);
  vec3 c1 = vec3(0.05, 0.06, 0.12);
  vec3 c2 = vec3(0.18, 0.08, 0.22);
  vec3 c3 = vec3(1.0, 0.65, 0.42);
  vec3 c4 = vec3(1.0, 0.88, 0.65);
  vec3 col = mix(c1, c2, body);
  col = mix(col, c3, rings * iIntensity);
  col = mix(col, c4, clickR*0.8);
  /* bass-driven center glow */
  col += c3 * (0.18 + 0.15*iBass) * exp(-rr*1.8) * (0.5 + 0.3*iEnergy + 0.35*pow(1.0-iBeat, 2.0));  // core flashes on the beat
  /* treble shimmer */
  col += c4 * shimmer * iTreble * 0.45;
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}`,
  tide: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p  = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  float mx = (iMouse.x-0.5);
  float my = (iMouse.y-0.5);
  /* energy slightly accelerates waves */
  float t = iTime*(0.18 + 0.12*iDance) + iEnergy*0.35;   // groove nudges the wave speed
  vec3 col = vec3(0.02, 0.04, 0.06);
  for(int i=0;i<5;i++){
    float fi = float(i);
    float yOff = -0.6 + fi*0.30 + my*0.6*(fi-2.0)*0.18;
    float speed = 0.25 + fi*0.07;
    /* bass gently swells wave amplitude — capped well below band spacing */
    float amp = 0.18 + 0.05*iBass;
    float wave = sin(p.x*1.4 + t*speed + fi*1.7) * amp
               + sin(p.x*3.0 - t*speed*1.3 + fi*0.6) * 0.06
               + fbm(vec2(p.x*1.2 + t*0.3, fi)) * 0.18;
    float split = (1.0 + 0.6*iWarp) * (1.0 - exp(-pow((p.x - mx*1.4)*1.0, 2.0)));
    wave += (p.y>yOff?1.0:-1.0) * (1.0 - split) * 0.25 * iWarp;
    float d = abs(p.y - (yOff + wave));
    /* keep band width near original; subtle treble sharpening only */
    float bandW = max(0.08, 0.16 - 0.03*iEnergy - 0.02*iTreble);
    float band = smoothstep(bandW, 0.0, d);
    vec3 hue = mix(vec3(0.05,0.45,0.55), vec3(0.55,0.95,0.85), fi/4.0);
    hue = mix(hue, vec3(0.95,0.85,0.55), iBass*0.35);
    col += hue * band * (0.35 + 0.65*iIntensity) * (0.7 + 0.4*iPulse);
    /* treble glint on wave crests (subtle) */
    col += vec3(0.9,1.0,0.95) * exp(-d*d*400.0) * iTreble * 0.30;
  }
  vec2 mp = vec2(iMouse.x-0.5, iMouse.y-0.5);
  mp.x *= iResolution.x/iResolution.y;
  float cr = length(p-mp);
  col += vec3(0.6,0.95,0.85) * exp(-cr*4.0) * iClick * 0.9;
  float v = smoothstep(1.1, 0.2, abs(p.y));
  col *= 0.7 + 0.3*v;
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}`,
  cells: `
vec2 cellPoint(vec2 ip){ return vec2(hash(ip+1.3), hash(ip+5.7)); }
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p  = uv * vec2(iResolution.x/iResolution.y, 1.0);
  p *= 7.0 + iWarp*4.0;
  vec2 mp = vec2(iMouse.x*iResolution.x/iResolution.y, iMouse.y) * (7.0 + iWarp*4.0);
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float minD = 10.0;
  vec2 minCell = vec2(0.0);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 off = vec2(float(x),float(y));
    vec2 cc = ip + off;
    vec2 cp = cellPoint(cc);
    cp += 0.25*vec2(sin(iTime*0.3 + cc.x*1.7), cos(iTime*0.4 + cc.y*2.1));
    vec2 toM = (mp - (cc+cp));
    cp += toM * 0.05 * iWarp;
    float d = length(off + cp - fp);
    if(d<minD){ minD = d; minCell = cc; }
  }
  float beatHash = hash(minCell + floor(iTime*2.0));
  float beat = smoothstep(0.65, 1.0, beatHash) * iPulse;
  float secD = 10.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 off = vec2(float(x),float(y));
    vec2 cc = ip + off;
    vec2 cp = cellPoint(cc);
    cp += 0.25*vec2(sin(iTime*0.3 + cc.x*1.7), cos(iTime*0.4 + cc.y*2.1));
    vec2 toM = (mp - (cc+cp));
    cp += toM * 0.05 * iWarp;
    float d = length(off + cp - fp);
    if(d>minD-0.001) secD = min(secD, d);
  }
  float edgeDist = secD - minD;
  float seam = 1.0 - smoothstep(0.004, 0.028, edgeDist);
  float h = hash(minCell + 0.7);
  vec3 hotC = vec3(1.0, 0.65, 0.25);
  vec3 cellCol = mix(vec3(1.00, 0.55, 0.18), vec3(1.00, 0.92, 0.50), h);
  vec3 col = cellCol * (1.10 + 0.30*h);
  col *= (1.0 - 0.92 * seam);
  col += hotC * 0.35 * (1.0 - smoothstep(0.0, 0.18, edgeDist)) * iEnergy;
  col = mix(col, vec3(1.0, 0.95, 0.75), beat * (0.6 + 0.4*iIntensity + 0.3*iLive));  // live tracks flare the cells
  vec2 mpUv = (uv - vec2(iMouse.x, iMouse.y));
  mpUv.x *= iResolution.x/iResolution.y;
  float ring = exp(-pow((length(mpUv) - (1.0-iClick)*0.7)*10.0, 2.0)) * iClick;
  col += hotC * ring;
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  gl_FragColor = vec4(col, 1.0);
}`,
  mercury: `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*iResolution)/min(iResolution.x,iResolution.y);
  vec2 m  = (iMouse - 0.5) * vec2(iResolution.x/iResolution.y, 1.0);
  /* metaball field: every blob's field is summed so neighbours continuously
     bridge and flow into one another — the liquid-mercury look. */
  float f = 0.0;
  f += 0.18 / max(length(uv - m), 0.02);
  /* energy gently accelerates blob speed */
  float spd = 0.35 + 0.30*iEnergy;
  for(int i=0;i<5;i++){
    float fi = float(i);
    float t = iTime*spd + fi*1.7;
    vec2 c = vec2(
      cos(t*0.9 + fi)*0.55 + sin(t*0.43)*0.18,
      sin(t*0.7 + fi*1.3)*0.42 + cos(t*0.27)*0.18
    );
    c = mix(c, m, 0.18*iWarp);
    /* bass slightly inflates blob radius */
    float radius = 0.11 + 0.04*iBass + 0.02*sin(t*2.0);
    f += radius / max(length(uv - c), 0.025);
  }
  /* pulse merges blobs (conservative — prevents full screen coverage) */
  float thresh = 2.4 - 0.6*iIntensity - 0.28*iPulse - 0.10*iBass;
  float surface = smoothstep(thresh-0.05, thresh+0.05, f);
  float inner   = smoothstep(thresh+0.4, thresh+0.2, f);
  vec3 bg = vec3(0.04, 0.05, 0.07);
  vec3 chrome1 = vec3(0.55, 0.62, 0.78);
  vec3 chrome2 = vec3(0.92, 0.95, 1.0);
  /* treble slightly warms specular */
  vec3 spec = mix(vec3(0.45, 0.7, 1.0), vec3(1.0, 0.85, 0.5), iTreble * 0.45);
  float env = 0.5 + 0.5*sin(uv.x*4.0 + uv.y*6.0 + iTime*0.4);
  vec3 chrome = mix(chrome1, chrome2, env);
  vec3 col = bg;
  col = mix(col, chrome, surface);
  float rim = surface - inner;
  col += spec * rim * (0.7 + 0.5*iEnergy);
  /* subtle treble noise texture on surface */
  float trebleTex = noise(uv*14.0 + vec2(iTime*2.0)) * iTreble * surface * 0.18;
  col += chrome2 * trebleTex;
  col += vec3(1.0) * iClick * 0.3 * surface;
  col += chrome2 * 0.15 * smoothstep(0.4, 0.0, length(uv-m)) * iIntensity;
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}`,
  lattice: `
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*iResolution)/min(iResolution.x,iResolution.y);
  vec2 m  = (iMouse - 0.5);
  /* energy gently accelerates rotation (bass would cause jitter as a velocity multiplier) */
  uv = rot(iTime*(0.08 + 0.15*iEnergy)) * uv;
  uv.x += m.x * 0.3 * iWarp;
  uv.y += m.y * 0.3 * iWarp;
  float scale = 7.0 + iWarp*3.0;
  vec2 p = uv * scale;
  vec2 q = vec2(p.x + p.y*0.577, p.y*1.155);
  vec2 iq = floor(q);
  vec2 fq = fract(q);
  float tri = step(fq.x + fq.y, 1.0);
  vec2 cellId = iq + vec2(tri<0.5?1.0:0.0);
  float d3 = 1.0 - fq.x - fq.y;
  float dEdge = min(min(fq.x, fq.y), abs(d3));
  if(tri<0.5){ dEdge = min(min(1.0-fq.x, 1.0-fq.y), abs(d3)); }
  /* bass slightly fattens grid lines */
  float edgeW = 0.05 + 0.03*iBass;
  float edge = smoothstep(edgeW, 0.0, dEdge);
  float beatH = hash(cellId + floor(iTime*1.5));
  float beat = smoothstep(0.7, 1.0, beatH) * iPulse;
  vec2 cen = (tri<0.5)? vec2(1.0/3.0, 1.0/3.0) : vec2(2.0/3.0, 2.0/3.0);
  float nodeD = length(fq - cen);
  /* bass slightly expands nodes */
  float node = exp(-nodeD*max(7.0, 10.0 - 2.5*iBass));
  float r = length(uv);
  float shock = exp(-pow((r - (1.0-iClick)*1.2)*6.0, 2.0)) * iClick;
  vec3 bg     = vec3(0.04, 0.03, 0.07);
  vec3 line   = vec3(0.40, 0.18, 0.55);
  vec3 hot    = vec3(1.0, 0.45, 0.85);
  vec3 hotter = vec3(1.0, 0.75, 0.95);
  /* treble subtly brightens grid lines */
  vec3 edgeC = mix(line, hotter, iTreble * 0.45);
  vec3 col = bg;
  col = mix(col, edgeC, edge*(0.35 + 0.65*iIntensity));
  col += hot * node * (0.5 + 0.4*iEnergy);
  col = mix(col, hotter, max(beat, 0.5*pow(1.0-iBeat, 3.0)));  // nodes spark on the detected beat
  col += hotter * shock;
  /* treble sparkles on nodes (gentle) */
  col += hotter * exp(-nodeD*15.0) * iTreble * 0.35;
  col += hot * (0.18 + 0.12*iBass) * exp(-r*2.2) * iIntensity;
  col += iGrain * 0.06 * grain(gl_FragCoord.xy, iTime);
  col = hueShift(col, iHue);
  col *= mix(0.82, 1.0, iPlaying);
  gl_FragColor = vec4(col, 1.0);
}`,
  aurora: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.12;
  vec3 col = vec3(0.02, 0.03, 0.07);
  float star = pow(hash(floor(gl_FragCoord.xy*0.5)), 64.0);
  col += vec3(0.7,0.8,1.0) * star * 0.7 * smoothstep(-0.4, 1.0, p.y);
  float total = 0.0;
  for(int i=0;i<3;i++){
    float fi = float(i);
    float wob = fbm(vec2(p.x*1.1 + fi*3.1, t*0.9 + fi*1.7));
    float cx  = (wob-0.5)*1.6 + sin(t*0.5 + fi*2.1)*0.35 + m.x*0.30*iWarp;
    float wdt = 0.16 + 0.09*sin(t*0.7 + fi);
    float band = exp(-pow((p.x - cx)/wdt, 2.0));
    float drape = 0.55 + 0.45*fbm(vec2(p.x*3.0, p.y*1.6 - t*1.6 + fi*2.0));
    float vfade = smoothstep(-1.05, 0.85, p.y) * drape;
    total += band * vfade;
  }
  vec3 green  = vec3(0.24, 0.95, 0.56);
  vec3 teal   = vec3(0.18, 0.72, 0.88);
  vec3 violet = vec3(0.62, 0.36, 0.96);
  col += green  * total * (0.55 + 0.45*iIntensity);
  col += violet * total*total * 0.55 * (0.4 + 0.6*iEnergy + 0.35*iLive);  // live recordings widen the violet curtains
  col += teal   * total * 0.30;
  col += green  * total * (0.45*iPulse + 0.40*pow(1.0-iBeat, 3.0));        // curtains brighten on the detected beat
  col += green  * 0.12 * exp(-length(p-m)*1.8) * (0.3 + 0.7*iClick);
  col *= 0.85 + 0.15 * smoothstep(1.6, 0.2, length(p));
  col += iGrain * 0.05 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  silk: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.06;
  vec2 q = p*1.2;
  q += (m-p)*0.05*iWarp;
  float fold  = fbm(vec2(q.x*1.4 + t, q.y*1.1));
  float drape = fbm(q*0.8 - vec2(0.0, t*0.6) + 3.0);
  float ridge = sin((q.y*2.6 + fold*5.0 + drape*2.0 + t)*3.14159);
  float sheen = pow(0.5 + 0.5*ridge, 3.5);
  vec3 deep  = vec3(0.07, 0.08, 0.15);
  vec3 satin = vec3(0.31, 0.34, 0.56);
  vec3 hi    = vec3(0.82, 0.84, 0.96);
  vec3 col = mix(deep, satin, smoothstep(0.1, 0.9, fold*0.6 + drape*0.6));
  col = mix(col, hi, sheen*(0.40 + 0.45*iIntensity)*(1.0 - 0.25*iAcoustic));  // acoustic tracks soften the satin sheen
  col += hi * 0.22 * exp(-pow(length(p-m)/0.55, 2.0)) * (0.25 + 0.75*iClick);
  col *= 0.94 + 0.06*iPulse;
  col *= 0.86 + 0.14 * smoothstep(1.6, 0.3, length(p));
  col += iGrain * 0.03 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  contour: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.07;
  vec2 q = p*1.5 + vec2(t*0.25, 0.0);
  q += (m-p)*0.06*iWarp;
  float h  = fbm(q + fbm(q*1.6 + t*0.4)*0.6);
  float pd = length(p-m);
  float e    = h*13.0 - t*(1.2 + 0.35*iBpm);   // isolines crawl in step with the track tempo
  float line = abs(fract(e) - 0.5);
  float iso  = smoothstep(0.10, 0.02, line);
  vec3 low  = vec3(0.05, 0.10, 0.09);
  vec3 mid  = vec3(0.09, 0.17, 0.15);
  vec3 land = mix(low, mid, smoothstep(0.2, 0.9, h));
  vec3 lineC = vec3(0.32, 0.85, 0.66);
  vec3 hot   = vec3(0.95, 0.78, 0.42);
  vec3 col = land;
  col = mix(col, lineC, iso*(0.5 + 0.4*iIntensity));
  col = mix(col, hot,   iso * exp(-pd*1.6) * (0.4 + 0.6*iEnergy));
  col += lineC * iso * 0.4 * iPulse;
  float ring = exp(-pow((pd - (1.0-iClick)*0.7)*9.0, 2.0)) * iClick;
  col += hot * ring * 0.5;
  col *= 0.9 + 0.1 * smoothstep(1.5, 0.3, length(p));
  col += iGrain * 0.04 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  solar: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.28;
  vec2 d = p - m*0.4;
  float r   = length(d);
  float ang = atan(d.y, d.x);
  float turb = fbm(vec2(ang*1.6 + sin(t*0.3)*0.5, r*3.2 - t*1.6));
  float surf = fbm(d*3.2 + turb*1.4 + vec2(t*0.5, -t*0.4));
  float plasma = surf*0.7 + turb*0.5;
  float core  = smoothstep(0.95, 0.0, r);
  float flare = plasma * exp(-r*1.25);
  vec3 col = vec3(0.04, 0.01, 0.0);
  vec3 deepRed = vec3(0.55, 0.10, 0.02);
  vec3 orange  = vec3(1.00, 0.48, 0.10);
  vec3 white   = vec3(1.00, 0.93, 0.74);
  col = mix(col, deepRed, smoothstep(0.0, 0.55, flare + core*0.5));
  col = mix(col, orange,  smoothstep(0.30, 0.85, flare + core*0.6) * (0.6 + 0.4*iIntensity));
  col += white * smoothstep(0.62, 1.0, core + flare*0.5) * (0.5 + 0.5*iEnergy + 0.4*iTrackEnergy);  // energetic tracks flare hotter
  col += white * core * (0.5*iPulse + 0.40*pow(1.0-iBeat, 3.0));   // the photosphere whitens on the beat
  float ripple = exp(-pow((r - (1.0-iClick)*0.85)*8.0, 2.0)) * iClick;
  col += white * ripple * 0.7;
  col *= 0.82 + 0.18 * smoothstep(1.6, 0.2, length(p));
  col += iGrain * 0.04 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  circuit: `
float circuitLine(float d, float width){
  return 1.0-smoothstep(width*0.22, width, abs(d));
}
float circuitPacket(float lane, float along, float phase, float seed){
  float barIndex = floor((iTime*iBpm-iBeat)*0.25);
  float direction = step(0.5, hash(vec2(seed,barIndex)))*2.0-1.0;
  float head = fract(phase*direction + seed);
  float body = abs(fract(along-head+0.5)-0.5);
  return circuitLine(lane, 0.052) * (1.0-smoothstep(0.015,0.16,body));
}
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);

  /* The board runs from the musical clock, not wall-clock animation:
     iBeat is one beat, subPhase is a sixteenth, and barBeat resets every four. */
  float beatKick = pow(1.0-iBeat, 4.0);
  float subPhase = fract(iBeat*4.0);
  float subKick = pow(1.0-subPhase, 8.0);
  float beatIndex = floor(iTime*iBpm-iBeat+0.001);
  float barBeat = mod(beatIndex, 4.0);
  float downbeat = beatKick * (1.0-step(0.5, barBeat));
  float musicalDrive = max(iPulse, beatKick);

  /* Cursor bends traces toward a live routing hub. Close traces bow harder while
     distant buses stay architectural, so interaction never dissolves the board. */
  vec2 toHub = m-p;
  float hubInfluence = exp(-dot(toHub,toHub)*2.4);
  vec2 routed = p + toHub*hubInfluence*(0.10 + 0.24*iWarp);
  float boardScale = 7.5 + 2.5*iDance;
  vec2 g = routed*boardScale;
  vec2 cell = floor(g);
  vec2 local = fract(g)-0.5;

  /* A new route family is elected every beat. The old geometry remains faintly
     visible, while active buses switch orientation and intensity on the clock. */
  float routeSeed = hash(cell + vec2(beatIndex, -beatIndex)*0.17);
  float horizontal = step(0.42, routeSeed);
  float vertical = 1.0-step(0.68, routeSeed);
  float hTrace = circuitLine(local.y, 0.055) * horizontal;
  float vTrace = circuitLine(local.x, 0.055) * vertical;
  float trace = max(hTrace, vTrace);
  float ghostGrid = max(circuitLine(local.x, 0.018), circuitLine(local.y, 0.018));

  /* Sixteenth-note data packets run along the elected routes. Bass makes them
     broader; treble creates a second, faster clock lane like high-speed serial. */
  float packetPhase = subPhase;
  float packetH = circuitPacket(local.y, g.x, packetPhase, hash(vec2(cell.y, beatIndex)));
  float packetV = circuitPacket(local.x, g.y, packetPhase, hash(vec2(cell.x, -beatIndex)));
  float packet = max(packetH*horizontal, packetV*vertical);
  float fastPacket = max(
    circuitPacket(local.y, g.x, fract(iBeat*8.0), hash(cell+7.3))*horizontal,
    circuitPacket(local.x, g.y, fract(iBeat*8.0), hash(cell-4.1))*vertical
  ) * iTreble;

  /* Solder nodes behave like a sequencer: one quarter of the board is armed per
     beat, then the downbeat ignites the central clock and sends a reset wave out. */
  float nodeShape = 1.0-smoothstep(0.045,0.145,length(local));
  float nodeGroup = floor(hash(cell+3.7)*4.0);
  float armed = 1.0-step(0.5, abs(nodeGroup-barBeat));
  float node = nodeShape * (0.12 + 0.88*armed*musicalDrive);

  float radius = length(p);
  float cpu = 1.0-smoothstep(0.27,0.34,max(abs(p.x),abs(p.y)));
  float cpuEdge = circuitLine(max(abs(p.x),abs(p.y))-0.305, 0.022);
  float cpuClock = 0.5+0.5*sin((p.x-p.y)*42.0 - iBeat*6.2831853);
  float resetRing = exp(-pow((radius-iBeat*1.45)*13.0,2.0))*downbeat;

  /* Click discharges the cursor hub into the board. It travels as a Manhattan
     wave, lighting right-angle routes instead of a generic circular ripple. */
  vec2 hubDelta = abs(p-m);
  float manhattan = hubDelta.x+hubDelta.y;
  float overloadFront = (1.0-iClick)*2.2;
  float overload = exp(-pow((manhattan-overloadFront)*10.0,2.0))*iClick;
  float hub = exp(-dot(toHub,toHub)*22.0);

  vec3 bg       = vec3(0.006,0.018,0.016);
  vec3 board    = vec3(0.015,0.075,0.058);
  vec3 copper   = vec3(0.08,0.38,0.27);
  vec3 signal   = vec3(0.10,1.00,0.58);
  vec3 clockCol = vec3(0.35,1.00,0.92);
  vec3 overloadCol = vec3(1.00,0.52,0.16);

  vec3 col = mix(bg, board, 0.42+0.30*fbm(p*2.3));
  col += copper * ghostGrid * (0.18+0.20*iIntensity);
  col += copper * trace * (0.34+0.42*iEnergy);
  col += signal * packet * (0.70+0.75*iBass+0.45*subKick);
  col += clockCol * fastPacket * (0.45+0.70*iIntensity);
  col += clockCol * node;
  col += signal * cpu * (0.05+0.16*cpuClock+0.30*iMid);
  col += clockCol * cpuEdge * (0.35+0.90*downbeat);
  col += clockCol * resetRing * (0.55+0.65*iEnergy);
  col += signal * hub * (0.35+0.65*iWarp);
  col += overloadCol * overload * (0.65+0.75*iClick);

  /* The whole backplane inhales on beats while the downbeat briefly turns the
     active signal almost white—an electrical, not merely luminous, crescendo. */
  col *= 0.88 + 0.12*musicalDrive;
  col += vec3(0.72,1.00,0.88) * trace * downbeat * 0.42;
  col = hueShift(col, iHue*0.22);
  col *= 0.72 + 0.28*(1.0-smoothstep(0.18,1.65,radius));
  col += iGrain * 0.035 * grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  cmyk: `
float cmykPlate(vec2 pp, vec2 brainP, float ang, float phase, float tone, float freq){
  mat2 R = mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
  vec2 q = R*pp*freq, brainQ = R*brainP*freq;
  vec2 cell = fract(q)-0.5, cid = floor(q);
  vec2 fromBrain = (cid+0.5)-brainQ;
  float dist = length(fromBrain)/freq;
  vec2 radial = normalize(fromBrain+vec2(0.0001));
  vec2 tangent = vec2(-radial.y,radial.x);
  float signal = max(iPulse,pow(1.0-iBeat,3.0));
  float travel = smoothstep(0.13,0.95,dist)*(0.018+0.050*signal+0.018*iEnergy);
  float wave = iBeat*6.2831853-dist*8.0+phase+hash(cid)*0.5
             +sin(iTime*(0.35+iBpm*0.30)+hash(cid)*6.2831853)*0.18;
  vec2 motion = radial*sin(wave)*travel+tangent*cos(wave)*travel*0.42;
  float brain = exp(-pow(dist/0.46,2.0));
  float radius = (0.12+0.26*brain)*(0.72+0.28*tone);
  return 1.0-smoothstep(radius-0.075,radius,length(cell-motion));
}
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float pd = length(p-m), signal = max(iPulse,pow(1.0-iBeat,3.0));
  float freq = 18.0+6.0*iWarp;
  float tone = 0.64+0.22*iIntensity;
  float loosen = (0.006+0.018*iDance)*(1.0-signal);
  float dC = cmykPlate(p+vec2( loosen,0.0),m,0.2618,0.0,tone,freq);
  float dM = cmykPlate(p+vec2(-loosen,loosen),m,1.3090,1.57,tone,freq);
  float dY = cmykPlate(p+vec2(0.0,-loosen),m,0.0,3.14,tone,freq);
  float dK = cmykPlate(p,m,0.7854,4.71,tone*0.72,freq);
  float brain = exp(-pow(pd/0.46,2.0));
  float rosette = dC*dM+dM*dY+dY*dC;
  vec3 paper = mix(vec3(0.025,0.035,0.055),vec3(0.045,0.065,0.085),uv.y);
  vec3 col = paper;
  col += vec3(0.02,0.86,1.00)*dC*(0.42+0.36*iBass);
  col += vec3(1.00,0.05,0.58)*dM*(0.42+0.36*iVocal);
  col += vec3(1.00,0.86,0.05)*dY*(0.42+0.36*iTreble);
  col = mix(col,vec3(0.012,0.014,0.020),dK*0.52);
  col += vec3(0.92,1.00,0.95)*rosette*(0.12+0.30*brain+0.25*signal);
  float ring = exp(-pow((pd-(1.0-iClick)*0.8)*9.0,2.0))*iClick;
  col += vec3(0.65,0.98,1.00)*ring*0.7;
  col = hueShift(col,iHue*0.16);
  col += iGrain*0.035*grain(gl_FragCoord.xy,iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  riso: `
float risoScreen(vec2 pp, vec2 brainP, float ang, float phase, float freq){
  mat2 R = mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
  vec2 q=R*pp*freq, bq=R*brainP*freq;
  vec2 cell=fract(q)-0.5, from=(floor(q)+0.5)-bq;
  float dist=length(from)/freq, signal=max(iPulse,pow(1.0-iBeat,3.0));
  vec2 radial=normalize(from+vec2(0.0001)), tangent=vec2(-radial.y,radial.x);
  float wave=iBeat*6.2831853-dist*7.0+phase+hash(floor(q))*0.7
            +sin(iTime*(0.32+iBpm*0.28)+hash(floor(q))*6.2831853)*0.20;
  float travel=smoothstep(0.14,0.90,dist)*(0.022+0.060*signal);
  vec2 motion=radial*sin(wave)*travel+tangent*cos(wave)*travel*0.55;
  float brain=exp(-pow(dist/0.48,2.0));
  float radius=(0.13+0.27*brain)*(0.76+0.24*iIntensity);
  return 1.0-smoothstep(radius-0.10,radius,length(cell-motion));
}
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float signal=max(iPulse,pow(1.0-iBeat,3.0)), pd=length(p-m);
  float freq=19.0+6.0*iWarp;
  float slip=(0.012+0.025*iDance)*(1.0-signal);
  float d1=risoScreen(p+vec2(slip,0.35*slip),m,0.2618,0.0,freq);
  float d2=risoScreen(p-vec2(slip,0.35*slip),m,1.3090,3.14159,freq);
  float overprint = d1*d2;
  vec3 bg = mix(vec3(0.11,0.03,0.03), vec3(0.06,0.01,0.02), uv.x);
  bg = mix(bg, vec3(0.03,0.01,0.01), smoothstep(0.25, 1.5, length(p)));
  vec3 inkA = mix(vec3(1.00,0.18,0.16), vec3(1.00,0.46,0.12), uv.y);
  vec3 inkB = mix(vec3(0.82,0.05,0.20), vec3(1.00,0.30,0.42), uv.x);
  vec3 col = bg;
  col += inkA*d1*(0.70+0.28*iEnergy);
  col += inkB*d2*(0.70+0.28*iVocal);
  col += vec3(1.00,0.66,0.18)*overprint*(0.18+0.40*signal);
  float ring=exp(-pow((pd-(1.0-iClick)*0.8)*9.0,2.0))*iClick;
  col += vec3(1.00,0.84,0.48)*ring*0.72;
  col = hueShift(col,iHue*0.12);
  col += (hash(gl_FragCoord.xy*0.8+iTime)-0.5)*(0.05+0.05*iGrain);
  gl_FragColor = vec4(col, 1.0);
}
`,
  newsprint: `
float jarvis(vec2 q){
  /* arc-reactor target field — smooth wells the dot-mass migrates into, so it is the
     DENSITY of dots (not their size) that draws jarvis: core, coil ring, two rings, ticks.
     widths are kept gentle so the gather flow never folds the lattice. */
  float rr = length(q);
  float aa = atan(q.y, q.x);
  float F = 0.0;
  F += exp(-rr*rr*7.0) * 1.15;                                                          // core
  F += exp(-pow((rr-0.42)/0.12,2.0)) * (0.55 + 0.45*smoothstep(-0.12,0.12,sin(aa*9.0))); // coil ring (9 blocks)
  F += exp(-pow((rr-0.58)/0.085,2.0)) * 0.85;                                            // inner ring
  F += exp(-pow((rr-0.72)/0.080,2.0)) * 0.70;                                            // outer ring
  F += exp(-pow((rr-0.82)/0.090,2.0)) * smoothstep(0.45,1.0,abs(sin(aa*18.0))) * 0.75;   // tick band (36)
  return F;
}
vec2 jarvisGrad(vec2 q){
  float e = 0.02;
  return vec2(jarvis(q+vec2(e,0.0)) - jarvis(q-vec2(e,0.0)),
              jarvis(q+vec2(0.0,e)) - jarvis(q-vec2(0.0,e))) / (2.0*e);
}
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float signal = max(iPulse, pow(1.0-iBeat,3.0));

  /* dot-mass migration: every dot drifts up the field gradient, so the dots pile
     onto jarvis's structures and thin out between them — the DENSITY draws the
     design. strength is QUADRATIC in the music (drive*drive), so the dots accelerate
     into formation as it gets louder and roam freely besides. gather gain is sized
     against the well widths so the lattice Jacobian stays positive (no folding). */
  float drive  = clamp(0.18 + 1.0*iEnergy + 0.7*iPulse, 0.0, 1.7);
  float gather = drive*drive * 0.0022;
  vec2  flow   = jarvisGrad(p) * gather;
  flow += 0.020 * vec2(sin(iTime*0.9 + p.y*3.7), cos(iTime*0.8 + p.x*3.3)) * drive;   // free wander
  flow  = clamp(flow, -0.15, 0.15);                          // safety net against folding
  vec2  ps = p - flow;                                       // warped sample position

  /* uniform-ink halftone: dot SIZE is constant, so the picture is pure dot DENSITY */
  float freq = 22.0 + iWarp*6.0;
  float c=cos(0.7854), s=sin(0.7854);
  vec2 cell = fract(mat2(c,-s,s,c)*ps*freq) - 0.5;
  float r = sqrt(0.5)*0.62;
  float dots = smoothstep(r, r-0.12, length(cell));

  float F = jarvis(ps);
  vec3 abyss = vec3(0.002,0.010,0.020);
  vec3 cyan  = vec3(0.04,0.76,1.00);
  vec3 hot   = vec3(0.86,0.99,1.00);
  vec3 dotCol = mix(cyan, hot, smoothstep(0.60,0.0,length(ps)));
  vec3 col = abyss + vec3(0.004,0.025,0.045)*fbm(p*2.0);
  col += dotCol * dots * (0.45 + 0.70*F + 0.50*signal*F);
  col += hot * dots * smoothstep(0.18,0.0,length(p)) * (0.30 + 0.70*signal);  // core flares on the beat
  float command = exp(-pow((length(p)-(1.0-iClick)*0.85)*10.0,2.0))*iClick;
  col += vec3(1.00,0.48,0.12)*command*0.70;
  col = hueShift(col, iHue*0.12);
  col *= 0.72 + 0.28*(1.0-smoothstep(0.25,1.70,length(p)));
  col += iGrain*0.025*grain(gl_FragCoord.xy, iTime);
  gl_FragColor = vec4(col, 1.0);
}
`,
  benday: `
float scr(vec2 pp, float ang, float tone, float freq, float flow){
  mat2 R = mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
  vec2 q = R*pp*freq;
  vec2 base = floor(q);
  float r = sqrt(clamp(tone,0.0,1.0))*0.58;
  float beatT = iBeat*6.2831853;
  /* dots ringing the central dump get more orbital freedom; the dense core stays
     anchored (same core profile as the mass dump). */
  float coreS = exp(-dot(pp,pp)*2.2);
  float freedom = flow * mix(0.30, 1.8, 1.0 - coreS);
  float cover = 0.0;
  for(int j=-1;j<=1;j++){
    for(int i=-1;i<=1;i++){
      vec2 cid = base + vec2(float(i), float(j));
      float ph = hash(cid)*6.2831853;
      float amp = freedom * (0.12 + 0.18*iPulse + 0.12*iEnergy);
      vec2 drift = vec2(sin(iTime*(0.6+iBpm*0.8)+ph), cos(iTime*(0.5+iBpm*0.7)+ph*1.3))*amp;
      drift += vec2(cos(beatT+ph), sin(beatT-ph)) * freedom*0.12 * pow(1.0-iBeat,3.0);
      float d = length(q - (cid + 0.5 + drift));
      cover = max(cover, smoothstep(r, r-0.10, d));
    }
  }
  return cover;
}
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.06;
  float pd = length(p-m);
  float region = fbm(p*1.2 + t) + (0.14 + 0.18*iDance)*exp(-pd*1.6);   // danceable tracks shove the colour regions harder
  float freq = 20.0 + iWarp*6.0;
  /* dot-mass conservation: the field keeps an even spread of ink, and any surplus
     pulled from it is dumped into a dense core at the centre — so mass gathers to
     the middle on beats and re-spreads evenly between them. core gain ~ balances
     the mass removed across the field, so total ink stays roughly fixed. */
  float r = length(p);
  float gather = clamp(0.30 + 0.55*iPulse + 0.45*pow(1.0-iBeat,3.0), 0.0, 1.0);
  float core = exp(-r*r*2.2);
  float densMul = clamp((1.0 - 0.7*gather) + 3.0*gather*core, 0.04, 2.5);
  float flow = 0.60 + 0.30*iDance;   // pop-art panels stay flatter / more orderly
  float dots = scr(p, 0.7854, (0.55 + 0.08*iPulse)*densMul, freq, flow);
  vec3 paper  = vec3(0.96, 0.93, 0.83);
  vec3 red    = vec3(0.88, 0.17, 0.18);
  vec3 yellow = vec3(1.00, 0.81, 0.16);
  vec3 ink    = vec3(0.06, 0.05, 0.08);
  vec3 col = paper;
  if(region < 0.42){ col = yellow; }
  else if(region < 0.60){ col = mix(yellow, red, dots); }
  else if(region < 0.74){ col = red; }
  else { col = mix(paper, red, dots); }
  float ol = 0.0;
  ol = max(ol, smoothstep(0.018, 0.0, abs(region-0.42)));
  ol = max(ol, smoothstep(0.018, 0.0, abs(region-0.60)));
  ol = max(ol, smoothstep(0.016, 0.0, abs(region-0.74)));
  col = mix(col, ink, ol);
  col += iGrain * 0.02 * grain(gl_FragCoord.xy, iTime);
  col *= 0.95 + 0.05*smoothstep(1.7, 0.3, length(p));
  gl_FragColor = vec4(col, 1.0);
}
`,
  linescreen: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.08;
  float pd = length(p-m);
  vec2 q = p;
  q += (m-p)*0.05*iWarp;
  float warp = fbm(q*1.1 + t)*0.6 + fbm(q*2.3 - t*0.5)*0.3;
  float tone = 0.5 + 0.4*fbm(q*0.9 - t*0.4) - 0.18*length(p);
  tone += exp(-pd*1.6)*(0.18*iPulse + 0.16*pow(1.0-iBeat, 3.0));   // beats deepen the engraved cut
  tone *= (0.65 + 0.45*iIntensity);
  tone = clamp(tone, 0.0, 1.0);
  float freq = 58.0 + iWarp*22.0 + iInstrum*18.0;   // instrumental tracks engrave a finer screen
  float v = 0.5 + 0.5*sin((p.y + warp*0.7)*freq);
  float ink = smoothstep(tone+0.05, tone-0.05, v);
  vec3 paper = vec3(0.93, 0.91, 0.85);
  vec3 line  = vec3(0.09, 0.11, 0.18);
  vec3 col = mix(paper, line, ink);
  col = mix(col, col*vec3(0.92,0.96,1.05), 0.4*iEnergy);
  col += iGrain * 0.025 * grain(gl_FragCoord.xy, iTime);
  col *= 0.94 + 0.06*smoothstep(1.7, 0.3, length(p));
  gl_FragColor = vec4(col, 1.0);
}
`,
  codex: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y,1.0);
  float downbeat = pow(1.0-iBeat,3.0);
  float tempoN = clamp(iTempo/180.0,0.0,1.0);
  float drive = clamp(0.24*iEnergy+0.18*iRms+0.14*iTrackEnergy+0.12*iPeak+0.12*iLoud+0.20*iIntensity,0.0,1.0);
  float t = iTime*(0.07+0.05*tempoN+0.04*iDance);
  float rot = t*(0.34+0.20*iBpm) + iPulse*0.18 + downbeat*0.10
            + m.x*0.38*iWarp + iProgress*0.7854;
  float ca=cos(rot), sa=sin(rot);
  vec2 q = mat2(ca,-sa,sa,ca)*(p-m*0.08*iWarp);
  float r = length(q);
  float a = atan(q.y,q.x);
  float k = 0.0;
  for(int i=0;i<3;i++){
    float off = float(i)*1.04719755;
    float lobe = 0.48 + (0.13+0.05*iLowMid)*cos(6.0*(a+off)+iInstrum*0.18*sin(a*3.0));
    lobe += 0.028*iBass*sin(a*3.0+iBeat*6.2831853+off);
    float w = 0.036 + 0.018*iMid + 0.010*iVocal
            + 0.007*sin(t*(2.0+iBpm)+float(i));
    k = max(k, smoothstep(w, w*0.25, abs(r-lobe)));
  }
  k *= smoothstep(0.06, 0.14, r) * smoothstep(0.98, 0.62, r);
  float node = smoothstep(0.09+0.025*iSub,0.025,r);
  float presence = clamp(0.5*iHighMid+0.3*iTreble+0.2*iCentroid,0.0,1.0);
  float threadGlint = pow(k,3.0)*(0.20+0.45*presence+0.40*iFlux);
  float clickRing = exp(-pow((length(p-m)-(1.0-iClick)*0.72)*10.0,2.0))*iClick;
  vec3 bg = vec3(0.030,0.030,0.036)
          + vec3(0.012+0.025*iAcoustic)*fbm(p*(1.7+0.8*iInstrum)+t*0.2);
  bg += iAccent*(0.010+0.018*iLive)*fbm(p*0.9-t*0.13);
  vec3 ink = mix(vec3(0.50,0.50,0.54),vec3(1.0,0.99,0.96),0.30+0.58*drive);
  vec3 accentInk = mix(ink,iAccent,0.06+0.10*iValence);
  vec3 col = bg + ink*(k+node)*(0.48+0.46*drive);
  col += accentInk*threadGlint;
  col += ink*node*(0.20*iVocal+0.16*iSpeech+0.25*iSub);
  col += accentInk*(k+node)*(0.15*iPulse+0.12*downbeat);
  col += accentInk*clickRing*0.55;
  col = hueShift(col,iHue*0.08);
  col *= mix(0.84,1.0,iPlaying);
  col *= 0.8+0.2*smoothstep(1.5,0.2,r);
  col += iGrain*0.03*grain(gl_FragCoord.xy, iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  qwen: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y,1.0);
  float downbeat = pow(1.0-iBeat,3.0);
  float tempoN = clamp(iTempo/180.0,0.0,1.0);
  float drive = clamp(0.20*iEnergy+0.16*iRms+0.14*iTrackEnergy+0.12*iLoud+0.10*iMid+0.08*iPeak+0.20*iIntensity,0.0,1.0);
  float t = iTime*(0.06+0.05*tempoN+0.035*iDance);
  vec3 night = mix(vec3(0.10,0.04,0.20),iAccent*0.16,0.22+0.16*iValence);
  vec3 col = mix(night,vec3(0.025,0.008,0.060),smoothstep(-0.1,1.3,length(p)));
  float acc = 0.0;
  for(int i=0;i<6;i++){
    float fi=float(i);
    float ang = fi/6.0*6.2831853 + t*(0.36+0.20*iBpm)
              + iPulse*0.16 + iProgress*0.38;
    float orbit = 0.24+0.055*iBass+0.045*iSub
                + 0.035*sin(t*(0.9+iBpm*0.35)+fi);
    vec2 c = vec2(cos(ang),sin(ang))*orbit;
    vec2 d = p-c+m*(0.10+0.10*iWarp);
    float cc=cos(ang), ss=sin(ang);
    vec2 qr = mat2(cc,ss,-ss,cc)*d;
    qr.x *= 2.0-0.22*iAcoustic+0.12*iInstrum;
    float petal = 0.13+0.055*iLowMid+0.040*iVocal
                + 0.025*sin(t+fi)+0.018*downbeat;
    acc += exp(-dot(qr,qr)/petal);
  }
  float core = exp(-dot(p-m*0.04*iWarp,p-m*0.04*iWarp)/(0.045+0.025*iSpeech));
  float halo = exp(-dot(p,p)/(0.30+0.18*iLive));
  float air = clamp(0.45*iTreble+0.35*iHighMid+0.20*iCentroid,0.0,1.0);
  vec3 violet = mix(vec3(0.40,0.18,0.80),vec3(0.74,0.40,0.98),0.32+0.58*drive);
  violet = mix(violet,iAccent,0.10+0.12*iValence);
  vec3 magenta= hueShift(vec3(0.95,0.42,0.92),iHue*0.34);
  col += violet*acc*(0.38+0.28*drive);
  col += magenta*pow(acc,2.0)*(0.12+0.15*iVocal);
  col += vec3(1.0,0.92,1.0)*core*(0.38+0.42*drive+0.22*iSpeech);
  col += violet*core*(0.22*iPulse+0.18*downbeat+0.24*iSub);
  col += mix(violet,vec3(1.0),air)*halo*(0.05+0.14*iLive+0.12*iFlux);
  float clickRing=exp(-pow((length(p-m)-(1.0-iClick)*0.82)*9.0,2.0))*iClick;
  col += magenta*clickRing*0.60;
  col = hueShift(col,iHue*0.22);
  col *= mix(0.84,1.0,iPlaying);
  col *= 0.82+0.18*smoothstep(1.5,0.2,length(p));
  col += iGrain*0.035*grain(gl_FragCoord.xy, iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  grok: `
mat2 rotG(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y,1.0);
  float downbeat=pow(1.0-iBeat,3.0);
  float tempoN=clamp(iTempo/180.0,0.0,1.0);
  float drive=clamp(0.18*iEnergy+0.13*iRms+0.12*iTrackEnergy+0.09*iLoud
                   +0.10*iBass+0.09*iPeak+0.17*iIntensity,0.0,1.0);
  float t=iTime*(0.20+0.12*tempoN+0.08*iDance);

  /* The exported redesign: a central event horizon gravitationally lenses the
     starfield and turns the xAI slash into an edge-on accretion disk. */
  vec2 c=p-m*vec2(0.34,0.24)*iWarp;
  float r=max(length(c),1e-4);
  float rs=0.218+0.020*iSub+0.010*iBass+0.008*iPulse+0.005*downbeat;
  float defl=1.0+(rs*rs*(1.28+0.72*iLowMid))/(r*r);
  vec2 lp=c*defl;

  vec3 col=vec3(0.007,0.008,0.013);
  vec2 sg=floor((lp*0.5+0.5)*iResolution.xy*(0.50+0.28*iInstrum));
  float sh=hash(sg);
  float star=pow(sh,mix(112.0,58.0,iCentroid));
  float tw=0.54+0.46*sin(t*(2.0+2.6*iTreble)+sh*30.0+iBeat*6.2831853);
  float lensGain=1.0+(0.72+0.66*iMid)*smoothstep(rs*3.2,rs*1.08,r);
  vec3 starTint=mix(vec3(0.82,0.88,1.0),iAccent,0.08+0.12*iValence);
  col += starTint*star*(1.18+0.90*iHighMid+0.76*iFlux)*tw*lensGain;
  col += mix(vec3(0.025,0.030,0.055),iAccent*0.11,0.28)
       * fbm(lp*(1.15+0.65*iLive)+t*0.035)*(0.40+0.42*iLive+0.18*iAcoustic);

  float diskAngle=0.7854+(iValence-0.5)*0.18+iProgress*0.14;
  vec2 d=rotG(diskAngle)*c;
  float glitchDrive=clamp(0.36*iBass+0.28*iFlux+0.18*iPulse+0.12*iPeak,0.0,1.0);
  float goff=(step(0.5,fract(d.x*(12.0+7.0*iTreble)-t*(1.8+0.8*iBpm)))-0.5)
             *(0.014+0.058*glitchDrive)*(1.0-0.28*iSpeech);
  d.y += goff;
  vec2 e=vec2(d.x,d.y/(0.145+0.030*iAcoustic+0.018*iVocal));
  float re=length(e);
  float ang=atan(e.y,e.x);
  float swirl=fbm(vec2(ang*(1.5+0.45*iInstrum),re*(6.2+2.2*iHighMid)-t*(0.72+0.42*iBpm)));
  float streak=0.42+0.88*swirl;
  float band=smoothstep(rs*1.14,rs*(1.48+0.10*iBass),re)
            *(1.0-smoothstep(rs*(2.55+0.10*iLowMid),rs*(3.55+0.22*iEnergy),re));
  float dop=0.42+0.96*smoothstep(-1.0,1.0,-d.x/max(re,1e-3));
  vec3 diskC=mix(vec3(0.48,0.58,0.88),vec3(1.0,0.99,0.96),clamp(streak+0.22*iCentroid,0.0,1.0));
  diskC=mix(diskC,iAccent,0.07+0.11*iValence);
  col += diskC*band*streak*dop*(0.38+0.58*drive+0.16*iVocal);

  float slashD=abs(d.y);
  float beyond=smoothstep(rs*1.18,rs*2.38,abs(d.x));
  float seg=0.58+0.42*step(0.18+0.22*iSpeech,fract(d.x*(1.8+1.1*iDance)-t*(0.28+0.24*iBpm)));
  float fade=1.0-smoothstep(0.62,1.92,abs(d.x));
  vec3 slash=mix(vec3(1.0),iAccent,0.06+0.11*iValence);
  col += slash*smoothstep(0.010+0.006*iVocal,0.0,slashD)*beyond*seg*fade
       *(0.62+0.54*drive+0.18*iMid);
  col += mix(vec3(0.70,0.79,1.0),iAccent,0.12)
       * smoothstep(0.11+0.055*drive+0.035*iLowMid,0.0,slashD)*beyond*fade
       *(0.10+0.16*iEnergy+0.13*iLive);
  float chroma=(0.08+0.36*iHighMid+0.30*iFlux)*(0.38+0.62*iTreble);
  col.r += smoothstep(0.045,0.0,abs(slashD-0.026))*beyond*fade*chroma;
  col.b += smoothstep(0.045,0.0,abs(slashD+0.026))*beyond*fade*chroma;

  float pr=rs*1.10;
  float photon=smoothstep(0.018+0.006*iAcoustic,0.0,abs(r-pr));
  col += slash*photon*(0.70+0.54*drive+0.38*iPeak+0.28*iFlux);
  col += starTint*smoothstep(0.16+0.035*iLive,0.0,abs(r-pr))
       *(0.08+0.14*iEnergy+0.14*iVocal);
  col *= 1.0-smoothstep(rs*1.005,rs*0.982,r);

  float clickRing=exp(-pow((length(p-m)-(1.0-iClick)*0.95)*10.0,2.0))*iClick;
  col += starTint*clickRing*0.55;
  col = hueShift(col,iHue*0.10);
  col *= mix(0.84,1.0,iPlaying);
  col *= 0.85+0.15*smoothstep(1.6,0.2,length(p));
  col += iGrain*0.04*grain(gl_FragCoord.xy, iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  base44: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y,1.0);
  float downbeat=pow(1.0-iBeat,3.0);
  float tempoN=clamp(iTempo/180.0,0.0,1.0);
  float drive=clamp(0.18*iEnergy+0.14*iRms+0.14*iTrackEnergy+0.10*iLoud+0.10*iBass+0.08*iPeak+0.18*iIntensity,0.0,1.0);
  float t=iTime*(0.16+0.12*tempoN+0.08*iDance);
  vec3 darkAmber=mix(vec3(0.10,0.05,0.012),iAccent*0.12,0.18+0.18*iValence);
  vec3 col=mix(darkAmber,vec3(0.025,0.012,0.0),uv.y);
  float scale=3.8+1.1*iInstrum+0.7*iTreble;
  vec2 g=vec2(p.x*scale+p.y*scale*0.5,p.y*scale)+m*(0.28+0.28*iWarp);
  vec2 id = floor(g);
  vec2 f = fract(g)-0.5;
  float ph = hash(id);
  float sequence=id.x*0.5-id.y*0.4-t*(1.2+iBpm)+ph*6.28+iBeat*6.2831853;
  sequence += iProgress*6.2831853+downbeat*(1.2+1.4*iDance);
  float build=0.5+0.5*sin(sequence);
  build=smoothstep(0.30-0.12*iSub,0.82-0.12*iBass,build);
  float mx = max(abs(f.x),abs(f.y));
  float edgeSoft=0.035+0.028*iAcoustic;
  float box=smoothstep(0.47,0.47-edgeSoft,mx);
  float top=smoothstep(0.0,0.5,-f.y)*(0.34+0.30*iMid+0.18*iLowMid);
  vec3 amber=mix(vec3(0.55,0.26,0.04),vec3(1.0,0.66,0.18),build);
  amber=mix(amber,iAccent,0.08+0.14*iValence);
  float lit = box*build;
  col += amber*lit*(0.40+0.64*drive);
  col += mix(vec3(1.0,0.8,0.4),iAccent,0.10)*lit*top*(0.34+0.26*iVocal);
  float edge = box*smoothstep(0.40,0.47, mx);
  col += vec3(1.0,0.55,0.1)*edge*build*(0.22+0.38*iHighMid+0.30*iTreble);
  float packet=step(0.82,fract(ph+iBeat*2.0+iProgress*4.0))*lit;
  col += vec3(1.0,0.92,0.64)*packet*(0.14+0.44*iFlux+0.24*iCentroid);
  float foundation=smoothstep(-0.45,-0.05,p.y)*iSub*(0.18+0.20*iSpeech);
  col += amber*foundation;
  col += amber*fbm(p*1.3-t*0.08)*iLive*0.07;
  float clickWave=exp(-pow((abs(p.x-m.x)+abs(p.y-m.y)-(1.0-iClick)*1.45)*8.0,2.0))*iClick;
  col += vec3(1.0,0.78,0.30)*clickWave*0.66;
  col = hueShift(col,iHue*0.16);
  col *= mix(0.84,1.0,iPlaying);
  col *= 0.85+0.15*smoothstep(1.7,0.2,length(p));
  col += iGrain*0.035*grain(gl_FragCoord.xy, iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  replit: `
float sdSegR(vec2 pt,vec2 a,vec2 b,float rad){
  vec2 pa=pt-a,ba=b-a;
  float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0);
  return length(pa-ba*h)-rad;
}
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m=iMouse-0.5;
  float asp=iResolution.x/iResolution.y;
  float t=iTime;
  float downbeat=pow(1.0-iBeat,3.0);
  float drive=clamp(0.17*iEnergy+0.13*iRms+0.12*iTrackEnergy+0.10*iLoud+0.10*iMid+0.08*iPeak+0.05*iSpeech+0.15*iIntensity,0.0,1.0);
  float aa=(1.45+0.55*iAcoustic)/iResolution.y;
  float tempoHz=iTempo>0.0 ? iTempo/60.0 : iBpm;

  vec3 slate=mix(vec3(0.078,0.088,0.108),iAccent*0.12,0.12+0.16*iValence);
  vec3 col=mix(slate,vec3(0.026,0.031,0.045),length(p)*0.62);
  col += mix(vec3(0.055,0.028,0.012),iAccent*0.08,0.24)
       * fbm(p*(1.35+0.35*iLive)+t*0.04)*(0.18+0.18*iLive);

  vec3 coral=vec3(0.95,0.38,0.03);
  vec3 amber=vec3(1.0,0.64,0.26);
  vec3 dim=vec3(0.52,0.34,0.34);
  coral=mix(coral,iAccent,0.10+0.14*iValence);
  amber=hueShift(amber,iHue*0.20);

  const float ROWS=14.0;
  float rh=1.0/ROWS;
  float scroll=t*(0.12+0.12*tempoHz+0.10*iDance)+iProgress*ROWS*0.42+m.y*1.35*iWarp;
  float lead=scroll+ROWS-1.5;
  vec2 q=vec2(uv.x*asp,uv.y);
  float base=floor(uv.y/rh+scroll);
  vec3 ink=vec3(0.0);
  float bloom=0.0;
  float curGlow=0.0;

  for(int k=-1;k<=1;k++){
    float row=base+float(k);
    float cy=(row-scroll+0.5)*rh;
    float s1=hash(vec2(row,3.0));
    float s2=hash(vec2(row,9.0));
    float indent=floor(s1*3.0)*0.055;
    float full=0.20+s2*(0.44+0.10*iLowMid);
    float prog=clamp((lead-row)*(1.45+0.38*iBpm+0.30*iHighMid),0.0,1.0);
    if(prog<=0.0) continue;
    float x0=0.11+indent;
    float x1=x0+full*prog;
    float th=rh*(0.17+0.065*iRms+0.045*iAcoustic);
    float d=sdSegR(q,vec2(x0*asp,cy),vec2(x1*asp,cy),th);

    float tokenFreq=14.0+5.0*iTreble+3.0*iInstrum;
    float tf=fract(uv.x*tokenFreq+s1*7.0);
    float gap=smoothstep(0.0,0.09,tf)*smoothstep(1.0,0.91,tf);
    float tok=hash(vec2(row,floor(uv.x*tokenFreq+s1*7.0)));
    vec3 tc=tok<0.34 ? coral : (tok<0.68 ? amber : dim);
    float shimmer=0.82+(0.10+0.14*iCentroid)*sin(t*(1.8+1.4*iHighMid)+tok*18.0+row);
    float body=smoothstep(aa,-aa,d)*gap;
    float activeRow=1.0-step(0.5,abs(row-floor(scroll+ROWS-1.5)));
    ink += tc*body*shimmer*(0.34+0.42*drive+0.18*iVocal+0.14*activeRow*iMid);
    bloom += exp(-max(d,0.0)*(58.0+18.0*iTreble))*gap*(0.16+0.18*iLive+0.12*iBass);

    float active=step(prog,0.999)*step(0.001,prog);
    float blink=0.38+0.62*smoothstep(0.30,0.66,fract(t*(0.9+0.55*tempoHz)+iBeat));
    float caretRadius=rh*(0.07+0.065*iHighMid+0.045*iFlux);
    float cd=sdSegR(q,vec2(x1*asp,cy-rh*0.17),vec2(x1*asp,cy+rh*0.17),caretRadius);
    float caret=smoothstep(aa,-aa,cd)*active*mix(blink,1.0,0.30*active);
    ink += mix(vec3(1.0,0.78,0.52),iAccent,0.10)*caret
         *(0.66+0.40*iPulse+0.30*downbeat+0.38*iFlux+0.18*iSpeech);
    curGlow += exp(-max(cd,0.0)*42.0)*active;
  }

  col += ink;
  col += coral*bloom*(0.18+0.22*drive+0.14*iSub);
  col += mix(vec3(1.0,0.66,0.35),iAccent,0.10)*curGlow
       *(0.10+0.18*iPulse+0.14*iFlux);
  float sweep=exp(-pow((uv.y-fract(t*(0.07+0.04*iBpm)+iProgress))*6.0,2.0));
  col += amber*sweep*(0.010+0.030*iCentroid+0.025*iLive);
  float clickRing=exp(-pow((length(p-m*vec2(asp,1.0))-(1.0-iClick)*0.88)*10.0,2.0))*iClick;
  col += amber*clickRing*0.56;
  col = hueShift(col,iHue*0.12);
  col *= mix(0.84,1.0,iPlaying);
  col *= 0.9+0.1*smoothstep(1.7,0.3,length(p));
  col += iGrain*0.022*grain(gl_FragCoord.xy,iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  // Procedural adaptations of the supplied Tame Impala texture shaders. The
  // originals sample album-cover textures and an iAudio[256] FFT array; these
  // versions preserve their compositions while using Phase's live uniforms so
  // they work offline and in every gallery tile without copyrighted bitmaps.
  innerspeaker: `
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution.xy;
  vec2 p=uv*2.0-1.0;
  p.x*=iResolution.x/iResolution.y;
  vec2 m=(iMouse-0.5)*vec2(iResolution.x/iResolution.y,1.0);
  float t=iTime*(0.16+0.10*iBpm);
  float downbeat=pow(1.0-iBeat,3.0);

  float horizon=-0.18+0.055*sin(p.x*2.1+t*0.35)+0.035*sin(p.x*5.7-t*0.22);
  vec3 sky=mix(vec3(0.44,0.59,0.43),vec3(0.58,0.48,0.73),smoothstep(-0.2,1.0,p.y));
  sky+=vec3(0.20,0.16,0.34)*(0.10+0.34*iTreble+0.20*iCentroid)*smoothstep(0.08,0.82,uv.y);
  vec3 col=sky;

  float valley=smoothstep(horizon+0.035,horizon-0.025,p.y);
  float landNoise=fbm(vec2(p.x*2.2+t*0.08,p.y*3.1));
  col=mix(col,mix(vec3(0.15,0.30,0.14),vec3(0.48,0.61,0.25),landNoise),valley);

  // Mirrored, repeating tree columns recreate the cover's recursive woodland.
  float bend=sin(p.y*8.0+t*2.0)*(.018+.055*iBass+.028*iMid);
  float scale=7.0+2.0*iWarp;
  vec2 forest=vec2((p.x+bend+m.x*.04*iWarp)*scale,p.y);
  vec2 cell=vec2(fract(forest.x)-0.5,forest.y);
  float treeId=floor(forest.x);
  float seed=hash(vec2(treeId,4.7));
  float trunkWidth=0.035+0.055*seed+0.025*iBass;
  float trunk=smoothstep(trunkWidth,trunkWidth-0.018,abs(cell.x))
             *smoothstep(-0.72,-0.46+0.20*seed,cell.y);
  float crownY=-0.12+0.34*seed;
  float crown=0.0;
  for(int k=0;k<4;k++){
    float fk=float(k);
    vec2 branch=cell-vec2(sin(seed*19.0+fk*2.4)*0.10,crownY+fk*0.105);
    crown=max(crown,smoothstep(0.20-fk*.018,0.13-fk*.016,length(branch)));
  }
  float echo=0.5+0.5*sin(abs(p.x)*16.0-p.y*7.0+t*1.1+iPulse*2.0);
  vec3 bark=mix(vec3(0.10,0.17,0.08),vec3(0.29,0.36,0.14),seed);
  vec3 leaf=mix(vec3(0.20,0.40,0.15),vec3(0.62,0.73,0.30),echo);
  leaf=mix(leaf,iAccent,0.08+0.12*iValence);
  col=mix(col,bark,trunk*.88);
  col=mix(col,leaf,crown*(.62+.22*iEnergy));

  float fold=exp(-abs(abs(p.x)-(0.22+0.12*sin(p.y*5.0+t)))*18.0);
  col+=vec3(0.62,0.76,0.34)*fold*(0.04+0.13*iFlux+0.10*downbeat);
  float sun=exp(-length(p-vec2(-.45,.38))*(4.0+2.0*iIntensity));
  col+=vec3(0.68,0.74,0.38)*sun*(.10+.16*iVocal);
  col=tameUniformFinish(col,p);
  col*=.86+.14*smoothstep(1.65,.25,length(p));
  col+=iGrain*.032*grain(gl_FragCoord.xy,iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  'redroom-sand': `
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution.xy;
  vec2 p=uv*2.0-1.0;
  p.x*=iResolution.x/iResolution.y;
  vec2 m=(iMouse-0.5)*vec2(iResolution.x/iResolution.y,1.0);
  float t=iTime*(0.12+0.08*iBpm);
  float downbeat=pow(1.0-iBeat,3.0);
  vec3 col=mix(vec3(0.055,0.008,0.008),vec3(0.24,0.025,0.018),uv.y);

  // Far doorway/window: the bright architectural anchor in the red room.
  vec2 doorP=p-vec2(.40,.16);
  float door=max(abs(doorP.x)-.19,abs(doorP.y)-.47);
  float doorway=smoothstep(.025,-.015,door);
  float doorEdge=exp(-abs(door)*45.0);
  vec3 doorLight=mix(vec3(.98,.23,.06),vec3(1.0,.72,.30),uv.y+.25*iTreble);
  col=mix(col,doorLight,doorway*(.34+.24*iBass+.16*iVocal));
  col+=vec3(1.0,.31,.07)*doorEdge*(.12+.30*iHighMid+.24*iFlux);

  // Five dune layers move at different depths, fed by bass and low mids.
  for(int k=0;k<5;k++){
    float fk=float(k);
    float depth=fk/4.0;
    float base=-.58+fk*.17;
    float wave=sin(p.x*(2.3+fk*.72)+t*(.32+fk*.08)+fk*2.1);
    wave+=.42*sin(p.x*(5.1+fk*.35)-t*.23+fk);
    float ridge=base+wave*(.055+.035*iBass)+m.x*.025*iWarp;
    float fill=smoothstep(ridge+.025,ridge-.018,p.y);
    float lip=exp(-abs(p.y-ridge)*(48.0-4.0*fk));
    vec3 dune=mix(vec3(.20,.025,.012),vec3(.72,.14,.045),depth);
    dune=mix(dune,vec3(.96,.33,.09),.18*iEnergy+.12*iValence);
    col=mix(col,dune,fill*(.48+.09*fk));
    col+=vec3(1.0,.39,.10)*lip*(.035+.055*fk+.12*iMid+.08*downbeat);
  }

  float heat=sin(p.y*29.0+t*8.0+p.x*3.0)*(.006+.018*iTreble);
  col.rb+=vec2(heat,-heat*.35)*smoothstep(-.2,.9,p.x);
  float clickRing=exp(-pow((length(p-m)-(1.0-iClick)*.85)*10.0,2.0))*iClick;
  col+=vec3(1.0,.42,.10)*clickRing*.58;
  col=tameUniformFinish(col,p);
  col*=.82+.18*smoothstep(1.7,.28,length(p));
  col*=.92+.08*sin(t*.55)+.10*iPulse;
  col+=iGrain*.030*grain(gl_FragCoord.xy,iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  'currents-sphere': `
mat2 rotCurrent(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution.xy;
  vec2 p=uv*2.0-1.0;
  p.x*=iResolution.x/iResolution.y;
  vec2 m=(iMouse-0.5)*vec2(iResolution.x/iResolution.y,1.0);
  float t=iTime*(.18+.10*iBpm);
  float downbeat=pow(1.0-iBeat,3.0);
  float radius=.47+.035*iBass+.025*downbeat;
  float r=length(p);
  float sphere=smoothstep(radius+.012,radius-.012,r);
  vec3 col=mix(vec3(.018,.026,.070),vec3(.08,.19,.30),uv.y);

  // Current lines in the surrounding field bend around the sphere's gravity.
  float grav=radius*radius/max(dot(p,p),.025);
  vec2 field=p+normalize(p+vec2(.0001))*grav*(.045+.08*iWarp);
  field=rotCurrent(.18*sin(t*.33)+m.x*.18*iWarp)*field;
  float bands=abs(sin(field.y*(24.0+8.0*iMid)+sin(field.x*5.0-t)*2.2+t*2.5));
  float line=smoothstep(.88,.995,bands);
  col+=mix(vec3(.10,.46,.66),vec3(.82,.25,.35),uv.x+.18*iValence)*line*(.20+.26*iTreble);

  // Map the visible disk to a warped liquid surface.
  float z=sqrt(max(radius*radius-r*r,0.0));
  vec3 n=normalize(vec3(p,z));
  float longitude=atan(n.y,n.x);
  float latitude=atan(n.z,length(n.xy));
  float swirl=longitude*5.0+latitude*12.0+t*2.2+sin(longitude*3.0-t)*2.0*iWarp;
  float liquid=.5+.5*sin(swirl+iBass*8.0);
  float thin=smoothstep(.70,.98,abs(sin(swirl*1.65+n.y*9.0)));
  vec3 cool=mix(vec3(.045,.12,.24),vec3(.24,.72,.82),liquid);
  vec3 warm=mix(vec3(.78,.18,.27),vec3(.98,.55,.44),liquid);
  vec3 orb=mix(cool,warm,smoothstep(-.25,.62,n.x+.30*sin(t*.4))*(.35+.45*iEnergy));
  float spec=pow(max(dot(n,normalize(vec3(-.45,.65,.8))),0.0),22.0-8.0*iAcoustic);
  orb+=vec3(.72,.92,1.0)*spec*(.45+.55*iCentroid);
  orb+=vec3(.8,.9,1.0)*thin*(.05+.14*iHighMid+.12*iFlux);
  col=mix(col,orb,sphere);
  float rim=exp(-abs(r-radius)*55.0);
  col+=mix(vec3(.28,.82,1.0),vec3(1.0,.32,.42),.35+.35*iValence)*rim*(.22+.28*iPulse);
  col+=vec3(.22,.56,.88)*exp(-r*3.4)*(.025+.10*iSub);
  float clickRing=exp(-pow((length(p-m)-(1.0-iClick)*.8)*11.0,2.0))*iClick;
  col+=vec3(.45,.86,1.0)*clickRing*.54;
  col=tameUniformFinish(col,p);
  col*=.86+.14*smoothstep(1.7,.22,r);
  col+=iGrain*.026*grain(gl_FragCoord.xy,iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
  'tame-triptych': `
vec3 tripInner(vec2 q,float t){
  vec3 sky=mix(vec3(.32,.50,.31),vec3(.57,.43,.70),q.y);
  float hill=smoothstep(.42+.05*sin(q.x*8.0+t),.39,q.y);
  vec3 col=mix(sky,vec3(.18,.37,.13),hill);
  float x=fract((q.x+sin(q.y*13.0+t)*(.008+.025*iBass))*9.0)-.5;
  float trunk=smoothstep(.065+.03*iBass,.035,abs(x))*smoothstep(.78,.24,q.y);
  float crowns=0.0;
  for(int k=0;k<3;k++){
    float fk=float(k);
    crowns=max(crowns,smoothstep(.17,.10,length(vec2(x,q.y-(.35+fk*.12)))));
  }
  col=mix(col,vec3(.08,.16,.05),trunk*.9);
  col=mix(col,vec3(.43,.66,.20)+vec3(.15,.08,.22)*iTreble,crowns*.72);
  return col;
}
vec3 tripSand(vec2 q,float t){
  vec3 col=mix(vec3(.09,.008,.006),vec3(.40,.035,.018),q.y);
  vec2 d=q-vec2(.68,.60);
  float box=max(abs(d.x)-.14,abs(d.y)-.30);
  col=mix(col,vec3(1.0,.40,.10),smoothstep(.015,-.015,box)*(.35+.28*iBass));
  for(int k=0;k<4;k++){
    float fk=float(k);
    float ridge=.14+fk*.14+sin(q.x*(7.0+fk)+t*(.35+fk*.1)+fk)*(.035+.035*iBass);
    float fill=smoothstep(ridge+.018,ridge-.012,q.y);
    col=mix(col,mix(vec3(.24,.025,.01),vec3(.80,.18,.045),fk/3.0),fill*.58);
    col+=vec3(1.0,.33,.06)*exp(-abs(q.y-ridge)*55.0)*(.025+.08*iMid);
  }
  return col;
}
vec3 tripCurrent(vec2 q,float t){
  vec2 p=(q-.5)*2.0;
  float r=length(p);
  float rad=.50+.035*iBass;
  float mask=smoothstep(rad+.015,rad-.015,r);
  vec3 col=mix(vec3(.025,.04,.11),vec3(.08,.24,.34),q.y);
  float lines=smoothstep(.88,.99,abs(sin(p.y*20.0+sin(p.x*5.0-t)*2.0+t*2.0)));
  col+=vec3(.16,.62,.82)*lines*(.13+.25*iTreble);
  float z=sqrt(max(rad*rad-r*r,0.0));
  vec3 n=normalize(vec3(p,z));
  float sw=atan(n.y,n.x)*5.0+atan(n.z,length(n.xy))*11.0+t*2.0;
  vec3 orb=mix(vec3(.06,.25,.48),vec3(.88,.22,.34),.5+.5*sin(sw+iBass*7.0));
  orb+=vec3(.7,.92,1.0)*pow(max(dot(n,normalize(vec3(-.4,.6,.8))),0.0),20.0)*(.4+.6*iCentroid);
  col=mix(col,orb,mask);
  col+=vec3(.35,.80,1.0)*exp(-abs(r-rad)*45.0)*(.16+.25*iPulse);
  return col;
}
void main(){
  vec2 uv=gl_FragCoord.xy/iResolution.xy;
  float panel=floor(uv.x*3.0);
  vec2 q=vec2(fract(uv.x*3.0),uv.y);
  float t=iTime*(.15+.09*iBpm);
  vec3 col;
  if(panel<1.0) col=tripInner(q,t);
  else if(panel<2.0) col=tripSand(q,t);
  else col=tripCurrent(q,t);
  float seam=min(fract(uv.x*3.0),1.0-fract(uv.x*3.0));
  col*=.62+.38*smoothstep(.0,.018,seam);
  float scan=.985+.015*sin(uv.y*iResolution.y*.45+t*4.0)*iHighMid;
  col*=scan*(.92+.08*iPulse);
  vec2 finishP=(uv-.5)*2.0;
  finishP.x*=iResolution.x/iResolution.y;
  col=tameUniformFinish(col,finishP);
  col*=.86+.14*smoothstep(.72,.12,length(uv-.5));
  col+=iGrain*.025*grain(gl_FragCoord.xy,iTime);
  gl_FragColor=vec4(col,1.0);
}
`,
};
