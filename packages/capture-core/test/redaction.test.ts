import { describe, expect, it } from "bun:test"

import {
  isSensitiveName,
  REDACTED_VALUE,
  redactBody,
  redactHeaders,
  redactMetadata,
  redactNetworkRequest,
  redactStructuredValue,
  redactText,
  redactUrl,
} from "../src/debugger/redaction"

describe("redactHeaders", () => {
  it("masks secret-bearing headers and keeps the rest", () => {
    expect(
      redactHeaders({
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
        cookie: "sid=abc123; theme=dark",
        "set-cookie": "sid=abc123; Path=/; HttpOnly",
        "x-api-key": "sk_live_123",
        "content-type": "application/json",
      })
    ).toEqual({
      authorization: `Bearer ${REDACTED_VALUE}`,
      cookie: `sid=${REDACTED_VALUE}; theme=${REDACTED_VALUE}`,
      "set-cookie": `sid=${REDACTED_VALUE}; Path=/; HttpOnly`,
      "x-api-key": REDACTED_VALUE,
      "content-type": "application/json",
    })
  })

  it("masks an authorization header without a scheme", () => {
    expect(redactHeaders({ authorization: "abc123" })).toEqual({
      authorization: REDACTED_VALUE,
    })
  })
})

describe("redactBody", () => {
  it("parses JSON bodies even when the content type is not JSON", () => {
    const body = JSON.stringify({
      email: "tester@example.com",
      password: "hunter2",
      profile: { accessToken: "abc", plan: "pro" },
    })

    expect(JSON.parse(redactBody(body, "text/plain"))).toEqual({
      email: "tester@example.com",
      password: REDACTED_VALUE,
      profile: { accessToken: REDACTED_VALUE, plan: "pro" },
    })
    expect(JSON.parse(redactBody(body))).toEqual(
      JSON.parse(redactBody(body, "text/plain"))
    )
  })

  it("masks quoted secret fields in JSON that cannot be parsed", () => {
    const truncated = '{"email":"tester@example.com","password":"hunter2","no'

    expect(redactBody(truncated, "application/json")).toBe(
      `{"email":"tester@example.com","password":"${REDACTED_VALUE}","no`
    )
  })

  it("masks form-encoded secret fields", () => {
    expect(
      redactBody(
        "username=tester&password=hunter2",
        "application/x-www-form-urlencoded"
      )
    ).toBe(`username=tester&password=${encodeURIComponent(REDACTED_VALUE)}`)
  })
})

describe("redactText", () => {
  it("masks the token after an authorization scheme", () => {
    expect(redactText("authorization: Bearer abc.def.ghi")).toBe(
      `authorization: Bearer ${REDACTED_VALUE}`
    )
  })

  it("masks a bare bearer token", () => {
    expect(redactText("retrying with Bearer abc123def456ghi")).toBe(
      `retrying with Bearer ${REDACTED_VALUE}`
    )
  })

  it("leaves ordinary text alone", () => {
    expect(redactText("Loaded 3 reports in 120ms")).toBe(
      "Loaded 3 reports in 120ms"
    )
  })
})

describe("isSensitiveName", () => {
  it("matches snake_case, kebab-case and camelCase secret names", () => {
    for (const name of [
      "api_key",
      "x-api-key",
      "apiKey",
      "client_secret",
      "set-cookie",
      "private_key",
    ]) {
      expect(isSensitiveName(name)).toBe(true)
    }
  })

  it("does not match ordinary names", () => {
    for (const name of ["content-type", "page", "email", "user-agent"]) {
      expect(isSensitiveName(name)).toBe(false)
    }
  })
})

describe("redactUrl", () => {
  it("masks secret query params and keeps the rest", () => {
    expect(redactUrl("https://example.com/cb?access_token=abc&page=2")).toBe(
      `https://example.com/cb?access_token=${REDACTED_VALUE}&page=2`
    )
  })
})

describe("redactMetadata", () => {
  it("masks secret keys and secret-shaped strings", () => {
    expect(
      redactMetadata({
        apiKey: "sk_live_123",
        detail: "password=hunter2",
        count: 3,
      })
    ).toEqual({
      apiKey: REDACTED_VALUE,
      detail: `password=${REDACTED_VALUE}`,
      count: 3,
    })
  })
})

describe("redactNetworkRequest", () => {
  it("redacts every secret-bearing part and keeps the request useful", () => {
    expect(
      redactNetworkRequest({
        method: "POST",
        url: "https://example.com/login?token=abc&next=/home",
        status: 200,
        requestHeaders: {
          authorization: "Basic dGVzdGVyOmh1bnRlcjI=",
          "content-type": "text/plain",
        },
        requestBody: '{"username":"tester","password":"hunter2"}',
        responseBody: '{"ok":true,"session_id":"s-1"}',
        timestamp: "2026-10-10T00:00:00.000Z",
        offset: 0,
      })
    ).toEqual({
      method: "POST",
      url: `https://example.com/login?token=${REDACTED_VALUE}&next=/home`,
      status: 200,
      requestHeaders: {
        authorization: `Basic ${REDACTED_VALUE}`,
        "content-type": "text/plain",
      },
      requestBody: `{"username":"tester","password":"${REDACTED_VALUE}"}`,
      responseBody: `{"ok":true,"session_id":"${REDACTED_VALUE}"}`,
      timestamp: "2026-10-10T00:00:00.000Z",
      offset: 0,
    })
  })

  it("is idempotent, so a second pass changes nothing", () => {
    const request = {
      url: "https://example.com/?api_key=abc",
      requestHeaders: { cookie: "sid=abc" },
      requestBody: '{"password":"hunter2"}',
    }
    const once = redactNetworkRequest(request)

    expect(redactNetworkRequest(once)).toEqual(once)
  })
})

// Gaps found in review: each case leaked a secret or over-redacted useful data.
describe("redaction edge cases", () => {
  it("keeps cookie names and attributes in Set-Cookie, including combined values", () => {
    expect(
      redactHeaders({
        "set-cookie":
          "sid=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, theme=dark; Path=/",
      })
    ).toEqual({
      "set-cookie": `sid=${REDACTED_VALUE}; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, theme=${REDACTED_VALUE}; Path=/`,
    })
  })

  it("redacts query params in relative URLs", () => {
    expect(redactUrl("/api/items?token=abc&page=2")).toBe(
      `/api/items?token=${REDACTED_VALUE}&page=2`
    )
  })

  it("redacts params in hash-routed fragments", () => {
    expect(redactUrl("https://example.com/#/callback?token=abc&tab=1")).toBe(
      `https://example.com/#/callback?token=${REDACTED_VALUE}&tab=1`
    )
  })

  it("masks a whole value that contains spaces", () => {
    expect(redactText('password="my secret pw" retry')).toBe(
      `password="${REDACTED_VALUE}" retry`
    )
    expect(redactText("login failed: password=my secret pw")).toBe(
      `login failed: password=${REDACTED_VALUE}`
    )
  })

  it("masks any sensitive key in JSON that was truncated before redaction", () => {
    expect(redactBody('{"session":"s-1","user":"tester","x":"tru')).toBe(
      `{"session":"${REDACTED_VALUE}","user":"tester","x":"tru`
    )
  })

  it("does not cut deeply nested JSON that has nothing to redact", () => {
    const body = JSON.stringify({
      a: { b: { c: { d: { e: { f: { g: 1 } } } } } },
    })

    expect(redactBody(body, "text/plain")).toBe(body)
  })

  it("keeps booleans and token counts that cannot be secrets", () => {
    expect(
      redactStructuredValue({
        max_tokens: 100,
        usage: { prompt_tokens: 12 },
        cookieConsent: true,
        sessionId: null,
        otp_token: 123_456,
      })
    ).toEqual({
      max_tokens: 100,
      usage: { prompt_tokens: 12 },
      cookieConsent: true,
      sessionId: null,
      otp_token: REDACTED_VALUE,
    })
  })

  it("leaves prose that mentions Bearer alone", () => {
    expect(redactText("use Bearer authentication for this API")).toBe(
      "use Bearer authentication for this API"
    )
  })
})

// Negative tests: hostile, truncated and malformed input must not leak a
// secret, crash, or mangle the data around it.
describe("redaction negative cases", () => {
  const SECRET = "S3cr3tVALUEzz9"

  it("masks a value cut off by truncation, without leaking its start", () => {
    const body = JSON.stringify({ a: "x", password: SECRET })
    for (let cut = 1; cut < body.length; cut++) {
      const out = redactBody(`${body.slice(0, cut)}...`, "application/json")
      for (let length = 4; length < SECRET.length; length++) {
        expect(out).not.toContain(`${SECRET.slice(0, length)}...`)
      }
    }
  })

  it("masks any sensitive name in free text, not just a fixed list", () => {
    expect(redactText(`retry token=${SECRET} in 5s`)).toBe(
      `retry token=${REDACTED_VALUE}`
    )
    expect(redactText(`user=u&x-auth-token=${SECRET}`)).toBe(
      `user=u&x-auth-token=${REDACTED_VALUE}`
    )
    expect(redactText(`{"_csrf_token":"${SECRET}"}`)).toBe(
      `{"_csrf_token":"${REDACTED_VALUE}"}`
    )
  })

  it("does not let a non-sensitive value hide a later secret", () => {
    expect(redactText(`note=see below and token=${SECRET}`)).toBe(
      `note=see below and token=${REDACTED_VALUE}`
    )
  })

  it("redacts relative and opaque URLs without rewriting them", () => {
    expect(redactUrl(`//cdn.test/x?token=${SECRET}&v=2`)).toBe(
      `//cdn.test/x?token=${REDACTED_VALUE}&v=2`
    )
    expect(redactUrl(`/a/../b?token=${SECRET}`)).toBe(
      `/a/../b?token=${REDACTED_VALUE}`
    )
    expect(redactUrl(`data:text/plain,token=${SECRET}`)).toBe(
      `data:text/plain,token=${REDACTED_VALUE}`
    )
  })

  it("keeps __proto__ keys in a redacted body", () => {
    expect(
      redactBody(
        `{"__proto__":{"note":"keep"},"password":"${SECRET}"}`,
        "application/json"
      )
    ).toBe(`{"__proto__":{"note":"keep"},"password":"${REDACTED_VALUE}"}`)
  })

  it("never throws, and a second pass changes nothing", () => {
    const hostile = [
      "",
      "{",
      '{"a":',
      '"',
      "\\",
      "=",
      "password=",
      'password":"',
      "Bearer ",
      "%E0%A4%A",
      "\ud800",
      "[".repeat(5000),
      `javascript:alert(1)?token=${SECRET}`,
    ]
    for (const value of hostile) {
      for (const redact of [
        redactText,
        redactUrl,
        (input: string) => redactBody(input, "text/plain"),
        (input: string) =>
          redactBody(input, "application/x-www-form-urlencoded"),
        (input: string) => redactHeaders({ "set-cookie": input })["set-cookie"],
      ]) {
        const once = redact(value) ?? ""
        expect(redact(once)).toBe(once)
        expect(once).not.toContain(SECRET)
      }
    }
  })

  it("stays fast on adversarial input", () => {
    const start = performance.now()
    redactText(`"${'a\\"'.repeat(60_000)}`)
    redactText("password:".repeat(20_000))
    redactText(`{${'"k":"v",'.repeat(25_000)}`)
    redactHeaders({ "set-cookie": "a=b; ".repeat(40_000) })
    expect(performance.now() - start).toBeLessThan(500)
  })
})
