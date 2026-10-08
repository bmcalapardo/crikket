import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { DEBUGGER_SESSIONS_STORAGE_KEY } from "@crikket/capture-core/debugger/constants"
import { createDebuggerSessionStore } from "../lib/bug-report-debugger/engine/background/session-store"

// chrome.storage.local QUOTA_BYTES without the unlimitedStorage permission.
const QUOTA_BYTES = 10_485_760
const QUOTA_ERROR = "Resource::kQuotaBytes quota exceeded"

let storage: Record<string, unknown> = {}
let openTabIds: number[] = []
let warnings: string[] = []
const originalWarn = console.warn

// Chrome counts each item as key length + JSON-serialised value length.
function bytesOf(items: Record<string, unknown>) {
  let total = 0
  for (const [key, value] of Object.entries(items)) {
    total += key.length + JSON.stringify(value).length
  }
  return total
}

function installQuotaEnforcingChrome() {
  storage = {}
  openTabIds = []
  warnings = []
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "))
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string[]) =>
          Object.fromEntries(
            keys
              .filter((key) => key in storage)
              .map((key) => [key, storage[key]])
          ),
        set: (items: Record<string, unknown>) => {
          const next = { ...storage, ...items }
          if (bytesOf(next) > QUOTA_BYTES) {
            return Promise.reject(new Error(QUOTA_ERROR))
          }
          storage = next
          return Promise.resolve()
        },
        remove: (keys: string[]) => {
          for (const key of keys) delete storage[key]
          return Promise.resolve()
        },
      },
    },
    tabs: { query: async () => openTabIds.map((id) => ({ id })) },
    scripting: { executeScript: async () => [] },
  }
}

const setStorage = (items: Record<string, unknown>) =>
  (
    globalThis as unknown as {
      chrome: { storage: { local: { set: (i: unknown) => Promise<void> } } }
    }
  ).chrome.storage.local.set(items)

const waitForPersist = () => new Promise((resolve) => setTimeout(resolve, 300))

const quotaWarnings = () => warnings.filter((w) => w.includes(QUOTA_ERROR))

function persistedSessions() {
  return (storage[DEBUGGER_SESSIONS_STORAGE_KEY] ?? []) as Array<{
    sessionId: string
    captureTabId: number
    events: unknown[]
  }>
}

// A busy SPA: every request is distinct, carries a typical header set and
// bodies large enough to hit the 4000-char body cap. ~12 KB per event.
function networkEvent(index: number, timestamp: number) {
  const headers: Record<string, string> = {}
  for (let h = 0; h < 12; h++) headers[`x-header-${h}`] = "v".repeat(120)
  return {
    kind: "network",
    timestamp,
    method: "POST",
    url: `https://api.example.com/graphql?op=Query${index}&vars=${"a".repeat(400)}`,
    status: 200,
    duration: 120,
    requestHeaders: headers,
    responseHeaders: headers,
    requestBody: "q".repeat(4000),
    responseBody: "r".repeat(4000),
  }
}

function consoleEvent(index: number, timestamp: number) {
  return {
    kind: "console",
    timestamp,
    level: "log",
    message: `log ${index} ${"m".repeat(1990)}`,
  }
}

function networkEvents(count: number) {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) =>
    networkEvent(i, now + i * 1000)
  )
}

// ~4 MB PNG data URL, typical of captureVisibleTab on a 1080p HiDPI screen.
const screenshotDataUrl = () => `data:image/png;base64,${"A".repeat(4_000_000)}`

describe("debugger session storage quota", () => {
  beforeEach(() => installQuotaEnforcingChrome())
  afterEach(() => {
    console.warn = originalWarn
  })

  test("a long recording on a busy page persists without exceeding quota", async () => {
    openTabIds = [1]
    const store = createDebuggerSessionStore()
    await store.startSession({ captureTabId: 1, captureType: "video" })

    const now = Date.now()
    const events: unknown[] = networkEvents(1200)
    for (let i = 0; i < 800; i++) events.push(consoleEvent(i, now + i * 1000))
    await store.appendPageEvents(1, events)
    await waitForPersist()

    expect(quotaWarnings()).toEqual([])
    expect(persistedSessions()[0]?.events.length).toBeGreaterThan(0)
  })

  test("a screenshot still fits after a capture is abandoned on a busy tab", async () => {
    openTabIds = [1]
    const store = createDebuggerSessionStore()
    await store.startSession({ captureTabId: 1, captureType: "screenshot" })
    await store.appendPageEvents(1, networkEvents(600))
    await waitForPersist()

    await expect(
      setStorage({ pendingScreenshot: screenshotDataUrl() })
    ).resolves.toBeUndefined()
  })

  test("abandoned captures across many open tabs evict the oldest, keeping the newest", async () => {
    openTabIds = [1, 2, 3, 4, 5, 6, 7, 8]
    const store = createDebuggerSessionStore()

    let newest = ""
    for (const tabId of openTabIds) {
      const session = await store.startSession({
        captureTabId: tabId,
        captureType: "video",
      })
      newest = session.sessionId
      await store.appendPageEvents(tabId, networkEvents(150))
    }
    await waitForPersist()

    expect(quotaWarnings()).toEqual([])
    const persisted = persistedSessions()
    expect(persisted.map((session) => session.sessionId)).toContain(newest)
    expect(persisted.find((s) => s.sessionId === newest)?.events.length).toBe(
      150
    )
    await expect(
      setStorage({ pendingScreenshot: screenshotDataUrl() })
    ).resolves.toBeUndefined()
  })

  test("storage already over budget is trimmed when the extension starts", async () => {
    // What an older build left behind: ~10 MB of sessions on open tabs.
    openTabIds = [1, 2, 3, 4, 5, 6, 7]
    storage[DEBUGGER_SESSIONS_STORAGE_KEY] = openTabIds.map((tabId) => ({
      sessionId: `session-${tabId}`,
      captureTabId: tabId,
      captureType: "video",
      startedAt: tabId,
      recordingStartedAt: tabId,
      events: networkEvents(120),
    }))
    expect(bytesOf(storage)).toBeGreaterThan(9_000_000)

    const store = createDebuggerSessionStore()
    expect(await store.getSessionSnapshot("session-7")).not.toBeNull()
    await waitForPersist()

    await expect(
      setStorage({ pendingScreenshot: screenshotDataUrl() })
    ).resolves.toBeUndefined()
  })
})
