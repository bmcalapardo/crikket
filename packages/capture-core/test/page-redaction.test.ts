import { describe, expect, it } from "bun:test"

import {
  parseRawHeaders,
  toHeaderRecord,
} from "../src/debugger/engine/page/headers"
import { redactCapturedBody } from "../src/debugger/engine/page/utils"

describe("page instrumentation redaction", () => {
  it("masks secret request headers instead of dropping them", () => {
    expect(
      toHeaderRecord(
        new Headers({
          Authorization: "Bearer abc.def.ghi",
          "Content-Type": "application/json",
          "X-Debugger-Trace": "internal",
        })
      )
    ).toEqual({
      authorization: "Bearer [REDACTED]",
      "content-type": "application/json",
    })
  })

  it("masks secret response headers instead of dropping them", () => {
    expect(
      parseRawHeaders(
        "content-type: application/json\r\nset-cookie: sid=abc; HttpOnly\r\n"
      )
    ).toEqual({
      "content-type": "application/json",
      "set-cookie": "sid=[REDACTED]; HttpOnly",
    })
  })

  it("redacts a JSON body sent with a non-JSON content type", () => {
    expect(
      redactCapturedBody(
        '{"username":"tester","password":"hunter2"}',
        "text/plain;charset=UTF-8"
      )
    ).toBe('{"username":"tester","password":"[REDACTED]"}')
  })
})
