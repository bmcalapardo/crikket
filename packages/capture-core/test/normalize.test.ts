import { describe, expect, it } from "bun:test"

import { MAX_NETWORK_BODY_LENGTH } from "../src/debugger/constants"
import {
  normalizeDebuggerEvent,
  normalizeStoredReplayBuffer,
  normalizeStoredSession,
} from "../src/debugger/normalize"

describe("debugger normalization regression", () => {
  it("sanitizes network events, masks secret headers and strips debugger headers", () => {
    const event = normalizeDebuggerEvent({
      kind: "network",
      timestamp: 1234.9,
      method: " POST ",
      url: " https://example.com/api/report ",
      status: 201.8,
      duration: 456.9,
      requestHeaders: {
        Authorization: "Bearer token",
        "X-Debugger-Trace": "remove-me",
      },
      responseHeaders: {
        "Content-Type": "application/json",
      },
      requestBody: "x".repeat(5000),
      responseBody: "y".repeat(5000),
    })

    expect(event).toEqual({
      kind: "network",
      timestamp: 1234,
      method: "POST",
      url: "https://example.com/api/report",
      status: 201,
      duration: 456,
      requestHeaders: {
        authorization: "Bearer [REDACTED]",
      },
      responseHeaders: {
        "content-type": "application/json",
      },
      requestBody: "x".repeat(4000),
      responseBody: "y".repeat(4000),
    })
  })

  // The page bridge is a window message, so anything on the page can post an
  // event that never went through page instrumentation's filter.
  it("redacts secrets in events that skipped page instrumentation", () => {
    const network = normalizeDebuggerEvent({
      kind: "network",
      timestamp: 1,
      method: "POST",
      url: "https://example.com/login?api_key=abc",
      requestHeaders: {
        Cookie: "sid=abc123",
        "Content-Type": "text/plain",
      },
      requestBody: '{"username":"tester","password":"hunter2"}',
    })

    expect(network).toEqual({
      kind: "network",
      timestamp: 1,
      method: "POST",
      url: "https://example.com/login?api_key=[REDACTED]",
      status: undefined,
      duration: undefined,
      requestHeaders: {
        cookie: "sid=[REDACTED]",
        "content-type": "text/plain",
      },
      responseHeaders: undefined,
      requestBody: '{"username":"tester","password":"[REDACTED]"}',
      responseBody: undefined,
    })

    const log = normalizeDebuggerEvent({
      kind: "console",
      timestamp: 2,
      level: "warn",
      message: "retrying with authorization: Bearer abc.def.ghi",
      metadata: { refreshToken: "r-1", attempt: 2 },
    })

    expect(log).toEqual({
      kind: "console",
      timestamp: 2,
      level: "warn",
      message: "retrying with authorization: Bearer [REDACTED]",
      metadata: { refreshToken: "[REDACTED]", attempt: 2 },
    })
  })

  it("drops invalid events and sanitizes stored sessions recursively", () => {
    const session = normalizeStoredSession({
      sessionId: " session_1 ",
      captureTabId: 42.9,
      captureType: "video",
      startedAt: 1000.6,
      recordingStartedAt: 1500.4,
      events: [
        {
          kind: "action",
          timestamp: 1100.8,
          actionType: "click",
          target: "button.submit",
          metadata: {
            nested: {
              ok: true,
              tooDeep: {
                keep: {
                  butDropThisLevel: {
                    evenDeeper: {
                      value: "nope",
                    },
                  },
                },
              },
            },
          },
        },
        {
          kind: "console",
          timestamp: 1200,
          level: "warn",
          message: " warn message ",
        },
        {
          kind: "wat",
          timestamp: 1300,
        },
      ],
    })

    expect(session).toEqual({
      sessionId: "session_1",
      captureTabId: 42,
      captureType: "video",
      startedAt: 1000,
      recordingStartedAt: 1500,
      events: [
        {
          kind: "action",
          timestamp: 1100,
          actionType: "click",
          target: "button.submit",
          metadata: {
            nested: {
              ok: true,
              tooDeep: {
                keep: {
                  butDropThisLevel: {},
                },
              },
            },
          },
        },
        {
          kind: "console",
          timestamp: 1200,
          level: "warn",
          message: "warn message",
          metadata: undefined,
        },
      ],
    })
  })

  it("normalizes replay buffers and rejects invalid storage data", () => {
    expect(
      normalizeStoredReplayBuffer({
        tabId: 7.9,
        lastTouchedAt: 999.4,
        events: [
          {
            kind: "console",
            timestamp: 1000.3,
            level: "info",
            message: " buffered ",
          },
          {
            kind: "network",
            timestamp: "bad",
          },
        ],
      })
    ).toEqual({
      tabId: 7,
      lastTouchedAt: 999,
      events: [
        {
          kind: "console",
          timestamp: 1000,
          level: "info",
          message: "buffered",
          metadata: undefined,
        },
      ],
    })

    expect(
      normalizeStoredSession({
        sessionId: "session_2",
        captureTabId: "bad",
        captureType: "video",
        startedAt: 1,
      })
    ).toBeNull()
  })
})

describe("debugger normalization negative cases", () => {
  it("caps an oversized bridged body before redacting it", () => {
    // About 8 MB: redacting it uncapped takes most of a second, capped it
    // takes a couple of milliseconds.
    const hugeBody = JSON.stringify({
      rows: Array.from({ length: 500_000 }, (_, index) => ({ index })),
      password: "hunter2",
    })
    const normalize = () =>
      normalizeDebuggerEvent({
        kind: "network",
        timestamp: 1,
        method: "POST",
        url: "https://example.com/api",
        requestBody: hugeBody,
      })

    // Warm up first, so the budget measures the redaction pass rather than
    // first-call compilation, and stays generous for busy CI runners.
    normalize()
    const start = performance.now()
    const event = normalize()

    expect(performance.now() - start).toBeLessThan(100)
    expect(event).toMatchObject({ kind: "network" })
    expect(
      (event as { requestBody?: string } | undefined)?.requestBody?.length
    ).toBeLessThanOrEqual(MAX_NETWORK_BODY_LENGTH)
    expect(JSON.stringify(event)).not.toContain("hunter2")
  })
})
