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
  viewport: { height: number; width: number }
  devicePixelRatio: number
}

// Order matters: Edge, Opera and Samsung also say Chrome, Chrome also says Safari.
const BROWSER_PATTERNS: [string, RegExp][] = [
  ["Edge", /\bEdg(?:e|A|iOS)?\/([\d.]+)/],
  ["Opera", /\bOPR\/([\d.]+)/],
  ["Firefox", /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/([\d.]+)/],
  ["Safari", /\bVersion\/([\d.]+).*Safari\//],
]

export function parseBrowser(userAgent: string): {
  name: string
  version?: string
} {
  for (const [name, pattern] of BROWSER_PATTERNS) {
    const match = pattern.exec(userAgent)
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
  for (const [name, pattern] of OS_PATTERNS) {
    if (pattern.test(userAgent)) {
      return name
    }
  }
  return platform || "Unknown"
}

export function buildReportEnvironment(
  input: BuildReportEnvironmentInput
): ReportEnvironment {
  const environment: ReportEnvironment = {
    schemaVersion: ENVIRONMENT_SCHEMA_VERSION,
    extensionVersion: input.extensionVersion,
    buildSha: input.buildSha,
    browser: parseBrowser(input.userAgent),
    os: parseOs(input.userAgent, input.platform),
    viewport: {
      width: Math.max(0, Math.round(input.viewport.width)),
      height: Math.max(0, Math.round(input.viewport.height)),
    },
    devicePixelRatio: input.devicePixelRatio > 0 ? input.devicePixelRatio : 1,
    capture: {
      type: input.captureType,
      durationMs: Math.max(0, Math.round(input.durationMs)),
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

export async function collectReportEnvironment(input: {
  captureType: "screenshot" | "video"
  durationMs: number
  pageTitle?: string
  pageUrl?: string
}): Promise<ReportEnvironment> {
  return buildReportEnvironment({
    ...input,
    buildSha: BUILD_SHA,
    extensionVersion: chrome.runtime.getManifest().version,
    includePage: await readIncludePage(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
  })
}
