import { describe, expect, it } from "bun:test"
import {
  deviceInfoInputSchema,
  environmentInputSchema,
  metadataInputSchema,
} from "../src/lib/report-payload-schema"

describe("report payload schemas", () => {
  it("rejects an unknown metadata key instead of dropping it", () => {
    const result = metadataInputSchema.safeParse({
      pageTitle: "Checkout",
      unexpectedField: "nope",
    })

    expect(result.success).toBeFalse()
  })

  it("rejects an unknown deviceInfo key instead of dropping it", () => {
    const result = deviceInfoInputSchema.safeParse({
      browser: "Mozilla/5.0",
      unexpectedField: "nope",
    })

    expect(result.success).toBeFalse()
  })

  it("accepts the metadata and deviceInfo fields the extension currently sends", () => {
    expect(
      metadataInputSchema.parse({
        duration: "01:23",
        durationMs: 83_000,
        pageTitle: "Checkout",
      })
    ).toEqual({
      duration: "01:23",
      durationMs: 83_000,
      pageTitle: "Checkout",
    })

    expect(
      deviceInfoInputSchema.parse({
        browser: "Mozilla/5.0",
        os: "Win32",
        viewport: "1920x1080",
      })
    ).toEqual({
      browser: "Mozilla/5.0",
      os: "Win32",
      viewport: "1920x1080",
    })
  })

  it("accepts the metadata and deviceInfo fields the capture SDK currently sends", () => {
    expect(
      metadataInputSchema.parse({
        durationMs: 1500,
        pageTitle: "Checkout",
        submittedVia: "capture-sdk",
      })
    ).toEqual({
      durationMs: 1500,
      pageTitle: "Checkout",
      submittedVia: "capture-sdk",
    })

    expect(
      deviceInfoInputSchema.parse({
        browser: "Mozilla/5.0",
        os: "MacIntel",
        viewport: "1440x900",
      })
    ).toEqual({
      browser: "Mozilla/5.0",
      os: "MacIntel",
      viewport: "1440x900",
    })
  })

  it("rejects a durationMs that is negative, fractional, non-finite or over 24h", () => {
    for (const durationMs of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
      24 * 60 * 60 * 1000 + 1,
      "1000",
    ]) {
      expect(metadataInputSchema.safeParse({ durationMs }).success).toBe(false)
    }
    expect(
      metadataInputSchema.safeParse({ durationMs: 24 * 60 * 60 * 1000 }).success
    ).toBe(true)
    expect(metadataInputSchema.safeParse({ durationMs: 0 }).success).toBe(true)
  })
})

describe("environment schema", () => {
  const environment = {
    schemaVersion: 1,
    extensionVersion: "0.1.4",
    buildSha: "abc123",
    browser: { name: "Chrome", version: "126.0.0.0" },
    os: "Windows",
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 2,
    capture: { type: "video", durationMs: 1500 },
    page: { url: "https://example.com/a", title: "A" },
  }

  it("is optional so SDK reports and old extension builds validate", () => {
    expect(environmentInputSchema.parse(undefined)).toBeUndefined()
  })

  it("accepts the environment the extension sends", () => {
    expect(environmentInputSchema.parse(environment)).toEqual(environment)
  })

  it("rejects an unknown key, an unknown version and a bad capture type", () => {
    expect(
      environmentInputSchema.safeParse({ ...environment, extra: 1 }).success
    ).toBeFalse()
    expect(
      environmentInputSchema.safeParse({ ...environment, schemaVersion: 2 })
        .success
    ).toBeFalse()
    expect(
      environmentInputSchema.safeParse({
        ...environment,
        capture: { type: "gif", durationMs: 0 },
      }).success
    ).toBeFalse()
  })
})

describe("environment schema hardening", () => {
  const valid = {
    schemaVersion: 1,
    extensionVersion: "0.1.4",
    buildSha: "abc123",
    browser: { name: "Chrome", version: "126.0.0.0" },
    os: "Windows",
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 2,
    capture: { type: "video", durationMs: 1500 },
  }
  const parse = (patch: Record<string, unknown>) =>
    environmentInputSchema.safeParse({ ...valid, ...patch })

  it("rejects non-finite, negative, fractional and out-of-range numbers", () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      1.5,
      1e9,
    ]) {
      expect(parse({ viewport: { width: bad, height: 1 } }).success).toBeFalse()
    }
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -2, 101, "2"]) {
      expect(parse({ devicePixelRatio: bad }).success).toBeFalse()
    }
    for (const bad of [Number.NaN, -1, 1.5, 24 * 60 * 60 * 1000 + 1, null]) {
      expect(
        parse({ capture: { type: "video", durationMs: bad } }).success
      ).toBeFalse()
    }
  })

  it("rejects megabyte strings anywhere", () => {
    const huge = "a".repeat(1_000_000)
    expect(parse({ extensionVersion: huge }).success).toBeFalse()
    expect(parse({ buildSha: huge }).success).toBeFalse()
    expect(parse({ os: huge }).success).toBeFalse()
    expect(parse({ browser: { name: huge } }).success).toBeFalse()
    expect(parse({ page: { title: huge } }).success).toBeFalse()
    expect(parse({ page: { url: huge } }).success).toBeFalse()
  })

  it("rejects wrong types, arrays and prototype-pollution keys", () => {
    expect(parse({ browser: "Chrome" }).success).toBeFalse()
    expect(parse({ viewport: [1, 2] }).success).toBeFalse()
    expect(parse({ page: null }).success).toBeFalse()
    const polluted = JSON.parse(
      '{"schemaVersion":1,"__proto__":{"x":1},"extensionVersion":"1","buildSha":"a","browser":{"name":"C"},"viewport":{"width":1,"height":1},"devicePixelRatio":1,"capture":{"type":"video","durationMs":0}}'
    )
    expect(environmentInputSchema.safeParse(polluted).success).toBeFalse()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it("redacts tokens in the page URL and title on the server", () => {
    const result = environmentInputSchema.parse({
      ...valid,
      page: {
        url: "https://a.example/cb?access_token=SECRETVALUE&x=1#id_token=OTHERSECRET",
        title: "password=hunter2 dashboard",
      },
    })
    expect(JSON.stringify(result)).not.toContain("SECRETVALUE")
    expect(JSON.stringify(result)).not.toContain("OTHERSECRET")
    expect(JSON.stringify(result)).not.toContain("hunter2")
    expect(result?.page?.url).toContain("x=1")
  })

  it("redaction is idempotent for an already-redacted URL", () => {
    const once = environmentInputSchema.parse({
      ...valid,
      page: { url: "https://a.example/?token=abc" },
    })
    const twice = environmentInputSchema.parse(once)
    expect(twice).toEqual(once)
  })

  it("strips control characters, NUL included, instead of failing", () => {
    const result = environmentInputSchema.parse({
      ...valid,
      page: { title: "a\u0000b\u0007c‮d" },
    })
    expect(result?.page?.title?.includes("\u0000")).toBeFalse()
    expect(result?.page?.title?.startsWith("abc")).toBeTrue()
  })

  it("keeps markup as inert text for the renderer to escape", () => {
    const title = '<script>alert(1)</script><img src=x onerror="y">'
    expect(
      environmentInputSchema.parse({ ...valid, page: { title } })?.page?.title
    ).toBe(title)
  })

  it("a schemaVersion from the future is rejected, not silently stored", () => {
    expect(parse({ schemaVersion: 2 }).success).toBeFalse()
    expect(parse({ schemaVersion: "1" }).success).toBeFalse()
  })
})
