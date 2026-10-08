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
