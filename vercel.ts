import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { routes } from "@vercel/config/v1";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Vercel hosts the frontend only. The FastAPI backend runs on its own
 * long-running host -- it shells out to yt-dlp and proxies range requests for
 * audio, neither of which suits a serverless function.
 *
 * Everything except audio is rewritten to that backend, so the browser still
 * sees a single origin and the session cookie keeps scoping to this domain.
 * Audio is fetched straight from the backend instead (see
 * scripts/build-vercel-frontend.mjs) to keep those bytes off Vercel.
 */
const backendOrigin = (process.env.PHASE_BACKEND_ORIGIN || "").replace(/\/$/, "");
const pikaVoiceProfileEnabled = process.env.PIKA_VOICE_PROFILE_ENABLED === "true";

if (!backendOrigin) {
  throw new Error(
    "PHASE_BACKEND_ORIGIN must be set to the backend's public origin, e.g. https://host.tailnet.ts.net",
  );
}


/** Plugin surfaces that have a vendored build to rewrite onto. */
function surfaceRewrites() {
  const catalog = JSON.parse(
    readFileSync(join(here, "static", "gallery", "plugins.json"), "utf8"),
  ) as { plugins: { id: string; flag?: string; serves?: string }[] };

  return catalog.plugins
    .filter((plugin) => {
      // A flagged surface stays absent unless its flag is on, matching the
      // backend gate and keeping the bundle out of the default build.
      if (plugin.flag === "pika_voice_profile_enabled" && !pikaVoiceProfileEnabled) return false;
      return existsSync(join(here, "static", plugin.serves ?? plugin.id, "index.html"));
    })
    .map((plugin) =>
      routes.rewrite(`/${plugin.id}`, `/static/${plugin.serves ?? plugin.id}/index.html`),
    );
}

export default {
  buildCommand: "node scripts/build-vercel-frontend.mjs",
  outputDirectory: "dist",
  rewrites: [
    // Sign-in has to run through the proxy: if the form posted to the backend
    // origin directly, Set-Cookie would scope to that domain and the shell
    // served from here would never see the session.
    routes.rewrite("/login", `${backendOrigin}/login`),
    routes.rewrite("/api/(.*)", `${backendOrigin}/api/$1`),

    // The shell frames its plugin surfaces by route, not by file --
    // `/canvas?surface=editor`, `/lyrics-shader-lab?surface=reader` -- because
    // the backend serves them from those paths and the surface name has to
    // survive in the query string. Nothing serves those paths here, so map
    // them onto the vendored index.html; the query string carries through.
    //
    // The list comes from the same catalogue the shell's launcher and the
    // backend's routes read, so a plugin cannot work locally and 404 here for
    // want of a rewrite somebody forgot to add. Only surfaces actually vendored
    // into static/ are mapped: an unbuilt one would otherwise rewrite to a file
    // Vercel does not have and answer 404 with no explanation, where the
    // backend says which command builds it.
    ...surfaceRewrites(),

    // Share links land on /share and are resolved client-side from the query.
    routes.rewrite("/share", "/index.html"),
  ],
};
