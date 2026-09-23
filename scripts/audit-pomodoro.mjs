/* Browser regression audit for the focus timer. Run: node scripts/audit-pomodoro.mjs
   Requires a local Playwright Chromium; starts and stops an isolated app server.
   Real ranking API and player controls, with only the audio transport stubbed. */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function findChromium() {
  for (const root of [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")]) {
    if (!existsSync(root)) continue;
    for (const build of readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      for (const c of [
        join(root, build, "chrome-mac-arm64", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        join(root, build, "chrome-mac", "Chromium.app/Contents/MacOS/Chromium"),
        join(root, build, "chrome-linux", "chrome"),
      ]) if (existsSync(c)) return c;
    }
  }
  return null;
}

const freePort = () => new Promise((done) => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => done(port)); });
});

const reachable = async (url) => {
  try { return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
};

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const server = spawn(join(appRoot, '.venv/bin/python'),
  ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: appRoot, stdio: 'ignore' });
let browser;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = await reachable(url);
    if (!up) await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(up, 'app starts');
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const phase = text => page.waitForFunction(
    expected => document.querySelector('#pomodoroPhase').textContent === expected, text);
  const click = selector => page.locator(selector).click();

  await page.goto(`${url}/?mode=prod`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.recommendationClient && window.__phaseEnv);
  // Open the tools menu first, just as a user would.
  await click('#dockToggle');
  assert.ok(await page.locator('#clockOpenBtn').isVisible(), 'focus toggle visible in production');
  await click('#clockOpenBtn');
  assert.ok(await page.locator('#pomodoro').isVisible(), 'focus panel opens through toggle');
  assert.equal(await page.locator('#clockFrame').count(), 0, 'unused clock iframe removed');
  assert.deepEqual(await page.locator('.pom-preset').evaluateAll(
    elements => elements.map(element => Number(element.dataset.minutes))), [5, 10, 15, 20, 25]);
  assert.equal(await page.locator('#pomodoroClock').textContent(), '25:00');
  await click('[data-minutes="5"]');
  await click('#pomodoroStart');
  await page.waitForFunction(() => document.querySelector('#pomodoroStatus').textContent.includes('Add songs'));
  await phase('Ready');
  console.log('ok: production access, presets, empty playlist');

  await page.evaluate(() => {
    const client = window.recommendationClient;
    window.auditOriginalPlay = client.playTrack;
    window.auditSongs = Array.from({ length: 12 }, (_, i) => ({
      title: `Audit song ${i + 1}`, artist: 'Tester', duration: 200, tempo: 110,
      instrumentalness: 0.9, key: `audit-${i}`,
    }));
    client.playlist.replace(window.auditSongs, { label: 'Audit', source: 'manual' });
    const media = client.player.media;
    window.auditAudio = { playing: false, plays: 0, pauses: 0, reject: false };
    media.play = () => {
      window.auditAudio.plays++;
      if (window.auditAudio.reject) return Promise.reject(new Error('Playback blocked for audit'));
      window.auditAudio.playing = true;
      return Promise.resolve();
    };
    media.pause = () => { window.auditAudio.pauses++; window.auditAudio.playing = false; };
    Object.defineProperty(media, 'paused', { get: () => !window.auditAudio.playing });
    Object.defineProperty(media, 'ended', { get: () => false });
    // Preserve the real AudioPlayer instance; replace source resolution only.
    client.playTrack = async track => {
      client.player.setTrack(track);
      Object.defineProperty(media, 'src', { configurable: true, get: () => 'audit:audio' });
    };
  });

  for (const minutes of [5, 10, 15, 20, 25]) {
    await page.evaluate(() => recommendationClient.playlist.replace(window.auditSongs));
    await click(`[data-minutes="${minutes}"]`);
    await click('#pomodoroStart');
    await phase('Focusing');
    const session = await page.evaluate(() => ({
      duration: recommendationClient.playlist.snapshot().items.reduce((sum, track) => sum + track.duration, 0),
      playing: window.auditAudio.playing,
    }));
    assert.ok(session.duration >= minutes * 60, `playlist covers ${minutes} minutes`);
    assert.ok(session.playing, 'session starts audio');
    // A deterministic wall-clock jump tests the timer without waiting minutes.
    await page.evaluate(() => { window.auditNow = Date.now; Date.now = () => window.auditNow() + 2000; });
    await page.waitForTimeout(300);
    await page.evaluate(() => { Date.now = window.auditNow; });
    await click('#pomodoroPause');
    await phase('Paused');
    assert.equal(await page.evaluate(() => window.auditAudio.playing), false, 'pause stops audio');
    const held = await page.locator('#pomodoroClock').textContent();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#pomodoroClock').textContent(), held, 'pause holds timer');
    await click('#pomodoroStart');
    await phase('Focusing');
    assert.equal(await page.evaluate(() => window.auditAudio.playing), true, 'resume starts audio');
    await click('#pomodoroReset');
    await phase('Ready');
    assert.equal(await page.evaluate(() => window.auditAudio.playing), false, 'reset stops audio');
  }
  console.log('ok: all five durations cover timer; pause/resume/reset control real player');

  await click('[data-minutes="5"]');
  await click('#pomodoroStart');
  await phase('Focusing');
  await click('[data-minutes="10"]');
  await phase('Ready');
  assert.equal(await page.evaluate(() => window.auditAudio.playing), false, 'preset change stops audio');
  await page.evaluate(() => recommendationClient.playlist.replace(window.auditSongs));
  await click('[data-minutes="5"]');
  await click('#pomodoroStart');
  await phase('Focusing');
  await page.evaluate(() => { window.auditNow = Date.now; Date.now = () => window.auditNow() + 301000; });
  await phase('Complete');
  await page.evaluate(() => { Date.now = window.auditNow; });
  assert.equal(await page.evaluate(() => window.auditAudio.playing), false, 'completion stops audio');
  assert.match(await page.locator('#pomodoroStart').textContent(), /Start/);
  await click('#pomodoroStart');
  await phase('Focusing');
  console.log('ok: preset changes stop audio; completion permits a fresh session');

  await click('#pomodoroPause');
  await page.evaluate(() => { window.auditAudio.reject = true; });
  await click('#pomodoroStart');
  await page.waitForFunction(() => document.querySelector('#pomodoroStatus').textContent.includes('Playback blocked'));
  await phase('Paused');
  assert.equal(await page.evaluate(() => window.auditAudio.playing), false);
  await click('#pomodoroReset');
  await click('#pomodoroStart');
  await page.waitForFunction(() => document.querySelector('#pomodoroStatus').textContent.includes('Playback blocked'));
  await phase('Ready');

  // Exercise real loadTrack's failure path: it resolves without a playable source.
  await page.route('**/api/search?*', route => route.fulfill({ json: [] }));
  await page.evaluate(() => {
    window.auditAudio.reject = false;
    delete recommendationClient.player.media.src;
    recommendationClient.playTrack = window.auditOriginalPlay;
  });
  await click('#pomodoroStart');
  await page.waitForFunction(() => document.querySelector('#pomodoroStatus').classList.contains('error'));
  await phase('Ready');
  assert.equal(await page.evaluate(() => window.auditAudio.playing), false);
  console.log('ok: failed initial playback and resume leave timer stopped');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => PluginDock.open('clock'));
  await page.waitForTimeout(500);
  const box = await page.locator('#clockModal').boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391,
    `panel fits narrow screen: ${JSON.stringify(box)}`);
  assert.deepEqual(errors, [], 'no uncaught browser errors');

  const solar = await browser.newPage();
  await solar.goto(`${url}/?mode=prod&clock=1`, { waitUntil: 'domcontentloaded' });
  assert.equal(await solar.locator('#pomodoro').count(), 0);
  assert.equal(await solar.locator('#clockFrame').getAttribute('src'), null, 'clock stays lazy until opened');
  await solar.locator('#dockToggle').click();
  await solar.locator('#clockOpenBtn').click();
  assert.equal(await solar.locator('#clockFrame').getAttribute('src'), '/static/clock/index.html');
  assert.equal(await solar.locator('#clockModal').getAttribute('aria-label'), 'Solar clock');
  console.log('ok: narrow-screen layout and legacy solar-clock override');
} finally {
  await browser?.close();
  server.kill();
}
