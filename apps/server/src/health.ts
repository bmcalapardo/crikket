// GET /health reports which build is deployed so a release can be checked
// before testers download it. It never touches the database or the session,
// so it answers even when those are down; use it for "is this the right
// build", not for dependency health.
export const UNKNOWN = "unknown"

export interface HealthSource {
  APP_VERSION?: string
  GIT_COMMIT_SHA?: string
  VERCEL_GIT_COMMIT_SHA?: string
}

export interface HealthPayload {
  commit: string
  status: "ok"
  version: string
}

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

// Version: APP_VERSION. Commit: GIT_COMMIT_SHA, then Vercel's
// VERCEL_GIT_COMMIT_SHA. Anything not configured reports "unknown" and the
// endpoint still answers 200: a missing label must not take the server down.
export function buildHealthPayload(source: HealthSource): HealthPayload {
  return {
    status: "ok",
    version: clean(source.APP_VERSION) ?? UNKNOWN,
    commit:
      clean(source.GIT_COMMIT_SHA) ??
      clean(source.VERCEL_GIT_COMMIT_SHA) ??
      UNKNOWN,
  }
}

export function handleHealth(source: HealthSource): Response {
  return new Response(JSON.stringify(buildHealthPayload(source)), {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  })
}
