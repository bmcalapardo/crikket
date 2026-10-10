import { describe, expect, test } from "bun:test"
import { describeEnvironment } from "../src/lib/report-environment-view"

const full = {
  schemaVersion: 1,
  extensionVersion: "0.1.4",
  buildSha: "abcdef0123456",
  browser: { name: "Chrome", version: "126.0.0.0" },
  os: "Windows",
  viewport: { width: 1280, height: 720 },
  devicePixelRatio: 2,
  capture: { type: "video", durationMs: 1500 },
  page: { url: "https://a.example/x", title: "A" },
}
const labels = (value: unknown) =>
  describeEnvironment(value).map((r) => r.label)

describe("describeEnvironment", () => {
  test("renders every field of a full environment", () => {
    const rows = describeEnvironment(full)
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Extension", "0.1.4 (abcdef0)"],
      ["Browser", "Chrome 126.0.0.0"],
      ["OS", "Windows"],
      ["Viewport", "1280x720 @2x"],
      ["Capture", "video, 1.5s"],
      ["Page URL", "https://a.example/x"],
      ["Page title", "A"],
    ])
  })

  test("absent environment renders nothing", () => {
    for (const value of [null, undefined, "x", 5, [], true]) {
      expect(describeEnvironment(value)).toEqual([])
    }
  })

  test("partial environments render what they have", () => {
    expect(labels({ os: "Linux" })).toEqual(["OS"])
    expect(labels({ ...full, page: undefined })).not.toContain("Page URL")
    expect(labels({ viewport: { width: 1 } })).toEqual([])
    expect(labels({ browser: "Chrome", capture: 3 })).toEqual([])
  })

  test("a future schemaVersion with extra and changed fields does not throw", () => {
    const future = {
      ...full,
      schemaVersion: 99,
      browser: { name: "Chrome", version: 126, channel: "beta" },
      testerLabel: "qa-1",
      viewport: "1280x720",
    }
    expect(() => describeEnvironment(future)).not.toThrow()
    expect(labels(future)).toContain("Browser")
    expect(labels(future)).not.toContain("Viewport")
  })

  test("hostile values stay plain strings and are bounded", () => {
    const title = "<img src=x onerror=alert(1)>"
    const rows = describeEnvironment({
      ...full,
      page: { title, url: "a".repeat(1_000_000) },
      os: { toString: () => "x" },
      devicePixelRatio: Number.NaN,
      capture: { type: "video", durationMs: Number.POSITIVE_INFINITY },
    })
    expect(rows.find((r) => r.label === "Page title")?.value).toBe(title)
    expect(rows.find((r) => r.label === "Page URL")?.value.length).toBe(2048)
    expect(labels({ os: { a: 1 } })).toEqual([])
    expect(rows.find((r) => r.label === "Viewport")?.value).toBe("1280x720")
    expect(rows.find((r) => r.label === "Capture")?.value).toBe("video")
    for (const row of rows) {
      expect(typeof row.value).toBe("string")
    }
  })
})
