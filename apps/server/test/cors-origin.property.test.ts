import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import { isTrustedRpcOrigin, resolveCorsOrigin } from "../src/cors-origin"

const options = {
  allowedOrigins: ["https://app.example.com", "http://localhost:3001"],
  fallbackOrigin: "https://app.example.com",
}
const EMBED = [
  "/api/embed/capture-token",
  "/api/embed/bug-report-upload-session",
  "/api/embed/bug-report-finalize",
]

// Reference model, written independently of the implementation.
function model(origin: string, path: string): string {
  if (EMBED.includes(path) && origin.trim() !== "") {
    return origin
  }
  if (options.allowedOrigins.includes(origin)) {
    return origin
  }
  if (
    ["chrome-extension", "moz-extension"].some((s) =>
      origin.startsWith(`${s}://`)
    )
  ) {
    return origin
  }
  return options.fallbackOrigin
}

const originArb = fc.oneof(
  fc.string(),
  fc.webUrl(),
  fc.constantFrom(
    "",
    " ",
    "\t",
    "null",
    "NULL",
    "*",
    "https://app.example.com/",
    "https://app.example.com.",
    "https://app.example.com:443",
    "HTTPS://APP.EXAMPLE.COM",
    "https://app.example.com.evil.example",
    "https://evilapp.example.com",
    "https://app.example.com@evil.example",
    "chrome-extension://",
    "chrome-extension://evil",
    "CHROME-EXTENSION://abc",
    " chrome-extension://abc",
    "moz-extension://x"
  )
)
const pathArb = fc.oneof(
  fc.string(),
  fc.constantFrom(
    ...EMBED,
    "/api/embed/capture-token/",
    "/API/EMBED/CAPTURE-TOKEN",
    "//api/embed/capture-token",
    "/api/embed/../rpc/x",
    "/api/embed/%2e%2e/rpc/x",
    "/api/embed/capture-token%2f",
    "/rpc/bugReports"
  )
)

describe("resolveCorsOrigin properties", () => {
  test("matches the reference model", () => {
    fc.assert(
      fc.property(originArb, pathArb, (origin, path) => {
        expect(resolveCorsOrigin(origin, path, options)).toBe(
          model(origin, path)
        )
      }),
      { numRuns: 3000, seed: 20_261_010 }
    )
  })

  // A request cannot carry Origin: * in a browser; with credentials: true a
  // reflected "*" is ignored by browsers anyway. Only the fallback is checked.
  test("fallback is never a wildcard or empty", () => {
    fc.assert(
      fc.property(originArb, pathArb, (origin, path) => {
        const result = resolveCorsOrigin(origin, path, options)
        if (result !== origin) {
          expect(result).toBe(options.fallbackOrigin)
        }
      }),
      { numRuns: 2000, seed: 7 }
    )
  })

  test("non-embed, non-extension, unlisted origins always get the fallback", () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter(
            (s) =>
              !(
                options.allowedOrigins.includes(s) ||
                s.startsWith("chrome-extension://") ||
                s.startsWith("moz-extension://")
              )
          ),
        (origin) => {
          expect(resolveCorsOrigin(origin, "/rpc/x", options)).toBe(
            options.fallbackOrigin
          )
        }
      ),
      { numRuns: 2000, seed: 11 }
    )
  })

  test("embed paths are matched exactly on the path string", () => {
    for (const path of [
      "/api/embed/capture-token/",
      "/API/EMBED/CAPTURE-TOKEN",
      "//api/embed/capture-token",
      "/api/embed/%2e%2e/rpc/x",
      "/api/embed/capture-token?x=1",
    ]) {
      expect(resolveCorsOrigin("https://evil.example", path, options)).toBe(
        options.fallbackOrigin
      )
    }
  })

  test("whitespace-only origins are not reflected on embed paths", () => {
    for (const origin of ["", " ", "\t\n"]) {
      expect(
        resolveCorsOrigin(origin, "/api/embed/capture-token", options)
      ).toBe(options.fallbackOrigin)
    }
  })

  test("extension prefix match is case sensitive and anchored", () => {
    for (const origin of [
      "CHROME-EXTENSION://abc",
      " chrome-extension://abc",
      "https://chrome-extension://abc",
    ]) {
      expect(resolveCorsOrigin(origin, "/rpc/x", options)).toBe(
        options.fallbackOrigin
      )
    }
  })
})

describe("isTrustedRpcOrigin", () => {
  test("allows missing Origin, listed origins and extensions only", () => {
    const list = options.allowedOrigins
    expect(isTrustedRpcOrigin(undefined, list)).toBe(true)
    expect(isTrustedRpcOrigin(null, list)).toBe(true)
    expect(isTrustedRpcOrigin("https://app.example.com", list)).toBe(true)
    expect(isTrustedRpcOrigin("chrome-extension://abc", list)).toBe(true)
    expect(isTrustedRpcOrigin("moz-extension://abc", list)).toBe(true)
    for (const bad of ["null", "", "https://evil.example", "*", " "]) {
      expect(isTrustedRpcOrigin(bad, list)).toBe(false)
    }
  })
})

describe("allow-list is honoured independently of the fallback", () => {
  test("a listed origin that is not the fallback is reflected", () => {
    expect(
      resolveCorsOrigin("http://localhost:3001", "/rpc/x", {
        allowedOrigins: ["https://app.example.com", "http://localhost:3001"],
        fallbackOrigin: "https://app.example.com",
      })
    ).toBe("http://localhost:3001")
  })
})
