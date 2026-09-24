/* Browser regression audit for the shared feature host.
   Run: node scripts/audit-plugin-dock.mjs
   Uses the real page markup and stylesheet cascade, with only PluginDock loaded.
   Requires Playwright Chromium; no backend, account, network assets, or audio. */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
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

// Keep the actual stylesheet order, specificity, markup, and nested modal hosts.
// Strip feature scripts and resource URLs so the fixture needs no services.
const html = (await readFile(join(appRoot, 'static/index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*href=["']https?:[^>]*>/gi, '')
  .replace(/(<(?:iframe|img|video|audio|source)\b[^>]*?)\s+src=["'][^"']*["']/gi, '$1')
  .replace('</body>', '<script src="/static/gallery/plugin-dock.js"></script></body>');
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  const file = resolve(appRoot, `.${pathname}`);
  if (!file.startsWith(`${join(appRoot, 'static')}${sep}`)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': extname(file) === '.css' ? 'text/css' : 'text/javascript' });
    response.end(content);
  } catch { response.writeHead(404).end(); }
});

let browser;
try {
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin, { waitUntil: 'load' });
  await page.evaluate(() => {
    const panel = id => document.querySelector(`[data-dock-id="${id}"]`);
    const button = id => document.getElementById(id);
    window.auditDock = { handles: {}, renders: [], events: [] };
    const specs = [
      { id: 'apps', toggle: button('appsBtn'), layout: { mode: 'row', scroll: 'auto', width: '9999px' },
        config: { label: 'Initial app', count: 1, customData: { retained: true } },
        render(config) {
          auditDock.renders.push(config);
          const list = document.getElementById('appsList');
          list.replaceChildren(...Array.from({ length: config.count }, (_, index) => {
            const item = document.createElement('button');
            item.className = 'app-row';
            item.textContent = `${config.label} ${index + 1}`;
            return item;
          }));
        }, ignoredGeometry: { width: 9999 }, focusFirst: '.app-row' },
      { id: 'spectrum', toggle: button('btnEq'), showClass: 'show' },
      { id: 'apple-music', toggle: button('btnAppleMusic'), showClass: 'show', layout: { scroll: 'auto' } },
      { id: 'spotify', toggle: button('btnSpotify'), host: button('spotifyPanel'), layout: { scroll: 'auto' } },
      { id: 'clock', toggle: button('clockOpenBtn'), layout: { scroll: 'hidden' } },
      { id: 'focus', toggle: button('btnFocus'), host: button('focusPanel'), layout: { scroll: 'auto' } },
      { id: 'notes', toggle: button('canvasToggle'), overlay: true },
      { id: 'app-surface', layout: { mode: 'overlay', scroll: 'hidden' } },
    ];
    for (const spec of specs) {
      auditDock.handles[spec.id] = PluginDock.register({ ...spec, el: panel(spec.id),
        onOpen: () => auditDock.events.push(`open:${spec.id}`),
        onClose: () => auditDock.events.push(`close:${spec.id}`),
      });
    }
  });

  const settle = () => page.waitForTimeout(120);
  const snapshot = () => page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    row: PluginDock.order.filter(id => PluginDock.isOpen(id) && PluginDock.panels.get(id).layout.mode === 'row')
      .map(id => {
        const el = PluginDock.panels.get(id).el;
        const { x, y, width, height } = el.getBoundingClientRect();
        return { id, x, y, width, height };
      }),
    recency: [...PluginDock.recency], count: Number(document.documentElement.style.getPropertyValue('--dock-count')),
  }));
  const checkBounds = async label => {
    await settle();
    const state = await snapshot();
    for (const box of state.row) {
      assert.ok(box.width > 0 && box.height >= 0, `${label}: valid size ${JSON.stringify(box)}`);
      assert.ok(box.x >= -1 && box.x + box.width <= state.width + 1,
        `${label}: horizontal bounds ${JSON.stringify(box)}`);
      assert.ok(box.y >= -1 && box.y + box.height <= state.height + 1,
        `${label}: vertical bounds ${JSON.stringify(box)}`);
      assert.ok(Math.abs(box.width - state.row[0].width) <= 1, `${label}: shared cell width (${box.id})`);
      assert.ok(Math.abs(box.height - state.row[0].height) <= 1, `${label}: shared cell height (${box.id})`);
      assert.ok(Math.abs(box.y - state.row[0].y) <= 1, `${label}: shared row origin (${box.id})`);
    }
    for (let index = 1; index < state.row.length; index++) {
      const right = state.row[index - 1], left = state.row[index];
      assert.ok(left.x + left.width <= right.x + 1,
        `${label}: registered cells do not overlap ${JSON.stringify([left, right])}`);
    }
    assert.equal(state.count, Math.max(1, state.row.length), `${label}: only row cells share width`);
    return state;
  };

  const normalization = await page.evaluate(() => {
    const feature = PluginDock.panels.get('apps');
    return { renderCount: auditDock.renders.length, text: document.querySelector('#appsList').textContent,
      layout: feature.layout, customData: feature.config.customData,
      leakedGeometry: Object.hasOwn(feature, 'ignoredGeometry'),
      legacyOverlay: PluginDock.panels.get('notes').layout.mode,
      normalizedOverlay: PluginDock.panels.get('app-surface').layout.mode,
      hostInert: document.getElementById('spotifyPanel').inert };
  });
  assert.equal(normalization.renderCount, 1, 'initial config renders once at registration');
  assert.equal(normalization.text, 'Initial app 1');
  assert.deepEqual(normalization.layout, { mode: 'row', scroll: 'auto' }, 'layout accepts only normalized fields');
  assert.deepEqual(normalization.customData, { retained: true }, 'feature-specific config is preserved');
  assert.equal(normalization.leakedGeometry, false, 'unrecognized feature geometry is discarded');
  assert.equal(normalization.legacyOverlay, 'overlay', 'legacy overlay registration still works');
  assert.equal(normalization.normalizedOverlay, 'overlay');
  assert.equal(normalization.hostInert, false, 'legacy modal wrapper no longer blocks its dock cell');

  await page.evaluate(() => auditDock.handles.apps.open());
  const beforeConfig = await checkBounds('before config update');
  await page.evaluate(() => auditDock.handles.apps.updateConfig({ label: 'Configured app', count: 80 }));
  const afterConfig = await checkBounds('after config update');
  assert.deepEqual(afterConfig, beforeConfig, 'content config cannot change host geometry or open state');
  const configured = await page.evaluate(() => {
    const feature = PluginDock.panels.get('apps');
    return { count: document.querySelectorAll('#appsList .app-row').length,
      text: document.querySelector('#appsList .app-row').textContent,
      scrollable: feature.el.scrollHeight > feature.el.clientHeight,
      overflow: getComputedStyle(feature.el).overflowY, renders: auditDock.renders.length,
      hasOldField: Object.hasOwn(feature.config, 'customData') };
  });
  assert.deepEqual(configured, { count: 80, text: 'Configured app 1', scrollable: true,
    overflow: 'auto', renders: 2, hasOldField: false }, 'config replacement renders contained, scrollable content');
  console.log('ok: normalized feature boundary, initial render, config replacement, contained overflow');

  const rowIds = ['apps', 'spectrum', 'apple-music', 'spotify', 'clock', 'focus'];
  for (const [width, capacity] of [[1440, 4], [900, 2], [700, 2], [390, 1], [280, 1]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { PluginDock.closeAll(); auditDock.handles.notes.open(); });
    for (let index = 0; index < rowIds.length; index++) {
      const id = rowIds[index];
      await page.evaluate(id => auditDock.handles[id].open(), id);
      const state = await checkBounds(`${width}px opening ${id}`);
      assert.deepEqual(state.recency, ['notes', ...rowIds.slice(Math.max(0, index + 1 - capacity), index + 1)],
        `${width}px: evict the oldest row cell, retain the overlay`);
    }
    const beforeOverlay = await snapshot();
    await page.evaluate(() => auditDock.handles['app-surface'].open());
    const afterOverlay = await checkBounds(`${width}px normalized overlay`);
    assert.deepEqual(afterOverlay.row, beforeOverlay.row, 'opening overlay does not change row geometry');
    assert.equal(afterOverlay.count, beforeOverlay.count, 'overlay consumes no row capacity');
    for (const selector of ['#canvasEditor', '#appSurfacePanel']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && Math.abs(box.x) <= 1 && Math.abs(box.y) <= 1
        && Math.abs(box.width - width) <= 1 && Math.abs(box.height - 900) <= 1,
      `${width}px full viewport overlay ${selector}: ${JSON.stringify(box)}`);
    }
    console.log(`ok: ${width}px row bounds, equal cells, eviction, independent overlays`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(ids => { PluginDock.closeAll(); ids.forEach(id => PluginDock.open(id)); }, rowIds);
  await page.setViewportSize({ width: 390, height: 844 });
  const resized = await checkBounds('desktop to phone resize');
  assert.deepEqual(resized.recency, ['focus'], 'resizing evicts oldest cells until the row fits');
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.deepEqual((await checkBounds('phone to desktop resize')).recency, ['focus'], 'resize does not reopen evicted cells');

  await page.evaluate(() => {
    PluginDock.closeAll();
    document.documentElement.style.setProperty('--dock-x', '0px');
    document.documentElement.style.setProperty('--dock-gap', '0px');
    PluginDock.open('spectrum'); PluginDock.open('apple-music');
  });
  const zeroMetrics = await page.evaluate(() => PluginDock._metrics());
  assert.equal(zeroMetrics.inset, 0, 'zero inset is valid, not a fallback');
  assert.equal(zeroMetrics.gap, 0, 'zero gap is valid, not a fallback');
  const zero = await checkBounds('zero inset and gap');
  assert.ok(Math.abs(zero.row[0].x + zero.row[0].width - 1440) <= 1, 'zero inset reaches viewport edge');
  assert.ok(Math.abs(zero.row[1].x + zero.row[1].width - zero.row[0].x) <= 1, 'zero gap produces adjacent cells');

  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--dock-x');
    document.documentElement.style.removeProperty('--dock-gap');
    PluginDock.closeAll(); PluginDock.open('clock');
  });
  await page.setViewportSize({ width: 900, height: 160 });
  const short = await checkBounds('short viewport');
  assert.ok(short.row[0].height <= 2, 'negative available height collapses to the border floor');
  await page.setViewportSize({ width: 900, height: 900 });

  await page.evaluate(() => {
    PluginDock.closeAll(); auditDock.events.length = 0;
    auditDock.handles.spectrum.open(); auditDock.handles.spectrum.open();
  });
  const states = async () => page.evaluate(() => {
    const feature = PluginDock.panels.get('spectrum');
    return { open: auditDock.handles.spectrum.isOpen(), inert: feature.el.inert,
      hidden: feature.el.getAttribute('aria-hidden'), shown: feature.el.classList.contains('show'),
      pressed: feature.toggle.getAttribute('aria-pressed'), expanded: feature.toggle.getAttribute('aria-expanded') };
  });
  assert.deepEqual(await states(), { open: true, inert: false, hidden: 'false', shown: true, pressed: 'true', expanded: 'true' });
  await page.keyboard.press('Escape');
  assert.deepEqual(await states(), { open: false, inert: true, hidden: 'true', shown: false, pressed: 'false', expanded: 'false' });
  await page.evaluate(() => { auditDock.handles.spectrum.close(); auditDock.handles.spectrum.toggle(); auditDock.handles.spectrum.toggle(); });
  assert.equal((await states()).open, false);
  assert.deepEqual(await page.evaluate(() => auditDock.events), ['open:spectrum', 'close:spectrum', 'open:spectrum', 'close:spectrum'],
    'callbacks fire once per state transition');
  await page.evaluate(() => auditDock.handles.apps.updateConfig({ label: 'Closed update', count: 2 }));
  assert.equal(await page.evaluate(() => auditDock.handles.apps.isOpen()), false, 'config updates keep closed cells closed');
  await page.evaluate(() => { document.getElementById('stage').classList.add('idle'); PluginDock.open('clock'); });
  await settle();
  const idleVisibility = () => page.evaluate(() => ['clock', 'spectrum'].map(id => {
    const el = PluginDock.panels.get(id).el;
    const style = getComputedStyle(el);
    return { id, opacity: Number(style.opacity), pointerEvents: style.pointerEvents, inert: el.inert };
  }));
  assert.deepEqual(await idleVisibility(), [
    { id: 'clock', opacity: 1, pointerEvents: 'auto', inert: false },
    { id: 'spectrum', opacity: 0, pointerEvents: 'none', inert: true },
  ], 'idle chrome preserves open panels and keeps closed panels hidden');
  await page.evaluate(() => PluginDock.close('clock'));
  await settle();
  assert.deepEqual(await idleVisibility(), [
    { id: 'clock', opacity: 0, pointerEvents: 'none', inert: true },
    { id: 'spectrum', opacity: 0, pointerEvents: 'none', inert: true },
  ], 'closing an idle panel never leaves a visible, interactive ghost');
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('ok: resize, zero tokens, short viewport, Escape, inert, toggles, lifecycle callbacks, idle visibility');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
