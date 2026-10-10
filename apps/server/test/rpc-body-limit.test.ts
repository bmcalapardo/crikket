import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { rpcBodyLimit } from "../src/rpc-body-limit"

const MAX = 1024

function buildApp() {
  const app = new Hono()
  app.use("/rpc/*", rpcBodyLimit(MAX))
  app.post("/rpc/echo", async (c) =>
    c.text(String((await c.req.text()).length))
  )
  return app
}

function chunkedBody(total: number, chunk = 100) {
  let sent = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close()
        return
      }
      sent += chunk
      controller.enqueue(new Uint8Array(chunk).fill(97))
    },
  })
}

describe("rpcBodyLimit", () => {
  test("accepts a body under the cap", async () => {
    const res = await buildApp().request("/rpc/echo", {
      method: "POST",
      body: "x".repeat(MAX),
    })
    expect(res.status).toBe(200)
  })

  test("rejects a declared oversize body", async () => {
    const res = await buildApp().request("/rpc/echo", {
      method: "POST",
      body: "x".repeat(MAX + 1),
    })
    expect(res.status).toBe(413)
    expect(((await res.json()) as { code: string }).code).toBe(
      "PAYLOAD_TOO_LARGE"
    )
  })

  test("rejects an oversize chunked body with no Content-Length", async () => {
    const res = await buildApp().request("/rpc/echo", {
      method: "POST",
      body: chunkedBody(MAX * 50),
      duplex: "half",
    } as RequestInit)
    expect(res.status).toBe(413)
  })
})
