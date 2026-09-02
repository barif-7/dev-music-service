#!/usr/bin/env node
/**
 * Stage the frontend for Vercel.
 *
 * The shell addresses its assets as absolute /static/... paths, so the deployed
 * tree has to keep that shape: index.html at the root with static/ beneath it.
 * Serving static/ directly as the output directory would resolve
 * /static/gallery/app.js to static/static/gallery/app.js instead.
 *
 * Every plugin bundle under static/ is committed build output, so there is
 * nothing to compile here -- this only assembles what the repo already has.
 * Rebuild those with `npm run build:lyrics-shader-lab` / `build:canvas` and
 * commit the result before deploying.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const staticDir = join(appRoot, "static");
const outDir = join(appRoot, "dist");

// Audio bypasses the Vercel rewrite and goes straight to the backend, so the
// shell needs the absolute origin. Everything else stays same-origin and is
// proxied, so this is the only value the frontend has to be told.
const backendOrigin = (process.env.PHASE_BACKEND_ORIGIN || "").replace(/\/$/, "");

if (!existsSync(join(staticDir, "index.html"))) {
  console.error(`No index.html under ${staticDir}`);
  process.exit(1);
}

if (!backendOrigin) {
  console.warn(
    "PHASE_BACKEND_ORIGIN is unset; audio will fall back to same-origin /api/stream.",
  );
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(staticDir, join(outDir, "static"), { recursive: true });

// The Pika voice-profile bundle is not a production asset until its explicit
// pre-release flag is enabled in the Vercel build environment. Keeping the
// files out of dist means a guessed /static/semi URL cannot bypass the hidden
// shell toggle or the backend's guarded /semi route.
const pikaVoiceProfileEnabled = process.env.PIKA_VOICE_PROFILE_ENABLED === "true";
if (!pikaVoiceProfileEnabled) {
  rmSync(join(outDir, "static", "semi"), { recursive: true, force: true });
}

const indexHtml = readFileSync(join(staticDir, "index.html"), "utf8");
const injected = indexHtml.replace(
  "</head>",
  `<script>window.__PHASE_BACKEND_ORIGIN__=${JSON.stringify(backendOrigin)};</script>\n</head>`,
);

if (injected === indexHtml) {
  console.error("index.html has no </head> to inject the backend origin into");
  process.exit(1);
}

writeFileSync(join(outDir, "index.html"), injected);
// The shell is also served at /share, which the router resolves client-side.
writeFileSync(join(outDir, "static", "index.html"), injected);

console.log(
  `Staged frontend into ${outDir} (backend origin: ${backendOrigin || "same-origin"}; `
    + `Pika voice profile: ${pikaVoiceProfileEnabled ? "included" : "excluded"})`,
);
