#!/usr/bin/env node
/**
 * Build the Canvas editor surface and vendor it into static/canvas/.
 *
 * Canvas lives in its own repository, so unlike lyrics-shader-lab there is no
 * in-tree source to build. This resolves the checkout, builds it with the base
 * path this app serves it under, and copies the result in.
 *
 * Point CANVAS_REPO at the checkout if it is not in the default location.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const canvasRepo = process.env.CANVAS_REPO
  || resolve(process.env.HOME || "", "Documents/GitHub/base44-canvas");
const outDir = join(appRoot, "static", "canvas");

if (!existsSync(join(canvasRepo, "package.json"))) {
  console.error(`Canvas checkout not found at ${canvasRepo}`);
  console.error("Set CANVAS_REPO to its location.");
  process.exit(1);
}

console.log(`Building Canvas editor surface from ${canvasRepo}`);
execFileSync(
  "npx",
  ["vite", "build", "--base=/static/canvas/", "--outDir", "dist-surface"],
  { cwd: canvasRepo, stdio: "inherit" },
);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(canvasRepo, "dist-surface"), outDir, { recursive: true });
console.log(`Vendored into ${outDir}`);

// The export is built for standalone hosting, so its index.html carries a
// base44.com favicon, a manifest link that 404s against our origin, and a
// page-view beacon. Strip them here rather than by hand, or the next vendor
// puts them straight back.
execFileSync(
  "node",
  [join(appRoot, "scripts", "sanitize-plugin-surface.mjs"), "canvas"],
  { stdio: "inherit" },
);
