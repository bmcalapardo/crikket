import { describe, expect, test } from "bun:test"

import { getLoginUrl, getRpcUrl, getShareUrl } from "../lib/app-urls"

const APP_URL = "https://crikket-web.example.test"

describe("app urls", () => {
  test("puts login, RPC, and share links on the web app's origin", () => {
    expect(getLoginUrl(APP_URL)).toBe(`${APP_URL}/login`)
    expect(getRpcUrl(APP_URL)).toBe(`${APP_URL}/rpc`)
    expect(getShareUrl(APP_URL, "/s/report-1")).toBe(`${APP_URL}/s/report-1`)
  })
})

describe("getShareUrl negative cases", () => {
  test("keeps share links on the web app's origin whatever the server sends", () => {
    for (const sharePath of [
      "//evil.test/x",
      "https://evil.test/x",
      "/evil.test/x",
      "javascript:alert(1)",
      "http://[",
    ]) {
      expect(new URL(getShareUrl(APP_URL, sharePath)).origin).toBe(APP_URL)
    }
  })
})
