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
