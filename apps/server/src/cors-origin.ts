import type { MiddlewareHandler } from "hono"

// Embed capture routes are called from customer sites, so any origin may
// reach them; tokens and public keys guard them instead of CORS.
const OPEN_EMBED_PATHS = new Set([
  "/api/embed/capture-token",
  "/api/embed/bug-report-upload-session",
  "/api/embed/bug-report-finalize",
])

// Browser extension origins: Chromium uses a fixed ID per build, Firefox a
// random UUID per install, so neither can be listed in CORS_ORIGINS.
const EXTENSION_ORIGIN_PREFIXES = ["chrome-extension://", "moz-extension://"]

export function resolveCorsOrigin(
  origin: string,
  path: string,
  options: { allowedOrigins: string[]; fallbackOrigin: string }
): string {
  if (OPEN_EMBED_PATHS.has(path) && origin.trim().length > 0) {
    return origin
  }
  if (options.allowedOrigins.includes(origin)) {
    return origin
  }
  if (EXTENSION_ORIGIN_PREFIXES.some((prefix) => origin.startsWith(prefix))) {
    return origin
  }
  return options.fallbackOrigin
}

// Cookie-authenticated routes use SameSite=None in production, so a browser
// attaches the session cookie to cross-site requests. A simple cross-site POST
// (no Content-Type, or text/plain) skips the CORS preflight and reaches
// oRPC, which parses a missing Content-Type as JSON. Browsers always send
// Origin on such requests, so refusing any Origin we would not reflect closes
// the hole. Requests without Origin (server-side, curl) are not browser-CSRF.
export function isTrustedRpcOrigin(
  origin: string | null | undefined,
  allowedOrigins: string[]
): boolean {
  if (origin === null || origin === undefined) {
    return true
  }
  return (
    allowedOrigins.includes(origin) ||
    EXTENSION_ORIGIN_PREFIXES.some((prefix) => origin.startsWith(prefix))
  )
}

export function createRpcOriginGuard(
  allowedOrigins: string[]
): MiddlewareHandler {
  return async (c, next) => {
    if (!isTrustedRpcOrigin(c.req.header("origin"), allowedOrigins)) {
      return c.json({ code: "FORBIDDEN", message: "Untrusted origin." }, 403)
    }
    await next()
  }
}
