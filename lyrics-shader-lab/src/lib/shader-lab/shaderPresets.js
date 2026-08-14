/**
 * LYRIC SHADER LAB — Shader Presets
 * 
 * Module: shaderPresets
 * Responsibility: Reusable visual presets mapped to moods.
 * Extraction: Copy into dev-music-service. Served by: GET /visuals/presets
 * 
 * ARCHITECTURE NOTE:
 * Each preset defines a rendering strategy for the Canvas2D shader.
 * In a real WebGL pipeline, these would map to fragment shader programs.
 * The "render" function receives (ctx, width, height, uniforms) and
 * paints one frame of the visual.
 */

export const shaderPresetCatalog = [
  {
    id: "aurora",
    name: "Aurora",
    description: "Balanced gradients and soft particle motion.",
    barScale: 1,
    renderMode: "aurora",
    gradientSpread: 0.3,
    particleCount: 40,
    particleBoost: 40,
    grainEnabled: false,
  },
  {
    id: "pulse",
    name: "Pulse",
    description: "Stronger beat emphasis and tighter energy response.",
    barScale: 1.15,
    renderMode: "pulse",
    gradientSpread: 0.2,
    particleCount: 32,
    particleBoost: 28,
    ringBoost: 1.4,
    grainEnabled: true,
  },
  {
    id: "warp",
    name: "Warp",
    description: "More chaotic motion with heavier visual contrast.",
    barScale: 0.9,
    renderMode: "warp",
    gradientSpread: 0.45,
    particleCount: 70,
    particleBoost: 50,
    ringBoost: 0.8,
    grainEnabled: true,
  },
];

export const runtimeShaderBlueprints = [
  {
    id: "aurora-night",
    name: "Aurora Night",
    description: "Deep gradients with low particle density and slow drift.",
    renderMode: "aurora",
    gradientSpread: 0.16,
    particleCount: 24,
    particleBoost: 22,
    grainEnabled: false,
    barScale: 0.92,
  },
  {
    id: "strobe-swell",
    name: "Strobe Swell",
    description: "Fast pulse rings with elevated beat emphasis.",
    renderMode: "pulse",
    gradientSpread: 0.28,
    particleCount: 30,
    particleBoost: 34,
    ringBoost: 2.2,
    grainEnabled: true,
    barScale: 1.12,
  },
  {
    id: "vapor-arc",
    name: "Vapor Arc",
    description: "Smooth color drift with airy particles and softened contrast.",
    renderMode: "aurora",
    gradientSpread: 0.24,
    particleCount: 44,
    particleBoost: 18,
    particleHueShift: 28,
    grainEnabled: true,
    barScale: 1.05,
  },
  {
    id: "fracture-line",
    name: "Fracture Line",
    description: "Warp-heavy geometry with broader line oscillation.",
    renderMode: "warp",
    gradientSpread: 0.55,
    particleCount: 62,
    particleBoost: 48,
    warpStrength: 1.45,
    grainEnabled: true,
    barScale: 0.88,
  },
  {
    id: "halo-bloom",
    name: "Halo Bloom",
    description: "Bright circular motion and softer visual bloom.",
    renderMode: "pulse",
    gradientSpread: 0.12,
    particleCount: 28,
    particleBoost: 20,
    ringBoost: 1.8,
    grainEnabled: false,
    barScale: 1.08,
  },
];

export function buildRuntimeShaderCatalog() {
  return runtimeShaderBlueprints.map((preset, index) => normalizeShaderPreset(preset, index % shaderPresetCatalog.length));
}

function hexToNormalizedRgb(hex) {
  const cleaned = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  const value = Number.parseInt(cleaned, 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function shaderRecordToPreset(shader, index = 0) {
  const palette = Array.isArray(shader?.palette) && shader.palette.length >= 2 ? shader.palette : [];
  const [first, second] = palette;
  const primary = hexToNormalizedRgb(first) || hexToNormalizedRgb("#5ea8ff") || [0.37, 0.66, 1];
  const secondary = hexToNormalizedRgb(second) || hexToNormalizedRgb("#ff7ad9") || [1, 0.48, 0.85];
  const bpm = Number(shader?.bpm) || 120;
  const presetMode = String(shader?.preset || "").toLowerCase();

  return normalizeShaderPreset({
    id: shader?.id || `shader-${index}`,
    name: shader?.name || shader?.n || `Shader ${index + 1}`,
    description: shader?.description || "",
    barScale: 0.9 + Math.min(0.35, Math.max(0, (bpm - 80) / 220)),
    renderMode: presetMode.includes("drive") || bpm >= 132
      ? "warp"
      : presetMode.includes("rest") || bpm <= 88
        ? "aurora"
        : "pulse",
    gradientSpread: presetMode.includes("rest") ? 0.12 : presetMode.includes("drive") ? 0.52 : 0.28,
    particleCount: Math.round(20 + Math.min(50, bpm / 2)),
    particleBoost: Math.round(16 + Math.min(48, bpm / 3)),
    ringBoost: presetMode.includes("spark") ? 2.1 : presetMode.includes("drive") ? 1.6 : 1.2,
    grainEnabled: presetMode !== "rest",
    warpStrength: presetMode.includes("drive") ? 1.5 : presetMode.includes("spark") ? 1.2 : 1,
    particleHueShift: Math.round((primary[0] - secondary[0]) * 64),
    colorA: primary,
    colorB: secondary,
    sourceShaderId: shader?.id || null,
  }, index);
}

export function normalizeShaderPreset(preset = {}, fallbackIndex = 0) {
  const fallback = shaderPresetCatalog[fallbackIndex] || shaderPresetCatalog[0];
  return {
    id: preset.id || fallback.id || `shader-${fallbackIndex}`,
    name: preset.name || fallback.name || `Shader ${fallbackIndex + 1}`,
    description: preset.description || fallback.description || "",
    barScale: typeof preset.barScale === "number" ? preset.barScale : fallback.barScale ?? 1,
    renderMode: preset.renderMode || fallback.renderMode || "aurora",
    gradientSpread: typeof preset.gradientSpread === "number" ? preset.gradientSpread : fallback.gradientSpread ?? 0.3,
    particleCount: typeof preset.particleCount === "number" ? preset.particleCount : fallback.particleCount ?? 40,
    particleBoost: typeof preset.particleBoost === "number" ? preset.particleBoost : fallback.particleBoost ?? 40,
    ringBoost: typeof preset.ringBoost === "number" ? preset.ringBoost : fallback.ringBoost ?? 1,
    grainEnabled: typeof preset.grainEnabled === "boolean" ? preset.grainEnabled : fallback.grainEnabled ?? false,
    warpStrength: typeof preset.warpStrength === "number" ? preset.warpStrength : fallback.warpStrength ?? 1,
    particleHueShift: typeof preset.particleHueShift === "number" ? preset.particleHueShift : fallback.particleHueShift ?? 0,
    colorA: Array.isArray(preset.colorA) ? preset.colorA : fallback.colorA || null,
    colorB: Array.isArray(preset.colorB) ? preset.colorB : fallback.colorB || null,
    sourceShaderId: preset.sourceShaderId || fallback.sourceShaderId || null,
  };
}

/**
 * Render a gradient background with color mixing.
 */
function renderGradient(ctx, w, h, uniforms, preset) {
  const [r1, g1, b1] = preset.colorA || uniforms.uColorA;
  const [r2, g2, b2] = preset.colorB || uniforms.uColorB;
  const t = uniforms.uTime;
  const spread = preset.gradientSpread ?? 0.3;
  const shift = Math.sin(t * spread) * 0.5 + 0.5;

  const gradient = ctx.createLinearGradient(
    w * shift, 0,
    w * (1 - shift), h
  );
  gradient.addColorStop(0, `rgba(${r1 * 255 | 0}, ${g1 * 255 | 0}, ${b1 * 255 | 0}, 1)`);
  gradient.addColorStop(1, `rgba(${r2 * 255 | 0}, ${g2 * 255 | 0}, ${b2 * 255 | 0}, 1)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Render floating particles.
 */
function renderParticles(ctx, w, h, uniforms, count = 60, preset) {
  const t = uniforms.uTime;
  const energy = uniforms.uAudioEnergy;
  const brightness = uniforms.uBrightness;
  const [r, g, b] = uniforms.uColorB;
  const hueShift = preset.particleHueShift ?? 0;

  for (let i = 0; i < count; i++) {
    const seed = i * 137.5;
    const x = ((Math.sin(seed + t * 0.2) * 0.5 + 0.5) * w + Math.sin(t * 0.5 + seed) * 30 * energy) % w;
    const y = ((Math.cos(seed * 0.7 + t * 0.15) * 0.5 + 0.5) * h + Math.cos(t * 0.3 + seed) * 20) % h;
    const size = (1 + Math.sin(t * 2 + seed) * energy) * (2 + brightness * 3);
    const alpha = 0.1 + brightness * 0.4 + Math.sin(t * 3 + seed) * 0.1;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${(r * 255 + 40 + hueShift) | 0}, ${(g * 255 + 40 + hueShift) | 0}, ${(b * 255 + 40 + hueShift) | 0}, ${alpha})`;
    ctx.fill();
  }
}

/**
 * Render pulse rings.
 */
function renderPulseRings(ctx, w, h, uniforms, preset) {
  const t = uniforms.uTime;
  const pulse = uniforms.uPulse;
  const energy = uniforms.uAudioEnergy;
  const [r, g, b] = uniforms.uColorA;
  const ringBoost = preset.ringBoost ?? 1;

  const cx = w / 2;
  const cy = h / 2;
  const ringCount = 3 + Math.floor(pulse * 4 * ringBoost);

  for (let i = 0; i < ringCount; i++) {
    const phase = (t * pulse * 2 + i * 0.8) % 4;
    const radius = phase * Math.max(w, h) * 0.3;
    const alpha = Math.max(0, (1 - phase / 4) * 0.3 * energy);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r * 255 | 0}, ${g * 255 | 0}, ${b * 255 | 0}, ${alpha})`;
    ctx.lineWidth = 1 + energy * 3;
    ctx.stroke();
  }
}

/**
 * Render warp distortion lines.
 */
function renderWarpLines(ctx, w, h, uniforms, preset) {
  const t = uniforms.uTime;
  const warp = uniforms.uWarp;
  const chaos = uniforms.uChaos;
  const [r, g, b] = uniforms.uColorB;
  const warpStrength = preset.warpStrength ?? 1;

  const lineCount = 8 + Math.floor(chaos * 20);

  for (let i = 0; i < lineCount; i++) {
    const seed = i * 97.3;
    const y = (i / lineCount) * h;

    ctx.beginPath();
    ctx.moveTo(0, y);

    for (let x = 0; x < w; x += 8) {
      const offset = Math.sin(x * 0.01 + t + seed) * warp * 40 * warpStrength +
                     Math.sin(x * 0.03 + t * 2) * chaos * 20 * warpStrength;
      ctx.lineTo(x, y + offset);
    }

    ctx.strokeStyle = `rgba(${r * 255 | 0}, ${g * 255 | 0}, ${b * 255 | 0}, ${0.03 + chaos * 0.08})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

/**
 * Render film grain overlay.
 *
 * This used to read the whole canvas back with getImageData, perturb it in JS
 * and put it back, once per frame. That is a full CPU pixel readback that
 * forces a GPU sync every frame and scales with canvas area — it was the
 * single most expensive thing in the render path.
 *
 * Instead we build a small tiled noise texture once and composite it, which is
 * a GPU-side blend and independent of canvas size. A handful of tiles are
 * cycled so the grain still crawls rather than sitting static.
 */
const GRAIN_TILE_SIZE = 128;
const GRAIN_TILE_COUNT = 4;
let grainTiles = null;

function buildGrainTiles() {
  const tiles = [];
  for (let t = 0; t < GRAIN_TILE_COUNT; t++) {
    const tile = document.createElement("canvas");
    tile.width = GRAIN_TILE_SIZE;
    tile.height = GRAIN_TILE_SIZE;
    const tileCtx = tile.getContext("2d");
    const image = tileCtx.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const value = (Math.random() * 255) | 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    tileCtx.putImageData(image, 0, 0);
    tiles.push(tile);
  }
  return tiles;
}

function renderGrain(ctx, w, h, uniforms) {
  const grain = uniforms.uGrain;
  if (grain < 0.01) return;
  if (typeof document === "undefined") return;
  if (!grainTiles) grainTiles = buildGrainTiles();

  const tile = grainTiles[((uniforms.uTime * 24) | 0) % GRAIN_TILE_COUNT];
  const previousAlpha = ctx.globalAlpha;
  const previousOp = ctx.globalCompositeOperation;

  ctx.globalAlpha = Math.min(0.35, grain * 1.6);
  ctx.globalCompositeOperation = "overlay";
  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.globalAlpha = previousAlpha;
  ctx.globalCompositeOperation = previousOp;
}

/**
 * Main composite render function.
 * Layers all visual elements based on current uniforms.
 */
export function renderShaderFrame(ctx, w, h, uniforms, shaderPreset = shaderPresetCatalog[0]) {
  const preset = normalizeShaderPreset(shaderPreset);
  const presetId = preset.renderMode || "aurora";

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Layer 1: Gradient base
  renderGradient(ctx, w, h, uniforms, preset);

  // Layer 2: Preset-specific motion layer
  if (presetId === "warp" && uniforms.uWarp > 0.03) {
    renderWarpLines(ctx, w, h, uniforms, preset);
  } else if (presetId === "pulse" && uniforms.uPulse > 0.03) {
    renderPulseRings(ctx, w, h, uniforms, preset);
  }

  // Layer 3: Pulse rings
  if (uniforms.uPulse > 0.1 && presetId !== "pulse") {
    renderPulseRings(ctx, w, h, uniforms, preset);
  }

  // Layer 4: Floating particles
  const particleCount = (preset.particleCount ?? 40) + Math.floor(uniforms.uLyricEnergy * (preset.particleBoost ?? 40));
  renderParticles(ctx, w, h, uniforms, particleCount, preset);

  // Layer 5: Grain overlay
  if (preset.grainEnabled) {
    renderGrain(ctx, w, h, uniforms);
  }
}
