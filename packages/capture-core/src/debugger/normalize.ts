import {
  MAX_NETWORK_BODY_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_URL_LENGTH,
} from "./constants"
import {
  isRedactableEntry,
  REDACTED_VALUE,
  redactBody,
  redactHeaderValue,
  redactText,
  redactUrl,
} from "./redaction"
import type { DebuggerEvent, StoredDebuggerSession } from "./types"

export interface StoredReplayBuffer {
  tabId: number
  lastTouchedAt: number
  events: DebuggerEvent[]
}

export function normalizeStoredSession(
  value: unknown
): StoredDebuggerSession | null {
  if (!isRecord(value)) return null

  const sessionId = asOptionalString(value.sessionId)
  const captureTabId = asOptionalNumber(value.captureTabId)
  const captureType = value.captureType
  const startedAt = asOptionalNumber(value.startedAt)
  const recordingStartedAt =
    value.recordingStartedAt === null
      ? null
      : asOptionalNumber(value.recordingStartedAt)

  if (!sessionId || captureTabId === undefined || startedAt === undefined) {
    return null
  }

  if (captureType !== "video" && captureType !== "screenshot") {
    return null
  }

  const events = Array.isArray(value.events)
    ? value.events.map(normalizeDebuggerEvent).filter(isDefined)
    : []

  return {
    sessionId,
    captureTabId,
    captureType,
    startedAt,
    recordingStartedAt: recordingStartedAt ?? null,
    events,
  }
}

export function normalizeDebuggerEvent(value: unknown): DebuggerEvent | null {
  if (!isRecord(value)) return null

  const kind = value.kind
  if (kind !== "action" && kind !== "console" && kind !== "network") {
    return null
  }

  const timestamp = asOptionalNumber(value.timestamp)
  if (timestamp === undefined) return null

  if (kind === "action") {
    const actionType = asOptionalString(value.actionType)
    if (!actionType) return null

    return {
      kind,
      timestamp,
      actionType,
      target: asOptionalString(value.target, MAX_TEXT_LENGTH),
      metadata: sanitizeRecord(value.metadata),
    }
  }

  if (kind === "console") {
    const level = value.level
    if (
      level !== "log" &&
      level !== "info" &&
      level !== "warn" &&
      level !== "error" &&
      level !== "debug"
    ) {
      return null
    }

    const message = asRedactedString(value.message, MAX_TEXT_LENGTH, redactText)
    if (!message) return null

    return {
      kind,
      timestamp,
      level,
      message,
      metadata: sanitizeRecord(value.metadata),
    }
  }

  const method = asOptionalString(value.method, 20)
  const url = asRedactedString(value.url, MAX_URL_LENGTH, redactUrl)
  if (!(method && url)) return null

  const requestHeaders = sanitizeHeaders(value.requestHeaders)
  const responseHeaders = sanitizeHeaders(value.responseHeaders)

  return {
    kind,
    timestamp,
    method,
    url,
    status: asOptionalNumber(value.status),
    duration: asOptionalNumber(value.duration),
    requestHeaders,
    responseHeaders,
    requestBody: asRedactedString(
      value.requestBody,
      MAX_NETWORK_BODY_LENGTH,
      (body) => redactBody(body, requestHeaders?.["content-type"])
    ),
    responseBody: asRedactedString(
      value.responseBody,
      MAX_NETWORK_BODY_LENGTH,
      (body) => redactBody(body, responseHeaders?.["content-type"])
    ),
  }
}

function sanitizeHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined

  const result: Record<string, string> = {}

  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") continue

    const normalizedKey = key.trim().toLowerCase()
    if (!normalizedKey || shouldHideHeader(normalizedKey)) {
      continue
    }

    result[normalizedKey.slice(0, 120)] = redactHeaderValue(
      normalizedKey,
      headerValue
    ).slice(0, 500)
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function shouldHideHeader(headerName: string): boolean {
  return headerName.includes("debugger")
}

function sanitizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined

  const result: Record<string, unknown> = {}

  for (const [key, entryValue] of Object.entries(value)) {
    const normalized = isRedactableEntry(key, entryValue)
      ? REDACTED_VALUE
      : sanitizeJsonValue(entryValue)
    if (normalized === undefined) continue
    result[key.slice(0, 120)] = normalized
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return undefined

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value
  }

  if (typeof value === "string") {
    return redactText(value).slice(0, MAX_TEXT_LENGTH)
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((entry) => sanitizeJsonValue(entry, depth + 1))
      .filter(isDefined)
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {}

    for (const [key, entryValue] of Object.entries(value).slice(0, 30)) {
      const normalized = isRedactableEntry(key, entryValue)
        ? REDACTED_VALUE
        : sanitizeJsonValue(entryValue, depth + 1)
      if (normalized === undefined) continue
      result[key.slice(0, 120)] = normalized
    }

    return result
  }

  return undefined
}

function asOptionalString(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH
): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  return trimmed.slice(0, maxLength)
}

function asRedactedString(
  value: unknown,
  maxLength: number,
  redact: (value: string) => string
): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  // Bridged events are untrusted and unbounded, so cap the input before the
  // redaction pass; redaction masks a value cut off at the cap, and the
  // final slice applies the real limit.
  return redact(trimmed.slice(0, maxLength * 2)).slice(0, maxLength)
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }

  return Math.floor(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDefined<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined
}

export function isRecordLike(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
}

export function normalizeStoredReplayBuffer(
  value: unknown
): StoredReplayBuffer | null {
  if (!isRecord(value)) return null

  const tabId = asOptionalNumber(value.tabId)
  const lastTouchedAt = asOptionalNumber(value.lastTouchedAt)
  if (
    tabId === undefined ||
    tabId < 0 ||
    lastTouchedAt === undefined ||
    lastTouchedAt < 0
  ) {
    return null
  }

  const events = Array.isArray(value.events)
    ? value.events.map(normalizeDebuggerEvent).filter(isDefined)
    : []

  return {
    tabId,
    lastTouchedAt,
    events,
  }
}
