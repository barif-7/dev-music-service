/* Browser regression audit for fullscreen/gallery shader uniform modes.
   Run: node scripts/audit-shader-modes.mjs
   Requires local Playwright Chromium; starts an isolated app server. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function findChromium() {
  for (const root of [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]) {
    if (!existsSync(root)) continue;
    for (const build of readdirSync(root).filter(name => name.startsWith('chromium-')).sort().reverse()) {
      for (const candidate of [
        join(root, build, 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(root, build, 'chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'),
        join(root, build, 'chrome-linux', 'chrome'),
      ]) if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('No local Playwright Chromium found. Install it with: npx playwright install chromium');
}
const port = await new Promise((done, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => done(port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(join(appRoot, '.venv/bin/python'),
  ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: appRoot, stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let index = 0; index < 40 && !ready; index++) {
    try { ready = (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
    if (!ready) await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'isolated app server starts');
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ executablePath: findChromium() });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  // Force bundled sources so API catalogue changes cannot change this audit.
  await context.route('**/api/shaders', route => route.fulfill({ json: { shaders: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const load = async target => {
    await target.goto(`${origin}/?mode=prod`, { waitUntil: 'domcontentloaded' });
    await target.waitForFunction(() => typeof heroes !== 'undefined'
      && document.querySelectorAll('[data-shader-uniform-mode]').length === 2);
  };
  const modes = () => page.evaluate(() => ({
    selected: [...document.querySelectorAll('[data-shader-uniform-mode]')].map(el => el.value),
    heroes: heroes.map(tile => tile.config.mode),
    preview: gridPreviewTile?.config.mode ?? null,
    state: PhaseState.get('shaderUniformMode'),
    saved: localStorage.getItem('phaseField.shaderUniformMode'),
  }));
  const checkModes = async (selection, heroMode, previewMode) => {
    const actual = await modes();
    assert.deepEqual(actual.selected, [selection, selection], 'both selectors stay synchronized');
    assert.deepEqual(actual.heroes, [heroMode, heroMode], 'both crossfade layers use selected mode');
    assert.equal(actual.preview, previewMode, 'preview uses selected mode');
    assert.equal(actual.state, selection, 'shared state reflects selection');
    return actual;
  };
  await load(page);
  await checkModes('auto', 'fullscreen', null);
  await page.evaluate(() => PluginDock.open('focus'));
  await page.locator('#shaderUniformMode').selectOption('gallery');
  assert.equal((await checkModes('gallery', 'gallery', null)).saved, 'gallery');
  await page.evaluate(() => { PluginDock.closeAll(); Wallpaper.openGrid(true); });
  await checkModes('gallery', 'gallery', 'gallery');
  await page.locator('#galleryUniformMode').selectOption('fullscreen');
  assert.equal((await checkModes('fullscreen', 'fullscreen', 'fullscreen')).saved, 'fullscreen');
  await page.locator('#galleryUniformMode').selectOption('auto');
  await checkModes('auto', 'fullscreen', 'gallery');
  await page.locator('#galleryUniformMode').selectOption('gallery');
  await load(page);
  await checkModes('gallery', 'gallery', null);
  await page.evaluate(() => Wallpaper.openGrid(true));
  await checkModes('gallery', 'gallery', 'gallery');
  await page.waitForFunction(() => [...document.querySelectorAll('.cell')]
    .every(cell => Number(getComputedStyle(cell).opacity) >= 0.99));
  await page.screenshot({ path: '/private/tmp/phase-shader-gallery-desktop.png' });
  console.log('ok: two synchronized controls, current/future tiles, Auto defaults and saved reload');

  await page.locator('#galleryUniformMode').selectOption('fullscreen');
  const halftone = page.getByRole('button', { name: 'Open Halftone wallpaper', exact: true });
  const cellBox = await halftone.boundingBox();
  await page.mouse.move(cellBox.x + cellBox.width * 0.2, cellBox.y + cellBox.height * 0.25);
  const previewPointer = await page.evaluate(() => ({ id: gridPreviewTile.fragId, target: gridPreviewTile.target }));
  assert.equal(previewPointer.id, 'halftone', 'hover chooses Halftone preview');
  assert.ok(Math.abs(previewPointer.target.x - 0.2) < 0.02 && Math.abs(previewPointer.target.y - 0.75) < 0.02,
    'cell forwards pointer coordinates through the noninteractive preview canvas');
  await page.evaluate(() => Wallpaper.openImmersive(state.index));
  await page.waitForFunction(() => state.mode === 'immersive' && !state.transitioning);
  // Keep the pointer on the app shell: events inside the centered lyrics
  // iframe belong to its document and do not bubble to the parent window.
  await page.mouse.move(144, 225);
  const heroPointers = await page.evaluate(() => heroes.map(tile => tile.target));
  for (const pointer of heroPointers) assert.ok(Math.abs(pointer.x - 0.1) < 0.01
    && Math.abs(pointer.y - 0.75) < 0.01, `app shell forwards pointer to both hero layers: ${JSON.stringify(pointer)}`);
  await page.evaluate(() => Wallpaper.openGrid(true));
  await page.locator('#galleryUniformMode').selectOption('gallery');
  console.log('ok: actual pointer events reach gallery preview and both fullscreen layers');

  // Read actual WebGL uniforms with the real audio mapper. Only the live audio
  // frame and clock are fixed; rendering, source compilation and uploads are real.
  const renderChecks = await page.evaluate(() => {
    const audio = { active: true, silence: false, bpm: 120, beatPhase: 0.3,
      beatPulse: 0.5, level: 0.4, mid: 0.35, vocal: 0.3, bass: 0.45, treble: 0.25,
      sub: 0.2, lowMid: 0.3, highMid: 0.4, spectralCentroid: 0.5,
      spectralFlux: 0.02, rms: 0.1, peak: 0.6 };
    const originalMap = ShaderMapper.map;
    const originalNow = performance.now;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;pointer-events:none';
    document.body.append(canvas);
    let tile;
    try {
      performance.now = () => 12000;
      ShaderMapper.map = (_audio, profile, ctx) => originalMap(audio, profile, ctx);
      tile = new Tile(canvas, 'halftone', 92, 1, ShaderUniformConfigs.fullscreen);
      const read = () => Object.fromEntries(Object.entries(tile.u).filter(([, loc]) => loc !== null)
        .map(([name, loc]) => {
          const value = tile.gl.getUniform(tile.prog, loc);
          return [name, ArrayBuffer.isView(value) ? Array.from(value) : value];
        }));
      const results = [];
      for (const id of ['halftone', 'cmyk', 'riso', 'newsprint', 'benday', 'linescreen']) {
        tile.load(id, ALTS.find(shader => shader.id === id).bpm);
        if (!tile.gl || !tile.prog) throw new Error(`${id}: WebGL shader did not compile`);
        tile.setConfig(ShaderUniformConfigs.fullscreen);
        tile.tSec = 10;
        tile._lastFrame = 12000;
        tile.mouse.x = tile.target.x = 0.2;
        tile.mouse.y = tile.target.y = 0.75;
        for (let index = 0; index < 180; index++) tile.draw();
        const fullscreen = read();
        const program = tile.prog;
        const time = tile.tSec;
        tile.setConfig(ShaderUniformConfigs.gallery);
        const continuity = tile.prog === program && tile.tSec === time;
        tile.draw();
        const gallery = read();
        results.push({ id, fullscreen, gallery, continuity,
          shaderState: canvas.dataset.shaderState, error: tile.gl.getError() });
      }
      // The gallery orbit ignores pointer movement. Fullscreen preserves its
      // original idle orbit, independently of its smoothed live pointer.
      tile.setConfig(ShaderUniformConfigs.gallery);
      tile.draw();
      const firstOrbit = read().iMouse;
      tile.target.x = 0.95; tile.target.y = 0.05;
      tile.draw();
      const secondOrbit = read().iMouse;
      audio.active = false;
      tile.setConfig(ShaderUniformConfigs.fullscreen);
      tile.draw();
      const idleOrbit = read().iMouse;
      tile.target.x = 0.05; tile.target.y = 0.95;
      tile.draw();
      const secondIdleOrbit = read().iMouse;
      tile.setConfig({ mode: 'invalid', arbitrary: 'discard' });
      return { results, firstOrbit, secondOrbit, idleOrbit, secondIdleOrbit,
        fallbackMode: tile.config.mode,
        frozen: Object.isFrozen(ShaderUniformConfigs.fullscreen) && Object.isFrozen(ShaderUniformConfigs.gallery) };
    } finally {
      ShaderMapper.map = originalMap;
      performance.now = originalNow;
      tile?.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    }
  });
  for (const result of renderChecks.results) {
    assert.equal(result.shaderState, 'bundled', `${result.id}: bundled shader compiles`);
    assert.equal(result.error, 0, `${result.id}: no WebGL errors`);
    assert.equal(result.continuity, true, `${result.id}: mode does not recompile or reset clock`);
    const { iMouse: fullscreenMouse, ...fullscreen } = result.fullscreen;
    const { iMouse: galleryMouse, ...gallery } = result.gallery;
    assert.deepEqual(gallery, fullscreen, `${result.id}: audio, clock and geometry uniforms stay unchanged`);
    assert.deepEqual(fullscreen.iResolution, [320, 180], `${result.id}: actual canvas resolution`);
    // Newsprint calculates but does not consume its pointer, so WebGL removes
    // that uniform. Keep its compilation/audio checks without inventing motion.
    if (result.id === 'newsprint') {
      assert.equal(fullscreenMouse, undefined, 'Newsprint does not consume iMouse');
      continue;
    }
    assert.ok(fullscreenMouse && galleryMouse, `${result.id}: pointer is an active shader uniform`);
    assert.notDeepEqual(galleryMouse, fullscreenMouse, `${result.id}: live pointer and gallery orbit differ`);
    assert.ok(Math.abs(fullscreenMouse[0] - 0.2) <= 0.031
      && Math.abs(fullscreenMouse[1] - 0.75) <= 0.031, `${result.id}: live drift remains bounded after 180 frames`);
    assert.ok(galleryMouse.every(value => value >= 0.349 && value <= 0.651), `${result.id}: gallery orbit stays centered`);
  }
  assert.deepEqual(renderChecks.firstOrbit, renderChecks.secondOrbit, 'gallery orbit ignores pointer movement');
  assert.deepEqual(renderChecks.idleOrbit, renderChecks.secondIdleOrbit, 'fullscreen idle orbit ignores pointer movement');
  assert.ok(renderChecks.idleOrbit.every(value => value >= 0.349 && value <= 0.651), 'fullscreen idle orbit stays centered');
  assert.equal(renderChecks.fallbackMode, 'fullscreen', 'invalid tile config normalizes safely');
  assert.equal(renderChecks.frozen, true, 'shared uniform configs are immutable');
  console.log('ok: all six halftone shaders compile; real uniforms switch, bounded drift and unchanged audio/geometry');

  for (const width of [390, 280]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 390) await page.screenshot({ path: '/private/tmp/phase-shader-gallery-mobile.png' });
    const galleryBox = await page.locator('#galleryUniformMode').boundingBox();
    assert.ok(galleryBox && galleryBox.x >= 0 && galleryBox.x + galleryBox.width <= width + 1,
      `${width}px: gallery selector fits viewport: ${JSON.stringify(galleryBox)}`);
    await page.evaluate(() => { Wallpaper.openImmersive(state.index); PluginDock.open('focus'); });
    await page.locator('#shaderUniformMode').scrollIntoViewIfNeeded();
    const focusBox = await page.locator('#shaderUniformMode').boundingBox();
    const panelBox = await page.locator('[data-dock-id="focus"]').boundingBox();
    assert.ok(focusBox && panelBox && focusBox.x >= panelBox.x - 1
      && focusBox.x + focusBox.width <= panelBox.x + panelBox.width + 1,
      `${width}px: focus selector fits its host: ${JSON.stringify({ focusBox, panelBox })}`);
    await page.evaluate(() => { PluginDock.closeAll(); Wallpaper.openGrid(true); });
    await page.waitForFunction(() => state.mode === 'grid' && !state.transitioning);
  }
  console.log('ok: gallery and dock controls fit 390px and 280px viewports');

  await page.evaluate(() => localStorage.setItem('phaseField.shaderUniformMode', 'corrupt-value'));
  await load(page);
  await checkModes('auto', 'fullscreen', null);
  const fallback = await context.newPage();
  fallback.on('pageerror', error => errors.push(String(error)));
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/.test(type) ? null : getContext.call(this, type, ...args);
    };
  });
  await load(fallback);
  await fallback.evaluate(() => Wallpaper.openGrid(true));
  await fallback.locator('#galleryUniformMode').selectOption('gallery');
  assert.deepEqual(await fallback.evaluate(() => ({
    heroes: heroes.map(tile => [tile.config.mode, tile.canvas.dataset.shaderState]),
    preview: [gridPreviewTile.config.mode, gridPreviewTile.canvas.dataset.shaderState],
  })), { heroes: [['gallery', 'fallback'], ['gallery', 'fallback']], preview: ['gallery', 'fallback'] },
  'configuration remains usable when WebGL is unavailable');
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('ok: invalid saved mode and WebGL-unavailable fallback; no uncaught browser errors');
} finally {
  await browser?.close();
  server.kill();
}
