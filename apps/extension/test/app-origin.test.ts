import { describe, expect, test } from "bun:test"

import { appOriginSchema } from "@crikket/env/app-origin"

// getRpcUrl and getLoginUrl resolve absolute paths against VITE_APP_URL, so a
// path, query or hash on it would be dropped silently. Reject it at build time.
describe("appOriginSchema", () => {
  test("accepts a bare origin, with or without a trailing slash", () => {
    for (const value of [
      "https://crikket.example.test",
      "https://crikket.example.test/",
      "http://localhost:3001",
    ]) {
      expect(appOriginSchema.safeParse(value).success).toBe(true)
    }
  })

  test("rejects anything that is not just an origin", () => {
    for (const value of [
      "https://crikket.example.test/app",
      "https://crikket.example.test/app/",
      "https://crikket.example.test/?a=1",
      "https://crikket.example.test/#top",
      "https://crikket.example.test?a=1",
      "not a url",
    ]) {
      expect(appOriginSchema.safeParse(value).success).toBe(false)
    }
  })
})

describe("appOriginSchema hostile values", () => {
  test("rejects non-http schemes and embedded credentials", () => {
    for (const value of [
      "javascript://x/%0aalert(1)",
      "file:///",
      "ftp://crikket.example.test",
      "https://a@evil.test",
      "https://user:pw@evil.test/",
    ]) {
      expect(appOriginSchema.safeParse(value).success).toBe(false)
    }
  })

  test("accepts IDN, punycode and IPv6 origins", () => {
    for (const value of [
      "https://xn--e1afmkfd.test",
      "https://пример.test",
      "http://[::1]:3001",
      "HTTPS://CRIKKET.EXAMPLE.TEST",
    ]) {
      expect(appOriginSchema.safeParse(value).success).toBe(true)
    }
  })
})

describe("appOriginSchema messages", () => {
  test("reports one clear issue per failure", () => {
    const messages = (value: string) => {
      const result = appOriginSchema.safeParse(value)
      return result.success ? [] : result.error.issues.map((i) => i.message)
    }

    expect(messages("https://crikket.example.test/app")).toEqual([
      "Must be an origin only: no path, query or hash",
    ])
    expect(messages("ftp://crikket.example.test")).toEqual([
      "Must be an http(s) origin without credentials",
    ])
    // Unparseable input is reported by z.url() alone, not by the refinements.
    expect(messages("not a url")).toHaveLength(1)
    expect(messages("not a url")[0]).not.toContain("origin")
  })
})
