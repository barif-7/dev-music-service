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
`;

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
};
