import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { buildHealthPayload, handleHealth, UNKNOWN } from "../src/health"

describe("buildHealthPayload", () => {
  test("reports the configured version and commit", () => {
    expect(
      buildHealthPayload({ APP_VERSION: "0.3.0", GIT_COMMIT_SHA: "abc123" })
    ).toEqual({ status: "ok", version: "0.3.0", commit: "abc123" })
  })

  test("falls back to the Vercel commit", () => {
    expect(buildHealthPayload({ VERCEL_GIT_COMMIT_SHA: "def456" }).commit).toBe(
      "def456"
    )
  })

  test("prefers GIT_COMMIT_SHA over the Vercel commit", () => {
    expect(
      buildHealthPayload({
        GIT_COMMIT_SHA: "abc",
        VERCEL_GIT_COMMIT_SHA: "def",
      }).commit
    ).toBe("abc")
  })

  test("reports unknown when nothing is configured or values are blank", () => {
    expect(buildHealthPayload({})).toEqual({
      status: "ok",
      version: UNKNOWN,
      commit: UNKNOWN,
    })
    expect(
      buildHealthPayload({ APP_VERSION: "  ", GIT_COMMIT_SHA: "" })
    ).toEqual({ status: "ok", version: UNKNOWN, commit: UNKNOWN })
  })
})

describe("GET /health", () => {
  // Mirrors how index.ts mounts it: behind CORS, ahead of auth and rate limits.
  const app = new Hono()
  app.use("/*", cors({ origin: () => "https://app.example.com" }))
  app.get("/health", () => handleHealth({ APP_VERSION: "1.2.3" }))
  app.use("/*", async (c) => await c.text("blocked", 401))
  app.get("/", (c) => c.text("OK"))

  test("answers 200 JSON without being blocked by later middleware", async () => {
    const res = await app.request("/health", {
      headers: { origin: "chrome-extension://abc" },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual({
      status: "ok",
      version: "1.2.3",
      commit: UNKNOWN,
    })
  })
})
