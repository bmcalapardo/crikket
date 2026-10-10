import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"

import {
  EXTENSION_COMMANDS,
  EXTENSION_HOST_PERMISSIONS,
  EXTENSION_PERMISSIONS,
} from "../lib/manifest-contract"
import {
  checkBackendHealth,
  type HealthFetch,
  readZipEntry,
  resolveHealthUrl,
  verifyManifest,
  verifyPackage,
  verifyRelease,
} from "../scripts/verify-release"

// Minimal zip writer (no CRC checking is done by the reader, so zeros do).
function makeZip(
  files: Record<string, string>,
  method: "deflate" | "store" = "deflate"
): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content)
    const data = method === "deflate" ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04_03_4b_50, 0)
    local.writeUInt16LE(method === "deflate" ? 8 : 0, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02_01_4b_50, 0)
    central.writeUInt16LE(method === "deflate" ? 8 : 0, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06_05_4b_50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, eocd])
}

function goodManifest(): Record<string, unknown> {
  return {
    name: "Crikket",
    version: "0.3.0",
    manifest_version: 3,
    commands: structuredClone(EXTENSION_COMMANDS),
    permissions: [...EXTENSION_PERMISSIONS],
    host_permissions: [...EXTENSION_HOST_PERMISSIONS],
  }
}

const dirs: string[] = []
function tempZip(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "verify-release-"))
  dirs.push(dir)
  const path = join(dir, "extension.zip")
  writeFileSync(path, makeZip(files))
  return path
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

const healthFetch =
  (body: unknown, status = 200): HealthFetch =>
  () =>
    Promise.resolve({
      json: () => Promise.resolve(body),
      ok: status >= 200 && status < 300,
      status,
    })

describe("readZipEntry", () => {
  test("reads deflated and stored entries", () => {
    for (const method of ["deflate", "store"] as const) {
      const zip = makeZip({ "a.txt": "one", "manifest.json": "{}" }, method)
      expect(readZipEntry(zip, "manifest.json")?.toString()).toBe("{}")
      expect(readZipEntry(zip, "a.txt")?.toString()).toBe("one")
    }
  })

  test("returns null for a missing entry and throws for non-zips", () => {
    expect(readZipEntry(makeZip({ "a.txt": "x" }), "manifest.json")).toBeNull()
    expect(() =>
      readZipEntry(Buffer.from("not a zip at all, sorry"), "x")
    ).toThrow("Not a valid zip")
  })
})

describe("verifyManifest", () => {
  test("accepts the manifest built from the contract", () => {
    expect(verifyManifest(goodManifest(), { browser: "chrome" })).toEqual([])
  })

  test("reports every missing command and permission", () => {
    const manifest = goodManifest()
    manifest.commands = {}
    manifest.permissions = []
    manifest.host_permissions = []
    const errors = verifyManifest(manifest, { browser: "chrome" })
    expect(errors).toContain('Missing command "toggle-pause-recording".')
    expect(errors).toContain('Missing permission "tabCapture".')
    expect(errors).toContain('Missing host permission "<all_urls>".')
  })

  test("reports a changed suggested key", () => {
    const manifest = goodManifest()
    manifest.commands = {
      ...EXTENSION_COMMANDS,
      "start-video-recording": {
        description: "x",
        suggested_key: { default: "Ctrl+Q" },
      },
    }
    expect(
      verifyManifest(manifest, { browser: "chrome" }).some((e) =>
        e.includes("start-video-recording")
      )
    ).toBe(true)
  })

  test("accepts Firefox host permissions folded into permissions", () => {
    const manifest = goodManifest()
    manifest.host_permissions = undefined
    manifest.permissions = [
      ...EXTENSION_PERMISSIONS,
      ...EXTENSION_HOST_PERMISSIONS,
    ]
    expect(verifyManifest(manifest, { browser: "firefox" })).toEqual([])
    expect(verifyManifest(manifest, { browser: "chrome" })).toHaveLength(1)
  })

  test("rejects an invalid shape, version and package mismatch", () => {
    expect(verifyManifest("nope", { browser: "chrome" })).toHaveLength(1)
    const manifest = { ...goodManifest(), manifest_version: 1, version: "x" }
    expect(verifyManifest(manifest, { browser: "chrome" })).toHaveLength(2)
    expect(
      verifyManifest(goodManifest(), {
        browser: "chrome",
        expectedVersion: "0.4.0",
      })[0]
    ).toContain("does not match package version")
  })
})

describe("verifyPackage", () => {
  test("passes for a package with a good manifest", () => {
    const zipPath = tempZip({ "manifest.json": JSON.stringify(goodManifest()) })
    expect(verifyPackage({ browser: "chrome", zipPath })).toEqual([])
  })

  test("fails when the package is missing", () => {
    const [error] = verifyPackage({
      browser: "chrome",
      zipPath: join(tmpdir(), "does-not-exist-crikket.zip"),
    })
    expect(error).toContain("not found")
  })

  test("fails for a package without or with a broken manifest", () => {
    expect(
      verifyPackage({ browser: "chrome", zipPath: tempZip({ "a.js": "1" }) })[0]
    ).toContain("no manifest.json")
    expect(
      verifyPackage({
        browser: "chrome",
        zipPath: tempZip({ "manifest.json": "{oops" }),
      })[0]
    ).toContain("not valid JSON")
  })
})

describe("backend health", () => {
  const url = "https://app.example.com/server-health"

  test("derives the health URL", () => {
    expect(resolveHealthUrl({ appUrl: "https://app.example.com" })).toBe(url)
    expect(resolveHealthUrl({ serverUrl: "https://api.example.com/x" })).toBe(
      "https://api.example.com/health"
    )
    expect(() => resolveHealthUrl({})).toThrow("No backend")
  })

  test("passes for an ok payload and reports version and commit", async () => {
    const result = await checkBackendHealth({
      fetchImpl: healthFetch({ status: "ok", version: "0.3.0", commit: "abc" }),
      url,
    })
    expect(result.errors).toEqual([])
    expect(result.health).toEqual({ commit: "abc", version: "0.3.0" })
  })

  test("fails when unreachable, non-200 or malformed", async () => {
    const down = await checkBackendHealth({
      fetchImpl: () => Promise.reject(new Error("ECONNREFUSED")),
      url,
    })
    expect(down.errors[0]).toContain("unreachable")
    expect(
      (await checkBackendHealth({ fetchImpl: healthFetch({}, 503), url }))
        .errors[0]
    ).toContain("HTTP 503")
    expect(
      (await checkBackendHealth({ fetchImpl: healthFetch({ hi: 1 }), url }))
        .errors[0]
    ).toContain("unexpected")
  })

  test("fails on a known commit mismatch but tolerates unknown", async () => {
    const payload = { status: "ok", version: "1", commit: "old" }
    const mismatch = await checkBackendHealth({
      expectedCommit: "new",
      fetchImpl: healthFetch(payload),
      url,
    })
    expect(mismatch.errors[0]).toContain("expected new")
    const unknown = await checkBackendHealth({
      expectedCommit: "new",
      fetchImpl: healthFetch({ ...payload, commit: "unknown" }),
      url,
    })
    expect(unknown.errors).toEqual([])
  })
})

describe("verifyRelease", () => {
  test("collects package and backend errors together", async () => {
    const result = await verifyRelease({
      appUrl: "https://app.example.com",
      browser: "chrome",
      fetchImpl: healthFetch({}, 500),
      skipHealth: false,
      zipPath: join(tmpdir(), "does-not-exist-crikket.zip"),
    })
    expect(result.errors).toHaveLength(2)
  })

  test("skips the backend check when asked", async () => {
    const zipPath = tempZip({ "manifest.json": JSON.stringify(goodManifest()) })
    const result = await verifyRelease({
      browser: "chrome",
      fetchImpl: () => Promise.reject(new Error("must not be called")),
      skipHealth: true,
      zipPath,
    })
    expect(result.errors).toEqual([])
    expect(result.notes).toEqual(["Backend health check skipped."])
  })
})
