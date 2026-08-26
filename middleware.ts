import { next } from "@vercel/functions";

/**
 * Keep the shell private now that Vercel serves it.
 *
 * The backend gates every HTML route itself (see beta_auth_gate in main.py),
 * but that middleware no longer runs for pages served from here. This restores
 * the same behaviour at the edge.
 *
 * Presence of the session cookie is all this checks -- the HMAC stays on the
 * backend, and every /api route is still gated there, so a forged cookie buys
 * access to the shell markup and nothing behind it.
 */
const SESSION_COOKIE = "phase_beta_session";

export default function middleware(request: Request) {
  // Mirrors BETA_AUTH_ENABLED on the backend. Left unset, the gate stays open
  // so local and unauthenticated deployments behave as they do today.
  if (process.env.PHASE_BETA_AUTH_ENABLED !== "true") {
    return next();
  }

  const cookie = request.headers.get("cookie") || "";
  const hasSession = cookie
    .split(";")
    .some((entry) => entry.trim().startsWith(`${SESSION_COOKIE}=`));

  if (hasSession) {
    return next();
  }

  // Relative, so it lands on /login here and is rewritten to the backend --
  // which keeps the sign-in cookie scoped to this domain.
  const url = new URL(request.url);
  const target = new URL("/login", url.origin);
  target.searchParams.set("next", url.pathname + url.search);
  return Response.redirect(target, 303);
}

export const config = {
  // Only the HTML entry points. Assets and /api are left to the CDN and the
  // backend's own gate, so this costs nothing on the hot paths.
  matcher: ["/", "/share", "/lyrics-shader-lab", "/canvas"],
};
