import { describe, expect, test } from "bun:test"
import {
  redactBody,
  redactHeaders,
  redactNetworkRequest,
  redactText,
  redactUrl,
} from "@crikket/capture-core/debugger/redaction"
import { createApp } from "../src/app"
import {
  FAKE_API_KEY,
  FAKE_COOKIE_NAME,
  FAKE_COOKIE_VALUE,
  FAKE_PASSWORD,
  FAKE_SECRETS,
  FAKE_TOKEN,
  SENSITIVE_CONSOLE_LINES,
  sensitiveRequestFixture,
} from "../src/fixtures"
import { SENSITIVE_SCRIPT } from "../src/pages"

const REAL_PROVIDER_PREFIX_PATTERN =
  /^(ghp_|gho_|github_pat_|AKIA|sk-|xox[bp]-|AIza|eyJ)/

// The fake secrets still present in output. Empty means fully masked.
function leaked(output: string): string[] {
  return FAKE_SECRETS.filter((secret) => output.includes(secret))
}

describe("sensitive fixture emits synthetic secrets", () => {
  test("the page carries a password field and sets a cookie", async () => {
    const app = createApp()
    const response = await app.request("/scenarios/sensitive")
    const html = await response.text()
    expect(html).toContain('type="password"')
    expect(html).toContain(`value="${FAKE_PASSWORD}"`)
    expect(response.headers.get("set-cookie")).toBe(
      `${FAKE_COOKIE_NAME}=${FAKE_COOKIE_VALUE}; Path=/; SameSite=Lax`
    )
    expect(SENSITIVE_SCRIPT).toContain(FAKE_TOKEN)
  })

  test("the API route sets the cookie and returns a token", async () => {
    const app = createApp()
    const response = await app.request("/api/sensitive", { method: "POST" })
    expect(response.headers.get("set-cookie")).toContain(FAKE_COOKIE_VALUE)
    expect(await response.json()).toEqual({
      ok: true,
      access_token: FAKE_TOKEN,
    })
  })

  test("secrets are obviously fake and match no provider token format", () => {
    for (const secret of FAKE_SECRETS) {
      expect(secret).toContain("fake")
      expect(secret).toContain("do-not-use")
      expect(secret).not.toMatch(REAL_PROVIDER_PREFIX_PATTERN)
    }
  })
})

describe("Redaction masks every secret the fixture emits", () => {
  test("the fixture really contains the secrets before redaction", () => {
    const raw = JSON.stringify(sensitiveRequestFixture())
    for (const secret of FAKE_SECRETS) {
      expect(raw).toContain(secret)
    }
  })

  test("a captured network request is fully masked", () => {
    const redacted = redactNetworkRequest(sensitiveRequestFixture())
    expect(leaked(JSON.stringify(redacted))).toEqual([])
  })

  test("each surface is masked on its own", () => {
    const request = sensitiveRequestFixture()
    expect(
      leaked(JSON.stringify(redactHeaders(request.requestHeaders)))
    ).toEqual([])
    expect(
      leaked(JSON.stringify(redactHeaders(request.responseHeaders)))
    ).toEqual([])
    expect(leaked(redactUrl(request.url))).toEqual([])
    expect(leaked(redactBody(request.requestBody, "application/json"))).toEqual(
      []
    )
    expect(
      leaked(redactBody(request.responseBody, "application/json"))
    ).toEqual([])
  })

  test("console lines are masked", () => {
    for (const line of SENSITIVE_CONSOLE_LINES) {
      expect(leaked(redactText(line))).toEqual([])
    }
  })

  test("every secret literal the page script ships is accounted for", () => {
    const emitted = new Set(
      [...SENSITIVE_SCRIPT.matchAll(/qa-fixture-fake-[a-z]+-do-not-use/g)].map(
        (match) => match[0]
      )
    )
    expect(emitted).toEqual(new Set([FAKE_TOKEN, FAKE_PASSWORD, FAKE_API_KEY]))
  })

  test("Cookie and Set-Cookie keep the name but mask the value", () => {
    const redacted = redactHeaders({
      cookie: `${FAKE_COOKIE_NAME}=${FAKE_COOKIE_VALUE}`,
      "set-cookie": `${FAKE_COOKIE_NAME}=${FAKE_COOKIE_VALUE}; Path=/`,
    })
    expect(redacted.cookie).toContain(FAKE_COOKIE_NAME)
    expect(leaked(JSON.stringify(redacted))).toEqual([])
  })
})
