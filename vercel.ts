import { routes } from "@vercel/config/v1";

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
    routes.rewrite("/canvas", "/static/canvas/index.html"),
    routes.rewrite("/lyrics-shader-lab", "/static/lyrics-shader-lab/index.html"),
    ...(pikaVoiceProfileEnabled
      ? [routes.rewrite("/semi", "/static/semi/index.html")]
      : []),

    // Share links land on /share and are resolved client-side from the query.
    routes.rewrite("/share", "/index.html"),
  ],
};
