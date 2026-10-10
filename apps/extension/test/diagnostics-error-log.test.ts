import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  addNonFatalErrorListener,
  reportNonFatalError,
} from "@crikket/shared/lib/errors"
import {
  createErrorLog,
  ERROR_LOG_STORAGE_KEY,
  type ErrorLogEntry,
  type ErrorLogStorage,
  MAX_ERROR_ENTRIES,
  MAX_ERROR_MESSAGE_LENGTH,
} from "../lib/diagnostics/error-log"

const SECRET = "SUPERSECRETVALUE123"

const originalWarn = console.warn
let warnings: unknown[][] = []

beforeEach(() => {
  warnings = []
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
})

afterEach(() => {
  console.warn = originalWarn
})

function memoryStorage(options: { maxEntriesSeen?: { value: number } } = {}) {
  const data = new Map<string, unknown>()
  const calls = { get: 0, set: 0 }
  const storage: ErrorLogStorage = {
    get: (key) => {
      calls.get++
      return Promise.resolve(data.get(key))
    },
    set: (key, value) => {
      calls.set++
      if (Array.isArray(value) && options.maxEntriesSeen) {
        options.maxEntriesSeen.value = Math.max(
          options.maxEntriesSeen.value,
          value.length
        )
      }
      data.set(key, value)
      return Promise.resolve()
    },
  }
  return { storage, data, calls }
}

const stored = (data: Map<string, unknown>) =>
  (data.get(ERROR_LOG_STORAGE_KEY) ?? []) as ErrorLogEntry[]

describe("error log ring buffer", () => {
  test("keeps the most recent errors, oldest first", async () => {
    const { storage } = memoryStorage()
    const log = createErrorLog({ storage, now: () => 42 })

    for (let i = 0; i < 25; i++) {
      log.record(`context ${i}`, new Error(`failure ${i}`))
    }
    const entries = await log.list()

    expect(entries).toHaveLength(MAX_ERROR_ENTRIES)
    expect(entries[0]?.context).toBe("context 5")
    expect(entries.at(-1)).toEqual({
      at: 42,
      context: "context 24",
      message: "Error: failure 24",
    })
  })

  test("is fed by reportNonFatalError through the shared listener", async () => {
    const { storage } = memoryStorage()
    const log = createErrorLog({ storage })
    const remove = addNonFatalErrorListener((context, error) =>
      log.record(context, error)
    )

    reportNonFatalError("Failed to open popup", new Error("no window"))
    remove()
    reportNonFatalError("After unsubscribe", new Error("ignored"))
    const entries = await log.list()

    expect(entries.map((entry) => entry.context)).toEqual([
      "Failed to open popup",
    ])
  })

  test("a throwing listener never breaks reportNonFatalError", () => {
    const remove = addNonFatalErrorListener(() => {
      throw new Error("listener bug")
    })

    expect(() => reportNonFatalError("ctx", "oops")).not.toThrow()
    remove()
  })

  test("describes non-Error values without throwing", async () => {
    const { storage } = memoryStorage()
    const log = createErrorLog({ storage })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const hostile = {
      toString() {
        throw new Error("no")
      },
      toJSON() {
        throw new Error("no")
      },
    }

    log.record("string", "plain text")
    log.record("object", { code: 7 })
    log.record("cyclic", cyclic)
    log.record("hostile", hostile)
    log.record("undefined", undefined)
    const messages = (await log.list()).map((entry) => entry.message)

    expect(messages[0]).toBe("plain text")
    expect(messages[1]).toBe('{"code":7}')
    expect(messages[2]).toBe("[unprintable error]")
    expect(messages[3]).toBe("[unprintable error]")
    expect(messages).toHaveLength(5)
  })
})

describe("error log redaction", () => {
  const leaks: [string, string, unknown][] = [
    ["token in a message", "ctx", new Error(`Bad request token=${SECRET} end`)],
    [
      "bearer header echoed in a message",
      "ctx",
      new Error(`Upstream said: Authorization: Bearer ${SECRET}`),
    ],
    [
      "URL with token query params",
      "ctx",
      new Error(
        `GET https://api.test/cb?code=1&access_token=${SECRET}&state=ok failed`
      ),
    ],
    [
      "JSON body with an auth key",
      "ctx",
      new Error(`Response: {"session_token":"${SECRET}","ok":false}`),
    ],
    ["secret in the context string", `fetch?api_key=${SECRET}`, "x"],
    ["secret in a plain string error", "ctx", `password=${SECRET}`],
    ["secret in a thrown object", "ctx", { apiKey: SECRET }],
  ]

  for (const [name, context, error] of leaks) {
    test(`never stores a secret: ${name}`, async () => {
      const { storage, data } = memoryStorage()
      const log = createErrorLog({ storage })

      log.record(context, error)
      const listed = JSON.stringify(await log.list())

      expect(listed).not.toContain(SECRET)
      expect(JSON.stringify(stored(data))).not.toContain(SECRET)
    })
  }

  test("a secret straddling the stored length cut is still removed", async () => {
    const { storage } = memoryStorage()
    const log = createErrorLog({ storage })
    const padding = "x".repeat(MAX_ERROR_MESSAGE_LENGTH - 20)

    log.record("ctx", new Error(`${padding} token=${SECRET}`))
    const [entry] = await log.list()

    expect(entry?.message).not.toContain("SUPERSECRET")
    expect(entry?.message.length).toBeLessThanOrEqual(MAX_ERROR_MESSAGE_LENGTH)
  })
})

describe("error log stress", () => {
  test("thousands of rapid reports never push storage past the cap", async () => {
    const maxEntriesSeen = { value: 0 }
    const { storage, data, calls } = memoryStorage({ maxEntriesSeen })
    const log = createErrorLog({ storage })
    const remove = addNonFatalErrorListener((context, error) =>
      log.record(context, error)
    )

    for (let i = 0; i < 5000; i++) {
      reportNonFatalError(
        `burst ${i}`,
        new Error(`failure ${i} token=${SECRET}`)
      )
    }
    remove()
    const entries = await log.list()

    expect(entries).toHaveLength(MAX_ERROR_ENTRIES)
    expect(entries.at(-1)?.context).toBe("burst 4999")
    expect(stored(data)).toHaveLength(MAX_ERROR_ENTRIES)
    expect(maxEntriesSeen.value).toBeLessThanOrEqual(MAX_ERROR_ENTRIES)
    expect(JSON.stringify(entries)).not.toContain(SECRET)
    // Writes are coalesced instead of one per error.
    expect(calls.set).toBeLessThan(50)
  })

  test("huge messages are bounded and quick", async () => {
    const { storage, data } = memoryStorage()
    const log = createErrorLog({ storage })
    const started = Date.now()

    for (let i = 0; i < 30; i++) {
      log.record("huge", new Error(`token=${SECRET} ${"y".repeat(5_000_000)}`))
    }
    const entries = await log.list()

    expect(Date.now() - started).toBeLessThan(3000)
    expect(entries).toHaveLength(MAX_ERROR_ENTRIES)
    for (const entry of entries) {
      expect(entry.message.length).toBeLessThanOrEqual(MAX_ERROR_MESSAGE_LENGTH)
    }
    expect(JSON.stringify(stored(data)).length).toBeLessThan(20_000)
    expect(JSON.stringify(entries)).not.toContain(SECRET)
  })
})

describe("error log when storage misbehaves", () => {
  test("a full quota keeps errors in memory and stays quiet", async () => {
    const log = createErrorLog({
      storage: {
        get: () => Promise.resolve(undefined),
        set: () =>
          Promise.reject(new Error("Resource::kQuotaBytes quota exceeded")),
      },
    })

    expect(() => log.record("ctx", new Error("first"))).not.toThrow()
    log.record("ctx", new Error("second"))
    const entries = await log.list()

    expect(entries.map((entry) => entry.message)).toEqual([
      "Error: first",
      "Error: second",
    ])
    // It must not report its own failure, which would feed back into itself.
    expect(warnings).toHaveLength(0)
  })

  test("unavailable storage (get throws synchronously) does not break recording", async () => {
    const log = createErrorLog({
      storage: {
        get: () => {
          throw new Error("chrome.storage is undefined")
        },
        set: () => {
          throw new Error("chrome.storage is undefined")
        },
      },
    })

    for (let i = 0; i < 1000; i++) {
      log.record("ctx", new Error(`e${i}`))
    }
    const entries = await log.list()

    expect(entries).toHaveLength(MAX_ERROR_ENTRIES)
    expect(entries.at(-1)?.message).toBe("Error: e999")
    expect(warnings).toHaveLength(0)
  })

  test("corrupt stored data is ignored rather than trusted", async () => {
    const { storage, data } = memoryStorage()
    data.set(ERROR_LOG_STORAGE_KEY, [
      "junk",
      null,
      { at: "x" },
      { at: 1, context: "ok", message: "kept" },
    ])
    const log = createErrorLog({ storage })

    expect(await log.list()).toEqual([
      { at: 1, context: "ok", message: "kept" },
    ])
  })
})
