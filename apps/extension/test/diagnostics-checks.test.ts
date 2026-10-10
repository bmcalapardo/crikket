import { describe, expect, test } from "bun:test"
import {
  CHECK_IDS,
  type CheckId,
  type CheckResult,
  runChecks,
} from "../lib/diagnostics/checks"
import { healthyEnvironment, NEVER } from "./diagnostics-fixtures"

const byId = (checks: CheckResult[], id: CheckId) =>
  checks.find((check) => check.id === id)

describe("runChecks on a healthy installation", () => {
  test("reports every named check ID with a pass status", async () => {
    const { checks } = await runChecks(healthyEnvironment())

    expect(checks.map((check) => check.id)).toEqual([...CHECK_IDS])
    for (const id of CHECK_IDS) {
      expect(byId(checks, id)?.status).toBe("pass")
    }
  })

  test("reports the version and build identifier it was given", async () => {
    const { checks } = await runChecks(healthyEnvironment())

    expect(byId(checks, "extension-version")?.summary).toContain("0.3.0")
    expect(byId(checks, "build-identifier")?.summary).toContain("abc1234")
  })

  test("reports when the last capture succeeded, never probing live", async () => {
    const { checks } = await runChecks(healthyEnvironment())

    expect(byId(checks, "screenshot-availability")?.summary).toContain(
      "2023-11-14T22:13:20.000Z"
    )
    expect(byId(checks, "recording-availability")?.summary).toContain(
      "No capture has succeeded yet"
    )
  })
})

describe("runChecks with something broken", () => {
  test("a simulated API outage fails API connectivity in plain words", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        probeApi: () => Promise.reject(new TypeError("Failed to fetch")),
        probeSession: () => Promise.reject(new TypeError("Failed to fetch")),
      })
    )
    const api = byId(checks, "api-connectivity")

    expect(api?.status).toBe("fail")
    expect(api?.summary).toContain(
      "Could not reach https://crikket.example.test"
    )
    expect(byId(checks, "storage-availability")?.status).toBe("pass")
  })

  test("a server error is reported with its HTTP status", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        probeApi: () =>
          Promise.resolve({ status: 503, body: "Service Unavailable" }),
      })
    )

    expect(byId(checks, "api-connectivity")?.status).toBe("fail")
    expect(byId(checks, "api-connectivity")?.summary).toContain("HTTP 503")
  })

  test("a web page in place of an API answer fails and says so", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        probeApi: () =>
          Promise.resolve({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: "<html>Sign in</html>",
          }),
      })
    )

    expect(byId(checks, "api-connectivity")?.summary).toContain("web page")
  })

  test("an expired session fails authentication and says to sign in", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        probeSession: () =>
          Promise.resolve({
            status: 200,
            contentType: "application/json",
            body: "null",
          }),
      })
    )
    const auth = byId(checks, "authentication-state")

    expect(auth?.status).toBe("fail")
    expect(auth?.summary).toContain("sign in")
    expect(byId(checks, "api-connectivity")?.status).toBe("pass")
  })

  test("missing browser APIs fail only the affected capability", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        missingApis: (capability) =>
          capability === "recording" ? ["MediaRecorder"] : [],
      })
    )

    expect(byId(checks, "recording-availability")?.status).toBe("fail")
    expect(byId(checks, "recording-availability")?.summary).toContain(
      "MediaRecorder"
    )
    expect(byId(checks, "screenshot-availability")?.status).toBe("pass")
  })

  test("recent errors turn the last-error check into a warning", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        listErrors: () =>
          Promise.resolve([{ at: 1, context: "Upload", message: "boom" }]),
      })
    )

    expect(byId(checks, "last-error")?.status).toBe("warn")
    expect(byId(checks, "last-error")?.summary).toContain("Upload: boom")
  })
})

describe("runChecks never hangs or throws", () => {
  test("an API that never answers times out and fails quietly", async () => {
    const started = Date.now()
    const { checks } = await runChecks(
      healthyEnvironment({ probeApi: () => NEVER, probeSession: () => NEVER }),
      { timeoutMs: 25 }
    )

    expect(Date.now() - started).toBeLessThan(1000)
    expect(byId(checks, "api-connectivity")?.status).toBe("fail")
    expect(byId(checks, "api-connectivity")?.summary).toContain(
      "did not answer"
    )
    expect(byId(checks, "authentication-state")?.status).toBe("fail")
    expect(byId(checks, "storage-availability")?.status).toBe("pass")
  })

  test("the abort signal fires on timeout so the request is cancelled", async () => {
    let aborted = false
    await runChecks(
      healthyEnvironment({
        probeApi: (signal) => {
          signal.addEventListener("abort", () => {
            aborted = true
          })
          return NEVER
        },
      }),
      { timeoutMs: 20 }
    )

    expect(aborted).toBe(true)
  })

  test("every probe hanging at once still resolves with all nine checks", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        probeApi: () => NEVER,
        probeSession: () => NEVER,
        probeStorage: () => NEVER,
        getLastCapture: () => NEVER,
        listErrors: () => NEVER,
      }),
      { timeoutMs: 20 }
    )

    expect(checks).toHaveLength(CHECK_IDS.length)
    expect(byId(checks, "storage-availability")?.status).toBe("fail")
    expect(byId(checks, "last-error")?.status).toBe("fail")
    // The capture timestamp is extra detail: API presence still passes.
    expect(byId(checks, "screenshot-availability")?.status).toBe("pass")
  })

  test("probes that throw synchronously become failing checks", async () => {
    const boom = () => {
      throw new Error("kaboom")
    }
    const { checks } = await runChecks(
      healthyEnvironment({
        probeApi: boom,
        probeSession: boom,
        probeStorage: boom,
        listErrors: boom,
      })
    )

    expect(byId(checks, "api-connectivity")?.status).toBe("fail")
    expect(byId(checks, "storage-availability")?.status).toBe("fail")
    expect(byId(checks, "last-error")?.status).toBe("fail")
  })

  test("a full chrome.storage quota is named as full", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        probeStorage: () =>
          Promise.reject(new Error("Resource::kQuotaBytes quota exceeded")),
      })
    )

    expect(byId(checks, "storage-availability")?.status).toBe("fail")
    expect(byId(checks, "storage-availability")?.summary).toContain("full")
  })

  test("storage that is unavailable is named as unavailable", async () => {
    const { checks } = await runChecks(
      healthyEnvironment({
        probeStorage: () => Promise.reject(new Error("storage is undefined")),
      })
    )

    expect(byId(checks, "storage-availability")?.summary).toContain(
      "unavailable"
    )
  })
})
