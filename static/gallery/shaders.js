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
`;

const FRAGS = {
  drift: `
void main(){
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = uv*2.0-1.0; p.x *= iResolution.x/iResolution.y;
  vec2 m = (iMouse-0.5)*vec2(iResolution.x/iResolution.y, 1.0);
  float t = iTime*0.10;
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
  float t = iTime*0.05;
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
  float ang = 0.45 + iEnergy*0.25 + iTime*0.02;
  vec2 q = rot(ang) * p * (14.0 + iWarp*6.0);
  vec2 cell = fract(q) - 0.5;
  vec2 cid = floor(q);
  // radius modulated by distance to cursor + per-cell phase
  float ph = hash(cid);
  float pd = length(p - m);
  float base = 0.42 - smoothstep(0.0, 1.0, pd)*0.30;
  base *= 0.7 + 0.3*iIntensity;
  float beat = sin(iTime*2.2 + ph*6.28) * 0.05 * iPulse;
  float radius = base + beat;
  float d = length(cell);
  float dot = smoothstep(radius, radius-0.08, d);
  // background gradient
  vec3 bg1 = vec3(0.05, 0.05, 0.07);
  vec3 bg2 = vec3(0.10, 0.07, 0.06);
  vec3 bg  = mix(bg1, bg2, smoothstep(-1.0, 1.0, p.y));
  vec3 ink = vec3(0.95, 0.42, 0.30);   // warm red
  vec3 hot = vec3(1.00, 0.78, 0.55);
  vec3 col = bg;
  col = mix(col, ink, dot);
  // hot dot directly under cursor
  float underCursor = smoothstep(0.16, 0.0, length(cell + (fract(rot(ang)*m*(14.0+iWarp*6.0))-0.5) ));
  col = mix(col, hot, dot * exp(-pd*1.4));
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
  col += hi   * smoothstep(1.6, 2.6, c) * (0.7 + 0.5*iEnergy);
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
  col += magenta * s * 0.55 * iPulse;
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
  col += hot * smoothstep(0.70, 1.0, heat*plume*1.6) * (0.5+0.5*iEnergy);
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
  col = mix(col, veinC, vein*0.7);
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
  col = mix(col, thread, weave*(0.6+0.4*iIntensity));
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
  col += vec3(1.0) * exp(-r*4.0) * (0.5+0.5*iEnergy);
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
  float t = iTime*0.6;
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
};
