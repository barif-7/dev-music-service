#!/usr/bin/env node
/**
 * Render the shell in a real browser and check the design holds.
 *
 * The frontend is framework-free and its layout lives in one stylesheet, so the
 * things that break are geometric: a panel that collapses to shrink-to-fit, a
 * surface that paints a second backdrop over its host's, an overlay that quietly
 * starts consuming a slot in the dock row. None of that is visible to a linter
 * reading the source — `inset:0` followed by `right:auto` is valid CSS that
 * silently produces a 300px-wide "full-viewport" panel — so these assertions
 * read computed style and measured boxes rather than stylesheet text.
 *
 * Deliberately not in CI: it needs a browser and a booted app, and a flaky
 * render should not block a merge. Run it when the design changes.
 *
 *   npm run audit:design
 *
 * DESIGN_AUDIT_URL       audit an already-running app instead of booting one
 * DESIGN_AUDIT_CHROMIUM  path to a Chromium binary, if discovery fails
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------------------- harness -- */

const groups = [];
let current = null;
let failures = 0;
let skipped = 0;

const group = (name) => { current = { name, rows: [] }; groups.push(current); };
const pass = (label, detail = "") => current.rows.push({ mark: "ok", label, detail });
const skip = (label, why) => { skipped++; current.rows.push({ mark: "skip", label, detail: why }); };
const fail = (label, detail) => { failures++; current.rows.push({ mark: "fail", label, detail }); };

/* Record the outcome rather than throwing, so one failure does not hide every
   check after it. */
function check(label, condition, detail = "") {
  if (condition) pass(label, detail);
  else fail(label, detail || "expectation not met");
}

/* ------------------------------------------------------------- discovery -- */

/** playwright-core ships no browsers; find one already on this machine. */
function findChromium() {
  if (process.env.DESIGN_AUDIT_CHROMIUM) return process.env.DESIGN_AUDIT_CHROMIUM;
  const roots = [
    join(homedir(), "Library/Caches/ms-playwright"),
    join(homedir(), ".cache/ms-playwright"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    // Newest build wins; the revision numbers sort lexically well enough here.
    const builds = readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse();
    for (const build of builds) {
      const candidates = [
        join(root, build, "chrome-mac-arm64",
          "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        join(root, build, "chrome-mac", "Chromium.app/Contents/MacOS/Chromium"),
        join(root, build, "chrome-linux", "chrome"),
      ];
      for (const candidate of candidates) if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const freePort = () => new Promise((done) => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => done(port));
  });
});

const reachable = async (url) => {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch { return false; }
};

/** Boot the app ourselves so the audit is one command, and own the teardown. */
async function bootApp() {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(
    "uv", ["run", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: appRoot, stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await reachable(url)) return { url, stop: () => server.kill() };
    await new Promise((r) => setTimeout(r, 500));
  }
  server.kill();
  throw new Error(`app did not come up on ${url} — is uv installed?`);
}

/* ------------------------------------------------------------------ audit -- */

async function audit(page, url) {
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => PluginDock.open("notes"));
  const frame = await (await page.waitForSelector("#canvasEditorFrame")).contentFrame();
  await frame.waitForSelector(".ql-editor", { timeout: 20000 });
  await page.waitForTimeout(700);              // let the open transition settle

  // ---- overlay geometry --------------------------------------------------
  group("overlay geometry");
  const box = await page.evaluate(() => {
    const el = document.getElementById("canvasEditor");
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const before = getComputedStyle(el, "::before");
    return {
      left: Math.round(rect.x), top: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      viewport: [window.innerWidth, window.innerHeight],
      filter: style.backdropFilter,
      background: style.backgroundColor,
      transition: style.transition,
      translate: style.translate,
      highlight: { height: before.height, image: before.backgroundImage },
    };
  });

  check("panel is full-bleed",
    box.left === 0 && box.top === 0
      && box.width === box.viewport[0] && box.height === box.viewport[1],
    `${box.width}x${box.height} of ${box.viewport.join("x")}`);
  check("frosted, saturated glass",
    /blur/.test(box.filter) && /saturate/.test(box.filter), box.filter);
  // At a heavier tint the field behind it goes to black and the pane stops
  // reading as glass over something alive.
  const alpha = parseFloat((box.background.match(/[\d.]+\)$/) || ["1)"])[0]);
  check("glass lets colour through", /rgba\(/.test(box.background) && alpha < 0.7,
    box.background);
  // It emerges in place rather than sliding in like a dock card. A dock card
  // carries `translate:14px 0`; anything that resolves to no offset is fine.
  const noOffset = box.translate === "none" || /^0px( 0px)?$/.test(box.translate);
  check("emerges by fading, not sliding",
    /opacity/.test(box.transition) && noOffset, `translate: ${box.translate}`);
  check("blur ramps in with it", /backdrop-filter/.test(box.transition),
    box.transition.split(",").length + " properties transitioned");
  check("top highlight present",
    parseFloat(box.highlight.height) > 0 && /gradient/.test(box.highlight.image),
    `${box.highlight.height} gradient`);

  // Closed, there should be no glass at all, so opening ramps the blur up from
  // clear instead of cross-fading one frosted state into another. Read it after
  // the transition has run — mid-flight, computed style is still the old value.
  await page.evaluate(() => PluginDock.close("notes"));
  await page.waitForTimeout(1000);
  const closedFilter = await page.evaluate(
    () => getComputedStyle(document.getElementById("canvasEditor")).backdropFilter);
  check("blur ramps up from clear", /blur\(0px\)/.test(closedFilter), `closed: ${closedFilter}`);
  await page.evaluate(() => PluginDock.open("notes"));
  await page.waitForTimeout(1000);

  // The writing sits centred on the glass rather than pinned to one side.
  const column = await frame.evaluate(() => {
    const el = document.querySelector(".canvas-editor-column");
    const rect = el.getBoundingClientRect();
    return {
      left: Math.round(rect.x), right: Math.round(window.innerWidth - rect.right),
      width: Math.round(rect.width),
    };
  });
  check("writing column is centred", Math.abs(column.left - column.right) <= 2,
    `${column.width}px, ${column.left}px each side`);

  const toggle = await page.evaluate(() => {
    const rect = document.getElementById("dockToggle").getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      reachable: Boolean(hit && hit.closest("#topR")),
      cluster: Number(getComputedStyle(document.getElementById("topR")).zIndex),
      panel: Number(getComputedStyle(document.getElementById("canvasEditor")).zIndex),
    };
  });
  // A full-bleed panel that covered its own toggle would have no way out.
  check("toggle reachable above overlay",
    toggle.reachable && toggle.cluster > toggle.panel,
    `z ${toggle.cluster} > ${toggle.panel}`);

  // ---- dock row independence --------------------------------------------
  group("dock row independence");
  await page.evaluate(() => { PluginDock.close("notes"); PluginDock.open("spectrum"); });
  await page.waitForTimeout(500);
  const rowAlone = await page.evaluate(() => {
    const el = document.querySelector('.dock-panel.open[data-dock-id="spectrum"]');
    return { width: Math.round(el.getBoundingClientRect().width), slot: el.style.getPropertyValue("--dock-slot") };
  });
  await page.evaluate(() => PluginDock.open("notes"));
  await page.waitForTimeout(700);
  const withOverlay = await page.evaluate(() => {
    const el = document.querySelector('.dock-panel.open[data-dock-id="spectrum"]');
    return {
      width: Math.round(el.getBoundingClientRect().width),
      slot: el.style.getPropertyValue("--dock-slot"),
      count: getComputedStyle(document.documentElement).getPropertyValue("--dock-count").trim(),
      overlaySlot: document.getElementById("canvasEditor").style.getPropertyValue("--dock-slot"),
    };
  });
  check("--dock-count unchanged when overlay opens", withOverlay.count === "1",
    `--dock-count: ${withOverlay.count}`);
  check("row panel keeps its width and slot",
    rowAlone.width === withOverlay.width && rowAlone.slot === withOverlay.slot,
    `${withOverlay.width}px at slot ${withOverlay.slot}`);
  check("overlay takes no slot", withOverlay.overlaySlot === "", "no --dock-slot set");

  // A narrow viewport evicts row panels. The overlay occupies no row width, so
  // evicting it would free nothing and only lose the user's editor.
  await page.setViewportSize({ width: 700, height: 800 });
  await page.waitForTimeout(700);
  check("overlay survives a narrow-viewport evict",
    await page.evaluate(() => document.getElementById("canvasEditor").classList.contains("open")),
    "700px wide");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // ---- the surface inside ------------------------------------------------
  group("surface");
  const inner = await frame.evaluate(() => {
    const styleOf = (selector) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el) : null;
    };
    const column = styleOf(".canvas-editor-column");
    return {
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      scroll: styleOf(".canvas-editor-scroll")?.backgroundColor,
      column: column?.backgroundColor,
      columnFilter: column?.backdropFilter,
      bars: [".canvas-editor-toolbar", ".canvas-editor-status"]
        .map((s) => styleOf(s)?.backgroundColor),
    };
  });
  const clear = (colour) => colour === "rgba(0, 0, 0, 0)" || colour === "transparent";
  check("surface paints no backdrop of its own",
    clear(inner.html) && clear(inner.body) && clear(inner.scroll), "html/body/scroll clear");
  // A second tinted layer inside the host's pane is a box in a box.
  check("no second glass layer inside the pane",
    clear(inner.column) && (!inner.columnFilter || inner.columnFilter === "none"),
    `column ${inner.column}`);
  check("bars lift off the pane rather than fill it",
    inner.bars.every((c) => c && !clear(c) && parseFloat((c.match(/[\d.]+\)$/) || ["1)"])[0]) < 0.2),
    String(inner.bars[0]));

  // ---- the component embed ----------------------------------------------
  group("component embed");
  const vaultUp = await (async () => {
    try {
      const response = await fetch(`${url}/api/components/search?q=calendar&limit=1`,
        { signal: AbortSignal.timeout(8000) });
      return response.ok;
    } catch { return false; }
  })();

  if (!vaultUp) {
    skip("embed sizes itself from the vault report", "Component Vault unreachable");
    skip("preview stays sandboxed", "Component Vault unreachable");
    return;
  }

  await frame.click(".ql-editor");
  await frame.type(".ql-editor", "/component");
  await frame.waitForSelector('[data-slash-menu] button[data-idx="0"]', { timeout: 8000 });
  await frame.press(".ql-editor", "Enter");
  await frame.waitForSelector("[data-slash-menu] input", { timeout: 8000 });
  await frame.fill("[data-slash-menu] input", "calendar");
  await frame.press("[data-slash-menu] input", "Enter");
  await frame.waitForSelector('[data-slash-menu] ul button[data-idx="0"]', { timeout: 20000 });
  await frame.press(".ql-editor", "Enter");
  await frame.waitForSelector(".ql-editor .canvas-component-embed", { timeout: 8000 });
  await page.waitForTimeout(5000);             // let the preview paint and report

  const embed = await frame.evaluate(() => {
    const card = document.querySelector(".canvas-component-embed");
    const preview = card.querySelector("iframe.cce-frame");
    return {
      name: card.getAttribute("data-name"),
      inlineHeight: preview ? preview.style.height : "",
      sandbox: preview ? preview.getAttribute("sandbox") : "",
    };
  });
  // The stylesheet's 280px is the pre-report default; an inline height means
  // the vault's measured size won.
  check("embed sizes itself from the vault report", embed.inlineHeight !== "",
    `${embed.name} ${embed.inlineHeight || "still default 280px"}`);
  check("preview stays sandboxed",
    /allow-scripts/.test(embed.sandbox)
      && !/allow-(top-navigation|popups|forms|downloads|modals)/.test(embed.sandbox),
    embed.sandbox);
}

/* ----------------------------------------------------------------- report -- */

function report() {
  const ESC = String.fromCharCode(27);
  const dim = (s) => `${ESC}[2m${s}${ESC}[0m`;
  const mark = {
    ok: `${ESC}[32m✓${ESC}[0m`,
    fail: `${ESC}[31m✗${ESC}[0m`,
    skip: `${ESC}[33m-${ESC}[0m`,
  };
  let passed = 0;
  console.log("");
  for (const g of groups) {
    console.log(`  ${g.name}`);
    for (const row of g.rows) {
      if (row.mark === "ok") passed++;
      console.log(`  ${mark[row.mark]} ${row.label.padEnd(38)}${row.detail ? dim(row.detail) : ""}`);
    }
    console.log("");
  }
  const parts = [`${passed} passed`];
  if (failures) parts.push(`${failures} failed`);
  if (skipped) parts.push(`${skipped} skipped`);
  console.log(`  ${parts.join(", ")}\n`);
}

/* ------------------------------------------------------------------- main -- */

const executablePath = findChromium();
if (!executablePath) {
  console.error("design audit: no Chromium found.\n"
    + "  Install one with `npx playwright install chromium`, or set DESIGN_AUDIT_CHROMIUM.");
  process.exit(2);
}

const { chromium } = await import("playwright-core");

let app;
if (process.env.DESIGN_AUDIT_URL) {
  app = { url: process.env.DESIGN_AUDIT_URL.replace(/\/$/, ""), stop: () => {} };
  if (!(await reachable(app.url))) {
    console.error(`design audit: nothing answering at ${app.url}`);
    process.exit(2);
  }
} else {
  app = await bootApp();
}

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await audit(page, app.url);
} catch (error) {
  group("audit");
  fail("audit ran to completion", String(error.message || error).split("\n")[0]);
} finally {
  await browser.close();
  app.stop();
}

report();
process.exit(failures ? 1 : 0);
