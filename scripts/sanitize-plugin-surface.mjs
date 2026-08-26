#!/usr/bin/env node
/**
 * Strip Base44 export scaffolding out of a vendored plugin surface.
 *
 * A Base44 build emits an index.html for a standalone hosted app: a favicon
 * fetched from base44.com, a web-app manifest at the origin root, and a
 * page-view beacon. None of that survives the move into this shell -- the
 * manifest 404s against our origin, and the favicon reaches out to a third
 * party on every panel open.
 *
 * lyrics-shader-lab and clock never had these because their HTML is authored
 * here. Canvas is vendored verbatim from an external checkout, so it needs the
 * scaffolding removed on the way in.
 *
 * Idempotent: safe to re-run over an already-clean surface.
 *
 *   node scripts/sanitize-plugin-surface.mjs                 # every surface
 *   node scripts/sanitize-plugin-surface.mjs canvas          # just one
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(resolve(here, ".."), "static");

// Vendored Base44 surfaces. A surface not listed here is simply skipped.
const SURFACES = ["canvas", "clock", "lyrics-shader-lab"];

// Titles Base44 emits when the app was never renamed in their editor.
const PLACEHOLDER_TITLES = new Set(["Base44 APP", "Vite + React", "React App"]);

const TITLES = {
  canvas: "Canvas Editor · Phase",
};

function sanitize(name) {
  const indexPath = join(staticDir, name, "index.html");
  if (!existsSync(indexPath)) return { name, skipped: "no index.html" };

  const before = readFileSync(indexPath, "utf8");
  let html = before;
  const changed = [];

  // Favicon served from base44.com -- a third-party request on every open.
  const favicon = /\s*<link[^>]*rel="icon"[^>]*base44\.com[^>]*>/gi;
  if (favicon.test(html)) {
    html = html.replace(favicon, "");
    changed.push("base44.com favicon");
  }

  // Manifest is written for the app's own origin root and 404s under ours.
  const manifest = /\s*<link[^>]*rel="manifest"[^>]*>/gi;
  if (manifest.test(html)) {
    html = html.replace(manifest, "");
    changed.push("root /manifest.json link");
  }

  // Page-view beacon aimed at Base44's app-logs endpoint. Inert here (it early
  // -returns on an empty app id and only runs unframed) but it is dead weight
  // that reads like live telemetry.
  const beacon = /\s*<script type="module">(?:(?!<\/script>)[\s\S])*?app-logs[\s\S]*?<\/script>/gi;
  if (beacon.test(html)) {
    html = html.replace(beacon, "");
    changed.push("app-logs beacon");
  }

  // Only rename when the title is one Base44 leaves behind; a surface that has
  // been named deliberately keeps its name.
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch && PLACEHOLDER_TITLES.has(titleMatch[1].trim()) && TITLES[name]) {
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${TITLES[name]}</title>`);
    changed.push(`title -> ${TITLES[name]}`);
  }

  if (html !== before) writeFileSync(indexPath, html);
  return { name, changed };
}

const requested = process.argv.slice(2);
const targets = requested.length ? requested : SURFACES;
let touched = 0;

for (const name of targets) {
  const result = sanitize(name);
  if (result.skipped) {
    console.log(`${name}: skipped (${result.skipped})`);
  } else if (result.changed.length) {
    touched += 1;
    console.log(`${name}: removed ${result.changed.join(", ")}`);
  } else {
    console.log(`${name}: already clean`);
  }
}

console.log(touched ? `Sanitized ${touched} surface(s).` : "Nothing to change.");
