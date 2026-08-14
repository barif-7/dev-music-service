/**
 * LYRIC SHADER LAB — Color Identity
 *
 * Module: colorIdentity
 * Responsibility: Derives uColorA/uColorB from DerivedVisualFeatures + canonical features.
 * Keeps color logic separate from the uniform mapper.
 */

import { hexToNormalized } from "./shaderUniformMapper";

/**
 * Maps derived features + optional lyric analysis to color pair + hue/saturation.
 * Lyric-level analysis colors take priority when available.
 */
export function derivedVisualToColors(derived, canonical, lyricAnalysis) {
  if (lyricAnalysis?.colorA && lyricAnalysis?.colorB) {
    return {
      colorA:     hexToNormalized(lyricAnalysis.colorA),
      colorB:     hexToNormalized(lyricAnalysis.colorB),
      hue:        keyToHue(canonical.key, canonical.mode),
      saturation: Math.min(1, derived.brightness * 0.5 + derived.warmth * 0.3 + 0.2),
    };
  }

  const hue = keyToHue(canonical.key, canonical.mode);
  const saturation = Math.min(1, derived.motionIntensity * 0.4 + derived.warmth * 0.3 + 0.25);

  const [r1, g1, b1] = hslToRgb(hue, saturation * 0.6, derived.brightness * 0.2 + 0.05);
  const [r2, g2, b2] = hslToRgb((hue + 30 + derived.tension * 60) % 360, saturation, derived.brightness * 0.5 + 0.15);

  return {
    colorA: [r1, g1, b1],
    colorB: [r2, g2, b2],
    hue,
    saturation,
  };
}

function keyToHue(key, mode) {
  if (key == null || key < 0) return 220;
  const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const pos = circleOfFifths.indexOf(key);
  const base = (pos / 12) * 360;
  return mode === 0 ? (base + 20) % 360 : base;
}

function hslToRgb(h, s, l) {
  h = h % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [r + m, g + m, b + m];
}