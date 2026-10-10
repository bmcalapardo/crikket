import { describe, expect, test } from "bun:test"
import { os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { Hono } from "hono"
import { createRpcOriginGuard } from "../src/cors-origin"

const allowed = ["https://app.example.com"]

function buildApp() {
  const writes: string[] = []
  const router = {
    mutate: os.handler(() => {
      writes.push("write")
      return { ok: true }
    }),
  }
  const rpc = new RPCHandler(router)
  const app = new Hono()
  app.use("/rpc/*", createRpcOriginGuard(allowed))
  app.all("/rpc/*", async (c) => {
    const result = await rpc.handle(c.req.raw, { prefix: "/rpc", context: {} })
    return result.matched ? result.response : c.text("nf", 404)
  })
  return { app, writes }
}

// A cross-site form or `fetch(no-cors)` with a Blob body sends no Content-Type
// and no preflight; oRPC parses a missing Content-Type as JSON.
const blobBody = () => new Blob(['{"json":null}'])

describe("cross-site POST to /rpc", () => {
  test("baseline: oRPC executes a body without Content-Type", async () => {
    const { app, writes } = buildApp()
    const res = await app.request("/rpc/mutate", {
      method: "POST",
      body: blobBody(),
    })
    expect(res.status).toBe(200)
    expect(writes).toHaveLength(1)
  })

  for (const origin of [
    "https://evil.example",
    "null",
    "",
    "https://app.example.com.evil.example",
    "https://app.example.com:444",
    "HTTPS://APP.EXAMPLE.COM",
  ]) {
    test(`rejects Origin ${JSON.stringify(origin)} without running the handler`, async () => {
      const { app, writes } = buildApp()
      const res = await app.request("/rpc/mutate", {
        method: "POST",
        headers: { origin },
        body: blobBody(),
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({
        code: "FORBIDDEN",
        message: "Untrusted origin.",
      })
      expect(writes).toHaveLength(0)
    })
  }

  test("allows the web app, extensions and origin-less callers", async () => {
    for (const origin of [
      "https://app.example.com",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      "moz-extension://4b0f5d1e-2c3a-4b5c-9d8e-7f6a5b4c3d2e",
      undefined,
    ]) {
      const { app, writes } = buildApp()
      const res = await app.request("/rpc/mutate", {
        method: "POST",
        headers: origin ? { origin } : {},
        body: blobBody(),
      })
      expect(res.status).toBe(200)
      expect(writes).toHaveLength(1)
    }
  })
})
