import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { inflateRawSync } from "node:zlib"
import {
  EXTENSION_COMMANDS,
  EXTENSION_HOST_PERMISSIONS,
  EXTENSION_PERMISSIONS,
} from "../lib/manifest-contract"

// Post-build smoke checks, run before a release is published: the package
// exists, its manifest is valid and carries the expected commands and
// permissions, and the backend the build targets is up and says which build
// it is. Every problem is collected so a failing run shows all of them at once.

export type Browser = "chrome" | "firefox"

export interface HealthResult {
  commit: string
  version: string
}

export type HealthFetch = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ json(): Promise<unknown>; ok: boolean; status: number }>

const EOCD_SIGNATURE = 0x06_05_4b_50
const CENTRAL_SIGNATURE = 0x02_01_4b_50
const LOCAL_SIGNATURE = 0x04_03_4b_50
const EOCD_MIN_SIZE = 22
const MAX_COMMENT_SIZE = 0xff_ff
const STORED = 0
const DEFLATED = 8
const MANIFEST_VERSION_PATTERN = /^\d+(\.\d+){0,3}$/
const HEALTH_TIMEOUT_MS = 15_000

// Reads one file out of a zip held in memory, or null when it is not there.
// wxt zips only hold stored and deflated entries, so nothing else is read.
export function readZipEntry(zip: Buffer, name: string): Buffer | null {
  let eocd = -1
  const lowest = Math.max(0, zip.length - EOCD_MIN_SIZE - MAX_COMMENT_SIZE)
  for (let i = zip.length - EOCD_MIN_SIZE; i >= lowest; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) {
    throw new Error(
      "Not a valid zip file (no end-of-central-directory record)."
    )
  }

  const count = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error("Corrupt zip central directory.")
    }
    const method = zip.readUInt16LE(offset + 10)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localOffset = zip.readUInt32LE(offset + 42)
    const entryName = zip.toString(
      "utf8",
      offset + 46,
      offset + 46 + nameLength
    )

    if (entryName === name) {
      if (zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
        throw new Error(`Corrupt zip entry header for ${name}.`)
      }
      const dataStart =
        localOffset +
        30 +
        zip.readUInt16LE(localOffset + 26) +
        zip.readUInt16LE(localOffset + 28)
      const data = zip.subarray(dataStart, dataStart + compressedSize)
      if (method === STORED) {
        return Buffer.from(data)
      }
      if (method === DEFLATED) {
        return inflateRawSync(data)
      }
      throw new Error(`Unsupported zip compression method ${method}.`)
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  return null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []

// Returns every problem found; an empty list means the manifest is good.
export function verifyManifest(
  manifest: unknown,
  options: { browser: Browser; expectedVersion?: string }
): string[] {
  if (!isRecord(manifest)) {
    return ["manifest.json is not a JSON object."]
  }

  return [
    ...verifyManifestBasics(manifest, options.expectedVersion),
    ...verifyCommands(manifest),
    ...verifyPermissions(manifest, options.browser),
  ]
}

function verifyManifestBasics(
  manifest: Record<string, unknown>,
  expectedVersion: string | undefined
): string[] {
  const errors: string[] = []
  const { name, version, manifest_version: manifestVersion } = manifest

  if (typeof name !== "string" || name.trim() === "") {
    errors.push("manifest.json has no name.")
  }
  if (typeof version !== "string" || !MANIFEST_VERSION_PATTERN.test(version)) {
    errors.push(`manifest.json version "${String(version)}" is not valid.`)
  } else if (expectedVersion && !expectedVersion.startsWith(version)) {
    errors.push(
      `manifest.json version ${version} does not match package version ${expectedVersion}.`
    )
  }
  if (manifestVersion !== 2 && manifestVersion !== 3) {
    errors.push(
      `manifest.json manifest_version ${String(manifestVersion)} is not 2 or 3.`
    )
  }
  return errors
}

function verifyCommands(manifest: Record<string, unknown>): string[] {
  const errors: string[] = []
  const commands = isRecord(manifest.commands) ? manifest.commands : {}
  for (const [command, expected] of Object.entries(EXTENSION_COMMANDS)) {
    const actual = commands[command]
    if (!isRecord(actual)) {
      errors.push(`Missing command "${command}".`)
      continue
    }
    const expectedKey =
      "suggested_key" in expected ? expected.suggested_key : null
    const actualKey = isRecord(actual.suggested_key)
      ? actual.suggested_key.default
      : undefined
    if (expectedKey && actualKey !== expectedKey.default) {
      errors.push(
        `Command "${command}" suggested key is ${String(actualKey)}, expected ${expectedKey.default}.`
      )
    }
  }
  return errors
}

function verifyPermissions(
  manifest: Record<string, unknown>,
  browser: Browser
): string[] {
  const errors: string[] = []
  // Firefox builds may fold host permissions into "permissions" (MV2).
  const permissions = stringList(manifest.permissions)
  const hostPermissions = stringList(manifest.host_permissions)
  for (const permission of EXTENSION_PERMISSIONS) {
    if (!permissions.includes(permission)) {
      errors.push(`Missing permission "${permission}".`)
    }
  }
  for (const host of EXTENSION_HOST_PERMISSIONS) {
    const present =
      hostPermissions.includes(host) ||
      (browser === "firefox" && permissions.includes(host))
    if (!present) {
      errors.push(`Missing host permission "${host}".`)
    }
  }

  return errors
}

// Reads the package (a zip) and checks its manifest.json.
export function verifyPackage(options: {
  browser: Browser
  expectedVersion?: string
  zipPath: string
}): string[] {
  const { zipPath } = options
  if (!existsSync(zipPath)) {
    return [`Extension package not found: ${zipPath}`]
  }

  let manifestText: Buffer | null
  try {
    manifestText = readZipEntry(readFileSync(zipPath), "manifest.json")
  } catch (error) {
    return [`Cannot read ${zipPath}: ${(error as Error).message}`]
  }
  if (!manifestText) {
    return [`${zipPath} has no manifest.json.`]
  }

  let manifest: unknown
  try {
    manifest = JSON.parse(manifestText.toString("utf8"))
  } catch {
    return [`manifest.json in ${zipPath} is not valid JSON.`]
  }
  return verifyManifest(manifest, options)
}

// The backend health URL: SERVER_URL when given, otherwise the app URL, whose
// web app proxies /server-health to the server's /health.
export function resolveHealthUrl(input: {
  appUrl?: string
  serverUrl?: string
}): string {
  if (input.serverUrl) {
    return new URL("/health", input.serverUrl).toString()
  }
  if (input.appUrl) {
    return new URL("/server-health", input.appUrl).toString()
  }
  throw new Error(
    "No backend to check: set APP_URL (or SERVER_URL), or pass --skip-health."
  )
}

export async function checkBackendHealth(input: {
  expectedCommit?: string
  fetchImpl?: HealthFetch
  url: string
}): Promise<{ errors: string[]; health?: HealthResult }> {
  const doFetch = input.fetchImpl ?? (fetch as unknown as HealthFetch)
  let response: Awaited<ReturnType<HealthFetch>>
  try {
    response = await doFetch(input.url, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
  } catch (error) {
    return {
      errors: [
        `Backend ${input.url} is unreachable: ${(error as Error).message}`,
      ],
    }
  }
  if (!response.ok) {
    return {
      errors: [`Backend ${input.url} answered HTTP ${response.status}.`],
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { errors: [`Backend ${input.url} did not return JSON.`] }
  }
  if (
    !isRecord(body) ||
    body.status !== "ok" ||
    typeof body.version !== "string" ||
    typeof body.commit !== "string"
  ) {
    return {
      errors: [`Backend ${input.url} returned an unexpected /health payload.`],
    }
  }

  const health = { commit: body.commit, version: body.version }
  const errors: string[] = []
  // "unknown" means the deploy did not record a commit; that is reported, not
  // failed, because only a known mismatch proves the wrong build is live.
  if (
    input.expectedCommit &&
    health.commit !== "unknown" &&
    health.commit !== input.expectedCommit
  ) {
    errors.push(
      `Backend runs commit ${health.commit}, expected ${input.expectedCommit}.`
    )
  }
  return { errors, health }
}

export interface VerifyOptions {
  appUrl?: string
  browser: Browser
  expectedCommit?: string
  expectedVersion?: string
  fetchImpl?: HealthFetch
  serverUrl?: string
  skipHealth: boolean
  zipPath: string
}

export async function verifyRelease(
  options: VerifyOptions
): Promise<{ errors: string[]; health?: HealthResult; notes: string[] }> {
  const errors = verifyPackage(options)
  const notes: string[] = []
  let health: HealthResult | undefined

  if (options.skipHealth) {
    notes.push("Backend health check skipped.")
  } else {
    const result = await checkBackendHealth({
      expectedCommit: options.expectedCommit,
      fetchImpl: options.fetchImpl,
      url: resolveHealthUrl(options),
    })
    errors.push(...result.errors)
    health = result.health
    if (health) {
      notes.push(
        `Backend reports version ${health.version}, commit ${health.commit}.`
      )
    }
  }
  return { errors, health, notes }
}

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {}
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--skip-health") {
      flags.add("skip-health")
    } else if (arg.startsWith("--") && i + 1 < argv.length) {
      values[arg.slice(2)] = argv[++i]
    } else {
      throw new Error(`Unknown argument "${arg}".`)
    }
  }
  return { flags, values }
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2))
  if (!values.zip) {
    throw new Error("Missing --zip <path to the extension package>.")
  }
  const browser = values.browser === "firefox" ? "firefox" : "chrome"
  const packageJson = JSON.parse(
    readFileSync(resolve(import.meta.dir, "../package.json"), "utf8")
  ) as { version: string }

  const { errors, notes } = await verifyRelease({
    appUrl: values["app-url"] ?? process.env.APP_URL,
    browser,
    expectedCommit: values["expected-commit"],
    expectedVersion: packageJson.version,
    serverUrl: values["server-url"] ?? process.env.SERVER_URL,
    skipHealth: flags.has("skip-health"),
    zipPath: resolve(values.zip),
  })

  for (const note of notes) {
    console.log(note)
  }
  if (errors.length === 0) {
    console.log(`Release verification passed (${browser}).`)
  }
  for (const error of errors) {
    console.log(`::error::${error}`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines =
      errors.length === 0
        ? [
            `### Release verification (${browser}): passed`,
            ...notes.map((n) => `- ${n}`),
          ]
        : [
            `### Release verification (${browser}): FAILED`,
            ...errors.map((e) => `- ${e}`),
          ]
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`)
  }
  if (errors.length > 0) {
    process.exit(1)
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`::error::${(error as Error).message}`)
    process.exit(1)
  })
}
