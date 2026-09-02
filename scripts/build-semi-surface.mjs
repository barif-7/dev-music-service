#!/usr/bin/env node
/** Build the Base44 Semi voice-profile surface and vendor it into static/. */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const semiRepo = process.env.SEMI_REPO
  || resolve(process.env.HOME || "", "Documents/GitHub/base44-apps/base44-repo-semi");
const outDir = join(appRoot, "static", "semi");

if (!existsSync(join(semiRepo, "package.json"))) {
  console.error(`Semi checkout not found at ${semiRepo}`);
  console.error("Set SEMI_REPO to its location.");
  process.exit(1);
}

console.log(`Building Semi voice-profile surface from ${semiRepo}`);
execFileSync(
  "npx",
  ["vite", "build", "--base=/static/semi/", "--outDir", "dist-surface"],
  {
    cwd: semiRepo,
    stdio: "inherit",
    env: { ...process.env, VITE_LOCALIZED_PLUGIN_SURFACE: "voice-profile" },
  },
);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(semiRepo, "dist-surface"), outDir, { recursive: true });
console.log(`Vendored into ${outDir}`);

execFileSync(
  "node",
  [join(appRoot, "scripts", "sanitize-plugin-surface.mjs"), "semi"],
  { stdio: "inherit" },
);
