import { redactUrl } from "@crikket/capture-core/debugger/redaction"
import { BUILD_SHA } from "./build-sha"

// What the tester was running, attached to every Report the extension submits.
// Mirrors environmentInputSchema in @crikket/bug-reports. Additive optional
// fields (tester label, release channel) keep the version; a changed or
// removed field bumps it.
export const ENVIRONMENT_SCHEMA_VERSION = 1

export interface ReportEnvironment {
  browser: { name: string; version?: string }
  buildSha: string
  capture: { durationMs: number; type: "screenshot" | "video" }
  devicePixelRatio: number
  extensionVersion: string
  os?: string
  page?: { title?: string; url?: string }
  schemaVersion: typeof ENVIRONMENT_SCHEMA_VERSION
  viewport: { height: number; width: number }
}

export interface BuildReportEnvironmentInput {
  buildSha: string
  captureType: "screenshot" | "video"
  durationMs: number
  extensionVersion: string
  includePage: boolean
  pageTitle?: string
  pageUrl?: string
  platform?: string
  userAgent: string
  // navigator.userAgentData, when the browser has it (Chromium). Preferred over
  // the UA string, which is frozen or reduced and can be spoofed more easily.
  clientHints?: ClientHints
  viewport: { height: number; width: number }
  devicePixelRatio: number
}

export interface ClientHints {
  brands?: { brand: string; version: string }[]
  fullVersionList?: { brand: string; version: string }[]
  platform?: string
}

// Brands worth naming. Chromium browsers also list a randomised GREASE brand
// ("Not A;Brand") and the engine ("Chromium"); neither is the product.
const HINT_BROWSERS: Record<string, string> = {
  "Microsoft Edge": "Edge",
  Opera: "Opera",
  Brave: "Brave",
  "Google Chrome": "Chrome",
  Chromium: "Chromium",
}
const HINT_PRIORITY = ["Edge", "Opera", "Brave", "Chrome", "Chromium"]

export function browserFromClientHints(
  hints: ClientHints | undefined
): { name: string; version?: string } | undefined {
  const list = hints?.fullVersionList?.length
    ? hints.fullVersionList
    : hints?.brands
  if (!Array.isArray(list)) {
    return undefined
  }
  let best: { name: string; version?: string } | undefined
  for (const entry of list) {
    const name =
      typeof entry?.brand === "string" ? HINT_BROWSERS[entry.brand] : undefined
    if (!name) {
      continue
    }
    const version =
      typeof entry.version === "string" ? entry.version : undefined
    if (
      !best ||
      HINT_PRIORITY.indexOf(name) < HINT_PRIORITY.indexOf(best.name)
    ) {
      best = { name, version }
    }
  }
  return best
}

const HINT_PLATFORMS: Record<string, string> = {
  Windows: "Windows",
  macOS: "macOS",
  Android: "Android",
  Linux: "Linux",
  "Chrome OS": "ChromeOS",
}

export function osFromClientHints(
  hints: ClientHints | undefined
): string | undefined {
  const platform = hints?.platform
  return typeof platform === "string" && Object.hasOwn(HINT_PLATFORMS, platform)
    ? HINT_PLATFORMS[platform]
    : undefined
}

// Bounds the work a pathological user agent can cause, and the wire size.
const MAX_USER_AGENT_LENGTH = 1000

// Order matters: Edge, Opera and Samsung also say Chrome, Chrome also says Safari.
const BROWSER_PATTERNS: [string, RegExp][] = [
  ["Edge", /\bEdg(?:e|A|iOS)?\/([\d.]+)/],
  ["Opera", /\bOPR\/([\d.]+)/],
  ["Samsung Internet", /\bSamsungBrowser\/([\d.]+)/],
  ["Firefox", /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/([\d.]+)/],
  ["Safari", /\bVersion\/([\d.]+).*Safari\//],
]

export function parseBrowser(userAgent: string): {
  name: string
  version?: string
} {
  const ua = String(userAgent ?? "").slice(0, MAX_USER_AGENT_LENGTH)
  for (const [name, pattern] of BROWSER_PATTERNS) {
    const match = pattern.exec(ua)
    if (match) {
      return { name, version: match[1] }
    }
  }
  return { name: "Unknown" }
}

const OS_PATTERNS: [string, RegExp][] = [
  ["Windows", /Windows/],
  ["Android", /Android/],
  ["iOS", /iPhone|iPad|iPod/],
  ["macOS", /Mac OS X|Macintosh/],
  ["ChromeOS", /CrOS/],
  ["Linux", /Linux/],
]

export function parseOs(userAgent: string, platform?: string): string {
  const ua = String(userAgent ?? "").slice(0, MAX_USER_AGENT_LENGTH)
  for (const [name, pattern] of OS_PATTERNS) {
    if (pattern.test(ua)) {
      return name
    }
  }
  return platform || "Unknown"
}

// The server rejects a whole Report whose environment is out of range, so the
// extension clamps instead: an odd value must never cost the tester their Report.
function clampInt(value: number, max: number, fallback = 0): number {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.round(value)))
    : fallback
}

function clampText(value: string, max: number): string {
  return String(value ?? "").slice(0, max)
}

export function buildReportEnvironment(
  input: BuildReportEnvironmentInput
): ReportEnvironment {
  const browser =
    browserFromClientHints(input.clientHints) ?? parseBrowser(input.userAgent)
  const os =
    osFromClientHints(input.clientHints) ??
    parseOs(input.userAgent, input.platform)
  const environment: ReportEnvironment = {
    schemaVersion: ENVIRONMENT_SCHEMA_VERSION,
    extensionVersion: clampText(input.extensionVersion, 40),
    buildSha: clampText(input.buildSha, 80),
    browser: {
      name: clampText(browser.name, 60),
      ...(browser.version ? { version: clampText(browser.version, 40) } : {}),
    },
    os: clampText(os, 100),
    viewport: {
      width: clampInt(input.viewport.width, 100_000),
      height: clampInt(input.viewport.height, 100_000),
    },
    devicePixelRatio:
      Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0
        ? Math.min(100, input.devicePixelRatio)
        : 1,
    capture: {
      type: input.captureType,
      durationMs: clampInt(input.durationMs, 24 * 60 * 60 * 1000),
    },
  }
  if (input.includePage) {
    const url = input.pageUrl?.trim()
    const title = input.pageTitle?.trim()
    if (url || title) {
      environment.page = {
        ...(url ? { url: redactUrl(url).slice(0, 2048) } : {}),
        ...(title ? { title: title.slice(0, 300) } : {}),
      }
    }
  }
  return environment
}

// Setting stored in chrome.storage.local, edited on the diagnostics page.
export const INCLUDE_PAGE_STORAGE_KEY = "environmentIncludePage"

// Defaults ON: only an explicit false opts out.
export function parseIncludePage(stored: unknown): boolean {
  return stored !== false
}

export async function readIncludePage(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get([INCLUDE_PAGE_STORAGE_KEY])
    return parseIncludePage(stored[INCLUDE_PAGE_STORAGE_KEY])
  } catch {
    return true
  }
}

export async function writeIncludePage(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [INCLUDE_PAGE_STORAGE_KEY]: value })
}

interface NavigatorWithClientHints {
  userAgentData?: ClientHints & {
    getHighEntropyValues?: (hints: string[]) => Promise<ClientHints>
  }
}

async function readClientHints(): Promise<ClientHints | undefined> {
  const data = (navigator as unknown as NavigatorWithClientHints).userAgentData
  if (!data) {
    return undefined
  }
  const low: ClientHints = { brands: data.brands, platform: data.platform }
  try {
    const high = await data.getHighEntropyValues?.(["fullVersionList"])
    return { ...low, fullVersionList: high?.fullVersionList }
  } catch {
    return low
  }
}

// The environment is optional on the wire, so a failure to collect it must not
// stop the Report from being submitted.
export async function collectReportEnvironment(input: {
  captureType: "screenshot" | "video"
  durationMs: number
  pageTitle?: string
  pageUrl?: string
}): Promise<ReportEnvironment | undefined> {
  try {
    return buildReportEnvironment({
      ...input,
      buildSha: BUILD_SHA,
      clientHints: await readClientHints(),
      extensionVersion: chrome.runtime.getManifest().version,
      includePage: await readIncludePage(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
    })
  } catch {
    return undefined
  }
}
