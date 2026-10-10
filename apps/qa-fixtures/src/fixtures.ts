// Every number here is part of the contract the tests, the README and the
// testers rely on. Change one and the matching test goes red on purpose.

export const DEFAULT_SLOW_MS = 3000
// A hostile or typo'd ?ms= must never hold a connection open for long.
export const MAX_SLOW_MS = 10_000

// Global cap on concurrent delayed /api/slow requests.
export const MAX_IN_FLIGHT_SLOW = 100

export const LONG_PAGE_SECTION_COUNT = 20
export const LONG_PAGE_SECTION_HEIGHT_PX = 600
export const LONG_PAGE_HEIGHT_PX =
  LONG_PAGE_SECTION_COUNT * LONG_PAGE_SECTION_HEIGHT_PX

export const CONSOLE_ERROR_MESSAGE =
  "[qa-fixtures] intentional console error: this is a known-bad page"

export const NETWORK_500_BODY = {
  error: "intentional-server-error",
  message: "[qa-fixtures] this route always returns 500",
} as const

export const FORM_FAILURE_BODY = {
  error: "validation-failed",
  errors: { email: "[qa-fixtures] this form always fails validation" },
} as const

// Synthetic secrets. They are obviously fake, match no provider's token
// format, and are what the Redaction module is asserted against. None of
// them may ever appear in captured output unmasked.
export const FAKE_TOKEN = "qa-fixture-fake-token-do-not-use"
export const FAKE_COOKIE_VALUE = "qa-fixture-fake-session-do-not-use"
export const FAKE_PASSWORD = "qa-fixture-fake-password-do-not-use"
export const FAKE_API_KEY = "qa-fixture-fake-apikey-do-not-use"
export const FAKE_COOKIE_NAME = "qa_session_token"

export const FAKE_SECRETS = [
  FAKE_TOKEN,
  FAKE_COOKIE_VALUE,
  FAKE_PASSWORD,
  FAKE_API_KEY,
] as const

const PLAIN_INTEGER_PATTERN = /^\d{1,15}$/

// Parses ?ms=. Anything that is not a plain non-negative integer falls back
// to the default; anything above the cap is clamped to it.
export function parseSlowMs(raw: string | null | undefined): number {
  if (!(raw && PLAIN_INTEGER_PATTERN.test(raw))) {
    return DEFAULT_SLOW_MS
  }

  return Math.min(Number(raw), MAX_SLOW_MS)
}

// The traffic the sensitive scenario page produces, as the debugger would
// capture it. Shared by the page script and the redaction test so the test
// covers what the page really emits.
export function sensitiveRequestFixture() {
  return {
    url: `/api/sensitive?api_key=${FAKE_API_KEY}`,
    requestHeaders: {
      authorization: `Bearer ${FAKE_TOKEN}`,
      cookie: `${FAKE_COOKIE_NAME}=${FAKE_COOKIE_VALUE}`,
      "content-type": "application/json",
    },
    responseHeaders: {
      "set-cookie": `${FAKE_COOKIE_NAME}=${FAKE_COOKIE_VALUE}; Path=/; SameSite=Lax`,
      "content-type": "application/json",
    },
    requestBody: JSON.stringify({
      username: "qa-fixture-user",
      password: FAKE_PASSWORD,
    }),
    responseBody: JSON.stringify({
      ok: true,
      access_token: FAKE_TOKEN,
    }),
  }
}

export const SENSITIVE_CONSOLE_LINES = [
  `[qa-fixtures] auth header Authorization: Bearer ${FAKE_TOKEN}`,
  `[qa-fixtures] debug token=${FAKE_TOKEN} password=${FAKE_PASSWORD}`,
] as const
