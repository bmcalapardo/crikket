import type { ErrorLogEntry } from "./error-log"
import type { CaptureKind, LastCapture } from "./last-capture"

export const CHECK_IDS = [
  "extension-version",
  "build-identifier",
  "api-connectivity",
  "authentication-state",
  "screenshot-availability",
  "recording-availability",
  "debugger-capture-availability",
  "storage-availability",
  "last-error",
] as const

export type CheckId = (typeof CHECK_IDS)[number]

export type CheckStatus = "pass" | "warn" | "fail"

export interface CheckResult {
  id: CheckId
  label: string
  status: CheckStatus
  // One line a tester can act on or paste into a message.
  summary: string
}

export interface HttpEcho {
  status: number
  contentType?: string
  body: string
}

export type CapabilityName = "screenshot" | "recording" | "debugger"

// Everything a check reads from the outside world. The real implementation
// wraps chrome.* and fetch; tests pass plain objects.
export interface DiagnosticsEnvironment {
  version: string
  buildSha: string
  appUrl: string
  // Resolves with the response even for a non-2xx status; rejects only when
  // nothing answered. Must honour the abort signal.
  probeApi: (signal: AbortSignal) => Promise<HttpEcho>
  probeSession: (signal: AbortSignal) => Promise<HttpEcho>
  // Names of the browser APIs a capability needs that this browser lacks.
  missingApis: (capability: CapabilityName) => string[]
  probeStorage: () => Promise<void>
  getLastCapture: () => Promise<LastCapture>
  listErrors: () => Promise<ErrorLogEntry[]>
}

export interface DiagnosticsReport {
  checks: CheckResult[]
  // The last answers the API and session endpoints gave, for the bundle.
  apiEcho?: HttpEcho
  sessionEcho?: HttpEcho
}

export const DEFAULT_CHECK_TIMEOUT_MS = 5000

const LABELS: Record<CheckId, string> = {
  "extension-version": "Extension version",
  "build-identifier": "Build identifier",
  "api-connectivity": "API connectivity",
  "authentication-state": "Authentication",
  "screenshot-availability": "Screenshot availability",
  "recording-availability": "Recording availability",
  "debugger-capture-availability": "Debugger capture availability",
  "storage-availability": "Storage availability",
  "last-error": "Last error",
}

const QUOTA_PATTERN = /quota/i

class CheckTimeoutError extends Error {}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new CheckTimeoutError(`No answer within ${timeoutMs} ms`))
    }, timeoutMs)
  })
  try {
    // The race is built inside the try so a synchronous throw from run()
    // still clears the timer.
    return await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}

const result = (
  id: CheckId,
  status: CheckStatus,
  summary: string
): CheckResult => ({ id, label: LABELS[id], status, summary })

function formatTimeout(timeoutMs: number): string {
  return `${Math.round(timeoutMs / 100) / 10}s`
}

function describeUnreachable(
  target: string,
  error: unknown,
  timeoutMs: number
): string {
  if (error instanceof CheckTimeoutError) {
    return `${target} did not answer within ${formatTimeout(timeoutMs)}. The server may be down or very slow.`
  }
  return `Could not reach ${target}. Check your connection and that the app URL is right.`
}

async function checkApi(
  env: DiagnosticsEnvironment,
  timeoutMs: number,
  report: DiagnosticsReport
): Promise<CheckResult> {
  try {
    const echo = await withTimeout(env.probeApi, timeoutMs)
    report.apiEcho = echo
    if (echo.contentType?.includes("text/html")) {
      return result(
        "api-connectivity",
        "fail",
        `${env.appUrl} returned a web page instead of an API response. Sign in to Crikket in a browser tab, or check the app URL.`
      )
    }
    if (echo.status >= 500) {
      return result(
        "api-connectivity",
        "fail",
        `Crikket answered with a server error (HTTP ${echo.status}). The service is having trouble; try again shortly.`
      )
    }
    if (echo.status >= 400) {
      return result(
        "api-connectivity",
        "fail",
        `Crikket rejected the request (HTTP ${echo.status}). The app URL may be wrong for this build.`
      )
    }
    return result(
      "api-connectivity",
      "pass",
      `Reached ${env.appUrl} (HTTP ${echo.status}).`
    )
  } catch (error) {
    return result(
      "api-connectivity",
      "fail",
      describeUnreachable(env.appUrl, error, timeoutMs)
    )
  }
}

async function checkAuth(
  env: DiagnosticsEnvironment,
  timeoutMs: number,
  report: DiagnosticsReport
): Promise<CheckResult> {
  try {
    const echo = await withTimeout(env.probeSession, timeoutMs)
    report.sessionEcho = echo
    if (echo.status >= 500 || echo.contentType?.includes("text/html")) {
      return result(
        "authentication-state",
        "fail",
        "Could not read the sign-in state because Crikket did not answer properly."
      )
    }
    let signedIn = false
    try {
      const parsed = JSON.parse(echo.body) as { user?: unknown } | null
      signedIn = Boolean(parsed?.user)
    } catch {
      signedIn = false
    }
    return signedIn
      ? result("authentication-state", "pass", "Signed in to Crikket.")
      : result(
          "authentication-state",
          "fail",
          "Not signed in, or the session expired. Open Crikket in a browser tab and sign in."
        )
  } catch (error) {
    return result(
      "authentication-state",
      "fail",
      describeUnreachable(env.appUrl, error, timeoutMs)
    )
  }
}

function formatCaptureTime(at: number | undefined): string {
  return at === undefined
    ? "No capture has succeeded yet."
    : `Last capture succeeded at ${new Date(at).toISOString()}.`
}

async function checkCapability(
  env: DiagnosticsEnvironment,
  timeoutMs: number,
  spec: {
    id: CheckId
    capability: CapabilityName
    noun: string
    captureKind?: CaptureKind
  }
): Promise<CheckResult> {
  const { id, capability, noun, captureKind } = spec
  const missing = env.missingApis(capability)
  if (missing.length > 0) {
    return result(
      id,
      "fail",
      `${noun} is unavailable in this browser: missing ${missing.join(", ")}.`
    )
  }
  if (!captureKind) {
    return result(id, "pass", `${noun} APIs are present.`)
  }
  try {
    const last = await withTimeout(() => env.getLastCapture(), timeoutMs)
    return result(
      id,
      "pass",
      `${noun} APIs are present. ${formatCaptureTime(last[captureKind])}`
    )
  } catch {
    // The timestamp is extra information; the API-presence verdict stands.
    return result(id, "pass", `${noun} APIs are present.`)
  }
}

async function checkStorage(
  env: DiagnosticsEnvironment,
  timeoutMs: number
): Promise<CheckResult> {
  try {
    await withTimeout(() => env.probeStorage(), timeoutMs)
    return result("storage-availability", "pass", "Extension storage works.")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return QUOTA_PATTERN.test(message)
      ? result(
          "storage-availability",
          "fail",
          "Extension storage is full. Submit or discard pending drafts, or clear Crikket's site data."
        )
      : result(
          "storage-availability",
          "fail",
          "Extension storage is unavailable, so drafts and captures cannot be kept."
        )
  }
}

async function checkLastError(
  env: DiagnosticsEnvironment,
  timeoutMs: number
): Promise<CheckResult> {
  try {
    const errors = await withTimeout(() => env.listErrors(), timeoutMs)
    const last = errors.at(-1)
    return last
      ? result(
          "last-error",
          "warn",
          `${last.context}: ${last.message} (${errors.length} recent)`
        )
      : result("last-error", "pass", "No errors recorded.")
  } catch {
    return result("last-error", "fail", "The error log could not be read.")
  }
}

// Runs every check. A check that throws or never answers becomes a failing
// result; this function itself never rejects and never hangs.
export async function runChecks(
  env: DiagnosticsEnvironment,
  options: { timeoutMs?: number } = {}
): Promise<DiagnosticsReport> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS
  const report: DiagnosticsReport = { checks: [] }

  report.checks = await Promise.all([
    Promise.resolve(
      result("extension-version", "pass", `Version ${env.version}.`)
    ),
    Promise.resolve(
      result("build-identifier", "pass", `Build ${env.buildSha}.`)
    ),
    checkApi(env, timeoutMs, report),
    checkAuth(env, timeoutMs, report),
    checkCapability(env, timeoutMs, {
      id: "screenshot-availability",
      capability: "screenshot",
      noun: "Screenshot capture",
      captureKind: "screenshot",
    }),
    checkCapability(env, timeoutMs, {
      id: "recording-availability",
      capability: "recording",
      noun: "Recording",
      captureKind: "video",
    }),
    checkCapability(env, timeoutMs, {
      id: "debugger-capture-availability",
      capability: "debugger",
      noun: "Debugger capture",
    }),
    checkStorage(env, timeoutMs),
    checkLastError(env, timeoutMs),
  ])

  return report
}
