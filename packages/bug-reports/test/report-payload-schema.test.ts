import { describe, expect, it } from "bun:test"
import {
  deviceInfoInputSchema,
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
})
