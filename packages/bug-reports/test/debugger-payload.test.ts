import { describe, expect, test } from "bun:test"
import { gzipSync } from "node:zlib"
import {
  decodeDebuggerPayload,
  MAX_DEBUGGER_PAYLOAD_BYTES,
} from "../src/lib/debugger-payload"

describe("decodeDebuggerPayload", () => {
  test("passes through plain and gzip payloads", () => {
    const json = Buffer.from('{"logs":[]}')
    expect(decodeDebuggerPayload(json, null).toString()).toBe('{"logs":[]}')
    expect(decodeDebuggerPayload(gzipSync(json), "gzip").toString()).toBe(
      '{"logs":[]}'
    )
  })

  test("rejects a gzip bomb without inflating it", () => {
    const bomb = gzipSync(Buffer.alloc(MAX_DEBUGGER_PAYLOAD_BYTES * 4))
    expect(bomb.byteLength).toBeLessThan(10 * 1024 * 1024)
    expect(() => decodeDebuggerPayload(bomb, "gzip")).toThrow(
      "when decompressed"
    )
  })

  test("rejects an oversized stored payload", () => {
    const big = Buffer.alloc(MAX_DEBUGGER_PAYLOAD_BYTES + 1)
    expect(() => decodeDebuggerPayload(big, null)).toThrow(
      "maximum allowed size"
    )
  })
})
