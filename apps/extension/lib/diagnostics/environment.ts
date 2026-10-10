import type { AppRouterClient } from "@crikket/api/routers/index"
import { env } from "@crikket/env/extension"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { getRpcUrl } from "../app-urls"
import { BUILD_SHA } from "../build-sha"
import type { CapabilityName, DiagnosticsEnvironment, HttpEcho } from "./checks"
import { installErrorLog } from "./error-log"
import { LAST_CAPTURE_STORAGE_KEY, parseLastCapture } from "./last-capture"

const STORAGE_PROBE_KEY = "diagnosticsStorageProbe"

async function readEcho(response: Response): Promise<HttpEcho> {
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? undefined,
    body: await response.text(),
  }
}

function pingHealthCheck(appUrl: string) {
  return async (signal: AbortSignal): Promise<HttpEcho> => {
    let echo: HttpEcho | undefined
    const link = new RPCLink({
      url: getRpcUrl(appUrl),
      async fetch(url, options) {
        const response = await fetch(url, {
          ...options,
          credentials: "include",
          signal,
        })
        echo = await readEcho(response.clone())
        return response
      },
    })
    try {
      await createORPCClient<AppRouterClient>(link).healthCheck(undefined, {
        signal,
      })
    } catch (error) {
      // A response that arrived but was not a clean answer is still evidence.
      if (!echo) {
        throw error
      }
    }
    if (!echo) {
      throw new Error("No response")
    }
    return echo
  }
}

function missingApis(capability: CapabilityName): string[] {
  const has = (value: unknown) => typeof value === "function"
  const missing: string[] = []
  switch (capability) {
    case "screenshot":
      if (!has(globalThis.chrome?.tabs?.captureVisibleTab)) {
        missing.push("chrome.tabs.captureVisibleTab")
      }
      break
    case "recording":
      if (typeof MediaRecorder === "undefined") {
        missing.push("MediaRecorder")
      }
      if (
        !(
          has(globalThis.chrome?.tabCapture?.getMediaStreamId) ||
          has(navigator.mediaDevices?.getDisplayMedia)
        )
      ) {
        missing.push("chrome.tabCapture or getDisplayMedia")
      }
      break
    case "debugger":
      if (!has(globalThis.chrome?.scripting?.executeScript)) {
        missing.push("chrome.scripting.executeScript")
      }
      break
    default:
      break
  }
  return missing
}

async function probeStorage(): Promise<void> {
  const token = `${Date.now()}-${Math.random()}`
  await chrome.storage.local.set({ [STORAGE_PROBE_KEY]: token })
  const stored = await chrome.storage.local.get([STORAGE_PROBE_KEY])
  await chrome.storage.local.remove([STORAGE_PROBE_KEY])
  if (stored[STORAGE_PROBE_KEY] !== token) {
    throw new Error("Storage did not return what was written")
  }
}

export function createChromeDiagnosticsEnvironment(
  appUrl: string = env.VITE_APP_URL
): DiagnosticsEnvironment {
  const errorLog = installErrorLog()
  return {
    version: chrome.runtime.getManifest().version,
    buildSha: BUILD_SHA,
    appUrl,
    probeApi: pingHealthCheck(appUrl),
    probeSession: async (signal) =>
      readEcho(
        await fetch(new URL("/api/auth/get-session", appUrl), {
          credentials: "include",
          signal,
        })
      ),
    missingApis,
    probeStorage,
    getLastCapture: async () =>
      parseLastCapture(
        (await chrome.storage.local.get([LAST_CAPTURE_STORAGE_KEY]))[
          LAST_CAPTURE_STORAGE_KEY
        ]
      ),
    listErrors: () => errorLog.list(),
  }
}

export function readAllStorage(): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(null)
}
