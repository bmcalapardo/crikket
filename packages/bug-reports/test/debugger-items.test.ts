import { describe, expect, it } from "bun:test"

import { parseDebuggerData } from "../src/lib/debugger-items"

const TIMESTAMP = "2026-10-10T00:00:00.000Z"

describe("parseDebuggerData", () => {
  // Ingestion must not trust the client: an outdated or tampered extension
  // can upload a debugger artifact that skipped client-side redaction.
  it("redacts secrets from a stored artifact before it is saved", () => {
    const warnings: string[] = []

    const parsed = parseDebuggerData(
      {
        actions: [
          {
            type: "input",
            target: "input#password",
            timestamp: TIMESTAMP,
            offset: 0,
            metadata: { password: "hunter2", length: 7 },
          },
        ],
        logs: [
          {
            level: "error",
            message: "401 with authorization: Bearer abc.def.ghi",
            timestamp: TIMESTAMP,
            offset: 10,
          },
        ],
        networkRequests: [
          {
            method: "POST",
            url: "https://example.com/api/login?access_token=abc&page=2",
            status: 401,
            requestHeaders: {
              authorization: "Bearer abc.def.ghi",
              cookie: "sid=abc123",
              "content-type": "text/plain",
            },
            responseHeaders: { "set-cookie": "sid=new; HttpOnly" },
            requestBody: '{"username":"tester","password":"hunter2"}',
            responseBody: '{"error":"invalid_grant"}',
            timestamp: TIMESTAMP,
            offset: 20,
          },
        ],
      },
      warnings
    )

    expect(warnings).toEqual([])
    expect(parsed.actions[0]?.metadata).toEqual({
      password: "[REDACTED]",
      length: 7,
    })
    expect(parsed.logs[0]?.message).toBe(
      "401 with authorization: Bearer [REDACTED]"
    )
    expect(parsed.networkRequests[0]).toEqual({
      method: "POST",
      url: "https://example.com/api/login?access_token=[REDACTED]&page=2",
      status: 401,
      requestHeaders: {
        authorization: "Bearer [REDACTED]",
        cookie: "sid=[REDACTED]",
        "content-type": "text/plain",
      },
      responseHeaders: { "set-cookie": "sid=[REDACTED]; HttpOnly" },
      requestBody: '{"username":"tester","password":"[REDACTED]"}',
      responseBody: '{"error":"invalid_grant"}',
      timestamp: TIMESTAMP,
      offset: 20,
    })
  })

  it("still skips invalid items with a warning", () => {
    const warnings: string[] = []

    const parsed = parseDebuggerData(
      { actions: [], logs: [{ level: "nope" }], networkRequests: [] },
      warnings
    )

    expect(parsed.logs).toEqual([])
    expect(warnings).toEqual([
      "Skipped 1 invalid debugger log events before saving.",
    ])
  })
})
