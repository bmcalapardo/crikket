import { beforeEach, describe, expect, test } from "bun:test"
import { DEBUGGER_SESSIONS_STORAGE_KEY } from "@crikket/capture-core/debugger/constants"
import { createDebuggerSessionStore } from "../lib/bug-report-debugger/engine/background/session-store"

let storage: Record<string, unknown> = {}
let openTabIds: number[] = []

function installFakeChrome() {
  storage = {}
  openTabIds = []
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
          storage = { ...storage, ...items }
          return Promise.resolve()
        },
        remove: (keys: string[]) => {
          for (const key of keys) delete storage[key]
          return Promise.resolve()
        },
      },
    },
    tabs: {
      query: async () => openTabIds.map((id) => ({ id })),
    },
  }
}

const waitForPersist = () => new Promise((resolve) => setTimeout(resolve, 300))

function persistedSessions() {
  return (storage[DEBUGGER_SESSIONS_STORAGE_KEY] ?? []) as Array<{
    sessionId: string
    captureTabId: number
  }>
}

function storedSession(sessionId: string, captureTabId: number) {
  return {
    sessionId,
    captureTabId,
    captureType: "screenshot",
    startedAt: 1,
    recordingStartedAt: 1,
    events: [],
  }
}

describe("debugger session store", () => {
  beforeEach(() => installFakeChrome())

  test("starting a new capture on a tab drops that tab's previous session", async () => {
    openTabIds = [1]
    const store = createDebuggerSessionStore()

    const first = await store.startSession({
      captureTabId: 1,
      captureType: "screenshot",
    })
    const second = await store.startSession({
      captureTabId: 1,
      captureType: "screenshot",
    })
    await waitForPersist()

    expect(persistedSessions().map((session) => session.sessionId)).toEqual([
      second.sessionId,
    ])
    expect(await store.getSessionSnapshot(first.sessionId)).toBeNull()
  })

  test("closing the captured tab leaves no sessions behind after repeated captures", async () => {
    openTabIds = [1]
    const store = createDebuggerSessionStore()

    for (let attempt = 0; attempt < 4; attempt++) {
      await store.startSession({ captureTabId: 1, captureType: "screenshot" })
    }
    await store.discardSessionByTabId(1)
    await waitForPersist()

    expect(persistedSessions()).toEqual([])
  })

  test("sessions for tabs that no longer exist are pruned on load", async () => {
    storage[DEBUGGER_SESSIONS_STORAGE_KEY] = [
      storedSession("stale", 41),
      storedSession("live", 7),
    ]
    openTabIds = [7]
    const store = createDebuggerSessionStore()

    expect(await store.getSessionSnapshot("stale")).toBeNull()
    expect(await store.getSessionSnapshot("live")).not.toBeNull()
    await waitForPersist()

    expect(persistedSessions().map((session) => session.sessionId)).toEqual([
      "live",
    ])
  })
})
