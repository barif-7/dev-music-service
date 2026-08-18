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
  ],
};
