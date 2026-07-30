import { reportNonFatalError } from "@crikket/shared/lib/errors"

const DEBUGGER_CONTENT_BRIDGE_FILE = "debugger-content-bridge.js"
const DEBUGGER_PAGE_RUNTIME_FILE = "debugger-page.js"

// Debugger scripts are injected only when a capture session starts.
// Avoid always-on content scripts: patching fetch/XHR on every tab breaks
// third-party web app save flows (Docs, Sheets, Notion, etc.).

export function createSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  const random = Math.random().toString(36).slice(2, 10)
  return `dbg_${Date.now()}_${random}`
}

export async function injectDebuggerScriptIntoTab(
  tabId: number
): Promise<void> {
  if (!chrome.scripting?.executeScript) {
    return
  }

  try {
    await chrome.scripting.executeScript({
      target: {
        tabId,
      },
      files: [DEBUGGER_CONTENT_BRIDGE_FILE],
    })

    await chrome.scripting.executeScript({
      target: {
        tabId,
      },
      world: "MAIN",
      files: [DEBUGGER_PAGE_RUNTIME_FILE],
    })
  } catch (error) {
    reportNonFatalError(
      `Failed to inject debugger instrumentation script into tab ${tabId}`,
      error
    )
  }
}

export function isInjectablePageUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://")
}
