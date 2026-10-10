import { describe, expect, it, mock } from "bun:test"

// upload-session pulls in db and storage, which validate server env at import.
// The schema under test needs none of it, so stand in for the env module.
mock.module("@crikket/env/server", () => ({
  env: new Proxy({}, { get: () => "http://localhost:1/x" }),
}))

const { createBugReportUploadSessionInputSchema } = await import(
  "../src/lib/upload-session"
)

const environment = {
  schemaVersion: 1,
  extensionVersion: "0.1.4",
  buildSha: "abc123",
  browser: { name: "Chrome", version: "126.0.0.0" },
  os: "Windows",
  viewport: { width: 1280, height: 720 },
  devicePixelRatio: 2,
  capture: { type: "video", durationMs: 1500 },
  page: { url: "https://example.com/a?x=1", title: "A" },
}

describe("upload session input carries the environment", () => {
  it("passes a valid environment through unchanged", () => {
    const parsed = createBugReportUploadSessionInputSchema.parse({
      attachmentType: "video",
      environment,
    })
    expect(parsed.environment).toEqual(environment)
  })

  it("old clients and the SDK send no environment and still validate", () => {
    const parsed = createBugReportUploadSessionInputSchema.parse({
      attachmentType: "screenshot",
      deviceInfo: { browser: "UA", os: "Win32", viewport: "1x1" },
    })
    expect(parsed.environment).toBeUndefined()
    expect(parsed.deviceInfo).toEqual({
      browser: "UA",
      os: "Win32",
      viewport: "1x1",
    })
  })

  it("rejects a hostile environment for the whole request", () => {
    const result = createBugReportUploadSessionInputSchema.safeParse({
      attachmentType: "video",
      environment: { ...environment, viewport: { width: -1, height: 1 } },
    })
    expect(result.success).toBeFalse()
  })

  it("the stored JSON round trips: what is persisted is what is parsed back", () => {
    const parsed = createBugReportUploadSessionInputSchema.parse({
      attachmentType: "video",
      environment,
    })
    const throughJsonb = JSON.parse(JSON.stringify(parsed.environment))
    expect(throughJsonb).toEqual(environment)
  })
})
