function clampUnit(value, fallback = 0) {
  const number = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, number));
}

export function getLyricMotion(uniforms = {}) {
  const beat = clampUnit(uniforms.uBeatPulse);
  const energy = clampUnit(uniforms.uAudioEnergy, 0.4);
  const bass = clampUnit(uniforms.uBassEnergy);
  const chaos = clampUnit(uniforms.uChaos);
  const warp = clampUnit(uniforms.uWarp, 0.5);
  const tension = clampUnit(uniforms.uTension);
  const brightness = clampUnit(uniforms.uBrightness, 0.7);
  const warmth = clampUnit(uniforms.uWarmth, 0.5);
  const density = clampUnit(uniforms.uDensity);
  return {
    chaos,
    scale: 1 + beat * 0.06 + bass * 0.04,
    letterSpacing: energy * 0.8 - tension * 1.2,
    rotate: (warp - 0.5) * 6,
    skewX: (warp - 0.5) * 4,
    hueRotate: (warmth - 0.5) * 60,
    filterBrightness: 0.85 + brightness * 0.3,
    blur: density * 0.6,
    jitterActive: chaos > 0.22,
  };
}

export function wordJitter(index, chaos) {
  const first = Math.sin(index * 12.9898) * 43758.5453;
  const second = Math.sin(index * 78.233) * 43758.5453;
  const horizontal = first - Math.floor(first);
  const vertical = second - Math.floor(second);
  return {
    x: (horizontal - 0.5) * chaos * 10,
    y: (vertical - 0.5) * chaos * 6,
    rotate: (horizontal - 0.5) * chaos * 8,
  };
}
