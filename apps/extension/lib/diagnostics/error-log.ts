import { redactText } from "@crikket/capture-core/debugger/redaction"
import { addNonFatalErrorListener } from "@crikket/shared/lib/errors"

export const ERROR_LOG_STORAGE_KEY = "diagnosticsErrorLog"
export const MAX_ERROR_ENTRIES = 20
export const MAX_ERROR_MESSAGE_LENGTH = 500
export const MAX_ERROR_CONTEXT_LENGTH = 200

// Redaction runs on this much of a message before it is cut to the stored
// length, so a secret straddling the stored cut is still seen whole.
const REDACTION_WINDOW = 10_000

export interface ErrorLogEntry {
  at: number
  context: string
  message: string
}

export interface ErrorLogStorage {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
}

export interface ErrorLog {
  record: (context: string, error: unknown) => void
  list: () => Promise<ErrorLogEntry[]>
  flush: () => Promise<void>
}

function describeError(error: unknown): string {
  try {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`
    }
    if (typeof error === "string") {
      return error
    }
    return JSON.stringify(error) ?? String(error)
  } catch {
    return "[unprintable error]"
  }
}

function sanitize(value: string, maxLength: number): string {
  return redactText(value.slice(0, REDACTION_WINDOW)).slice(0, maxLength)
}

export function createErrorEntry(
  context: string,
  error: unknown,
  at: number
): ErrorLogEntry {
  return {
    at,
    context: sanitize(context, MAX_ERROR_CONTEXT_LENGTH),
    message: sanitize(describeError(error), MAX_ERROR_MESSAGE_LENGTH),
  }
}

function isEntry(value: unknown): value is ErrorLogEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ErrorLogEntry).at === "number" &&
    typeof (value as ErrorLogEntry).context === "string" &&
    typeof (value as ErrorLogEntry).message === "string"
  )
}

function parseEntries(stored: unknown): ErrorLogEntry[] {
  return Array.isArray(stored) ? stored.filter(isEntry) : []
}

// Entries are redacted before they are held anywhere, so neither memory nor
// storage ever contains the raw error. This module must not call
// reportNonFatalError: its own storage failures would feed back into it.
export function createErrorLog(options: {
  storage: ErrorLogStorage
  now?: () => number
}): ErrorLog {
  const { storage } = options
  const now = options.now ?? Date.now
  let recent: ErrorLogEntry[] = []
  let pending: ErrorLogEntry[] = []
  let inFlight: Promise<void> | undefined

  const persistPending = async () => {
    while (pending.length > 0) {
      const batch = pending
      pending = []
      try {
        const stored = parseEntries(await storage.get(ERROR_LOG_STORAGE_KEY))
        await storage.set(
          ERROR_LOG_STORAGE_KEY,
          [...stored, ...batch].slice(-MAX_ERROR_ENTRIES)
        )
      } catch {
        // Quota or unavailable storage: the in-memory view still has them.
        pending = []
        return
      }
    }
  }

  const flush = (): Promise<void> => {
    inFlight ??= persistPending().finally(() => {
      inFlight = undefined
    })
    return inFlight
  }

  return {
    record(context, error) {
      try {
        const entry = createErrorEntry(context, error, now())
        recent = [...recent, entry].slice(-MAX_ERROR_ENTRIES)
        pending = [...pending, entry].slice(-MAX_ERROR_ENTRIES)
        flush()
      } catch {
        // Recording must never throw into the code that reported the error.
      }
    },
    flush,
    async list() {
      await flush()
      try {
        const stored = parseEntries(await storage.get(ERROR_LOG_STORAGE_KEY))
        return stored.length > 0 ? stored.slice(-MAX_ERROR_ENTRIES) : recent
      } catch {
        return recent
      }
    },
  }
}

export function createChromeErrorLogStorage(): ErrorLogStorage {
  return {
    get: async (key) => (await chrome.storage.local.get([key]))[key],
    set: (key, value) => chrome.storage.local.set({ [key]: value }),
  }
}

let installed: ErrorLog | undefined

// Feeds every reportNonFatalError in this extension context into the shared
// ring buffer. Idempotent, so every entrypoint can call it.
export function installErrorLog(): ErrorLog {
  if (!installed) {
    installed = createErrorLog({ storage: createChromeErrorLogStorage() })
    const log = installed
    addNonFatalErrorListener((context, error) => log.record(context, error))
  }
  return installed
}
