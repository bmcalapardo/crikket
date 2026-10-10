import { afterEach, describe, expect, test } from "bun:test"

// The page world can post anything to window, so the content-script queue
// must stay bounded when a page floods it.
describe("debugger content bridge: flood", () => {
  const sent: unknown[][] = []
  const originalChrome = (globalThis as { chrome?: unknown }).chrome

  afterEach(() => {
    ;(globalThis as { chrome?: unknown }).chrome = originalChrome
  })

  test("100k forged events never queue unbounded", async () => {
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: (
          message: { payload: { events: unknown[] } },
          cb: (r: unknown) => void
        ) => {
          sent.push(message.payload.events)
          cb({ ok: true, data: undefined })
        },
      },
    }
    const { setupDebuggerContentBridge } = await import(
      "../lib/bug-report-debugger/content"
    )
    setupDebuggerContentBridge()

    const total = 100_000
    for (let i = 0; i < total; i += 1000) {
      const events = Array.from({ length: 1000 }, (_, j) => ({ n: i + j }))
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { source: "CRIKKET_DEBUGGER_PAGE_BRIDGE", events },
          source: window,
        })
      )
    }
    let last = -1
    while (sent.length !== last) {
      last = sent.length
      await new Promise((r) => setTimeout(r, 400))
    }
    const forwarded = sent.reduce((n, b) => n + b.length, 0)
    expect(sent.every((b) => b.length <= 40)).toBe(true)
    expect(forwarded).toBeLessThanOrEqual(1100)
  })
})
