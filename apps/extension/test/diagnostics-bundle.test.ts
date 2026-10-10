import { describe, expect, test } from "bun:test"
import { buildDiagnosticsBundle } from "../lib/diagnostics/bundle"
import { runChecks } from "../lib/diagnostics/checks"
import { healthyEnvironment } from "./diagnostics-fixtures"

const SECRET = "SUPERSECRETVALUE123"

async function bundleWith(
  overrides: Parameters<typeof healthyEnvironment>[0],
  storage: Record<string, unknown>,
  errors = [] as Array<{ at: number; context: string; message: string }>
) {
  const environment = healthyEnvironment(overrides)
  const report = await runChecks(environment)
  return buildDiagnosticsBundle({
    generatedAt: 1_700_000_000_000,
    version: environment.version,
    buildSha: environment.buildSha,
    appUrl: environment.appUrl,
    report,
    errors,
    storage,
  })
}

describe("diagnostics bundle", () => {
  test("names the checks by ID and status and carries version and build", async () => {
    const bundle = JSON.parse(await bundleWith({}, {}))

    expect(bundle.extensionVersion).toBe("0.3.0")
    expect(bundle.buildSha).toBe("abc1234")
    expect(bundle.checks).toHaveLength(9)
    expect(bundle.checks[2]).toMatchObject({
      id: "api-connectivity",
      status: "pass",
    })
  })

  test("redacts auth-ish keys in a chrome.storage dump", async () => {
    const text = await bundleWith(
      {},
      {
        "better-auth.session_token": SECRET,
        authToken: SECRET,
        user: {
          name: "Tester",
          refreshToken: SECRET,
          nested: { password: SECRET },
        },
        hotkeyStartVideoCapture: true,
        captureTabId: 7,
      }
    )
    const bundle = JSON.parse(text)

    expect(text).not.toContain(SECRET)
    expect(bundle.storage.captureTabId).toBe(7)
    expect(bundle.storage.user.name).toBe("Tester")
    expect(bundle.storage.authToken).toBe("[REDACTED]")
  })

  test("redacts secrets echoed back in API responses", async () => {
    const text = await bundleWith(
      {
        probeApi: () =>
          Promise.resolve({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              json: "OK",
              echo: { accessToken: SECRET, note: `Bearer ${SECRET}x` },
            }),
          }),
        probeSession: () =>
          Promise.resolve({
            status: 200,
            contentType: "application/json",
            body: `{"user":{"id":"u1"},"session":{"token":"${SECRET}"}}`,
          }),
      },
      {}
    )

    expect(text).not.toContain(SECRET)
    expect(JSON.parse(text).apiResponse.status).toBe(200)
  })

  test("redacts a truncated or non-JSON echoed body", async () => {
    const text = await bundleWith(
      {
        probeApi: () =>
          Promise.resolve({
            status: 502,
            contentType: "text/plain",
            body: `upstream error token=${SECRET} while calling https://x.test/?api_key=${SECRET}`,
          }),
      },
      {}
    )

    expect(text).not.toContain(SECRET)
  })

  test("redacts URLs with token params in error entries and summaries", async () => {
    const text = await bundleWith(
      { appUrl: `https://crikket.example.test/?token=${SECRET}` },
      {},
      [
        {
          at: 1,
          context: `fetch https://a.test/?access_token=${SECRET}`,
          message: `Authorization: Bearer ${SECRET}`,
        },
      ]
    )

    expect(text).not.toContain(SECRET)
  })

  test("summarises big storage values by size instead of copying them", async () => {
    const screenshot = `data:image/png;base64,${"A".repeat(5_000_000)}`
    const text = await bundleWith({}, { pendingScreenshot: screenshot })
    const bundle = JSON.parse(text)

    expect(text.length).toBeLessThan(20_000)
    expect(bundle.storage.pendingScreenshot).toStartWith("[omitted:")
  })

  test("survives storage dumps that cannot be serialised or are enormous", async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const many: Record<string, unknown> = { cyclic }
    for (let i = 0; i < 5000; i++) {
      many[`key${i}`] = i
    }

    const text = await bundleWith({}, many)

    expect(Object.keys(JSON.parse(text).storage).length).toBeLessThanOrEqual(
      200
    )
  })
})
