import {
  isRedactableEntry,
  REDACTED_VALUE,
  redactBody,
  redactStructuredValue,
  redactText,
} from "@crikket/capture-core/debugger/redaction"
import type { CheckResult, DiagnosticsReport, HttpEcho } from "./checks"
import type { ErrorLogEntry } from "./error-log"

// Values bigger than this (screenshots, debugger sessions) are summarised by
// size instead of copied into the bundle.
export const MAX_STORAGE_VALUE_BYTES = 1024
export const MAX_ECHO_BODY_LENGTH = 2000
export const MAX_STORAGE_KEYS = 200

export interface BundleInput {
  generatedAt: number
  version: string
  buildSha: string
  appUrl: string
  report: DiagnosticsReport
  errors: ErrorLogEntry[]
  storage: Record<string, unknown>
}

function sizeOf(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

// Auth-ish keys are masked by Redaction's name matching; values too big to
// read are replaced by their size.
function summariseStorage(
  storage: Record<string, unknown>
): Record<string, unknown> {
  const summary: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(storage).slice(
    0,
    MAX_STORAGE_KEYS
  )) {
    const safeKey = redactText(key).slice(0, 100)
    if (isRedactableEntry(key, value)) {
      summary[safeKey] = REDACTED_VALUE
      continue
    }
    const size = sizeOf(value)
    summary[safeKey] =
      size > MAX_STORAGE_VALUE_BYTES
        ? `[omitted: ${size} bytes]`
        : redactStructuredValue(value)
  }
  return summary
}

function redactEcho(echo: HttpEcho | undefined) {
  if (!echo) {
    return undefined
  }
  return {
    status: echo.status,
    contentType: echo.contentType,
    body: redactBody(
      echo.body.slice(0, MAX_ECHO_BODY_LENGTH),
      echo.contentType
    ),
  }
}

function redactCheck(check: CheckResult): CheckResult {
  return { ...check, summary: redactText(check.summary) }
}

// Built with the same Redaction the debugger capture uses, then the whole
// bundle goes through it once more so nothing assembled here can bypass it.
export function buildDiagnosticsBundle(input: BundleInput): string {
  const bundle = {
    generatedAt: new Date(input.generatedAt).toISOString(),
    extensionVersion: input.version,
    buildSha: input.buildSha,
    appUrl: redactText(input.appUrl),
    checks: input.report.checks.map(redactCheck),
    apiResponse: redactEcho(input.report.apiEcho),
    authStateResponse: redactEcho(input.report.sessionEcho),
    recentErrors: input.errors.map((entry) => ({
      at: new Date(entry.at).toISOString(),
      context: redactText(entry.context),
      message: redactText(entry.message),
    })),
    storage: summariseStorage(input.storage),
  }
  return JSON.stringify(redactStructuredValue(bundle), null, 2)
}
