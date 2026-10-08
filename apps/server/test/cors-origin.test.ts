import { describe, expect, test } from "bun:test"
import { resolveCorsOrigin } from "../src/cors-origin"

const options = {
  allowedOrigins: ["https://app.example.com"],
  fallbackOrigin: "https://app.example.com",
}

describe("resolveCorsOrigin", () => {
  test("allows the Chromium extension", () => {
    const origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"

    expect(resolveCorsOrigin(origin, "/rpc/bugReports", options)).toBe(origin)
  })

  test("allows the Firefox extension", () => {
    const origin = "moz-extension://4b0f5d1e-2c3a-4b5c-9d8e-7f6a5b4c3d2e"

    expect(resolveCorsOrigin(origin, "/rpc/bugReports", options)).toBe(origin)
  })

  test("allows configured origins", () => {
    expect(
      resolveCorsOrigin("https://app.example.com", "/rpc/bugReports", options)
    ).toBe("https://app.example.com")
  })

  test("falls back for unknown origins", () => {
    expect(
      resolveCorsOrigin("https://evil.example", "/rpc/bugReports", options)
    ).toBe("https://app.example.com")
  })

  test("embed capture routes accept any non-empty origin", () => {
    expect(
      resolveCorsOrigin(
        "https://customer-site.example",
        "/api/embed/capture-token",
        options
      )
    ).toBe("https://customer-site.example")
    expect(resolveCorsOrigin("  ", "/api/embed/capture-token", options)).toBe(
      "https://app.example.com"
    )
  })
})
