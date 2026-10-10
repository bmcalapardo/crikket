import { describe, expect, test } from "bun:test"
import {
  buildReportEnvironment,
  ENVIRONMENT_SCHEMA_VERSION,
  parseBrowser,
  parseIncludePage,
  parseOs,
} from "../lib/report-environment"
import pkg from "../package.json"

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

const base = {
  buildSha: "abc1234",
  captureType: "video" as const,
  durationMs: 1500.4,
  extensionVersion: pkg.version,
  includePage: true,
  pageTitle: "Checkout",
  pageUrl: "https://shop.example.com/cart?token=SUPERSECRET123&step=2",
  platform: "Win32",
  userAgent: CHROME_UA,
  viewport: { width: 1280, height: 720 },
  devicePixelRatio: 2,
}

describe("buildReportEnvironment", () => {
  test("carries a stable object with the known fields", () => {
    expect(buildReportEnvironment({ ...base, includePage: false })).toEqual({
      schemaVersion: ENVIRONMENT_SCHEMA_VERSION,
      extensionVersion: pkg.version,
      buildSha: "abc1234",
      browser: { name: "Chrome", version: "126.0.0.0" },
      os: "Windows",
      viewport: { width: 1280, height: 720 },
      devicePixelRatio: 2,
      capture: { type: "video", durationMs: 1500 },
    })
  })

  test("reports the version of the running extension's package.json", () => {
    expect(buildReportEnvironment(base).extensionVersion).toBe(pkg.version)
  })

  test("masks tokens in the page URL", () => {
    const url = buildReportEnvironment(base).page?.url ?? ""
    expect(url).not.toContain("SUPERSECRET123")
    expect(url).toContain("step=2")
  })

  test("omits the page when the setting is off", () => {
    expect(
      buildReportEnvironment({ ...base, includePage: false }).page
    ).toBeUndefined()
  })

  test("the page setting defaults on", () => {
    expect(parseIncludePage(undefined)).toBe(true)
    expect(parseIncludePage(false)).toBe(false)
  })
})

describe("user agent parsing", () => {
  test("tells Edge, Firefox and Safari apart from Chrome", () => {
    expect(parseBrowser(`${CHROME_UA} Edg/126.0.2592.81`).name).toBe("Edge")
    expect(
      parseBrowser(
        "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"
      )
    ).toEqual({ name: "Firefox", version: "127.0" })
    expect(
      parseBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
      )
    ).toEqual({ name: "Safari", version: "17.5" })
    expect(parseBrowser("curl/8")).toEqual({ name: "Unknown" })
  })

  test("names the OS", () => {
    expect(parseOs(CHROME_UA)).toBe("Windows")
    expect(parseOs("x", "Plan9")).toBe("Plan9")
  })
})
