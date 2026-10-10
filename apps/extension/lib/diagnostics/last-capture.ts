export const LAST_CAPTURE_STORAGE_KEY = "diagnosticsLastCapture"

export type CaptureKind = "screenshot" | "video"

export type LastCapture = Partial<Record<CaptureKind, number>>

export function parseLastCapture(stored: unknown): LastCapture {
  if (typeof stored !== "object" || stored === null) {
    return {}
  }
  const result: LastCapture = {}
  for (const kind of ["screenshot", "video"] as const) {
    const value = (stored as Record<string, unknown>)[kind]
    if (typeof value === "number" && Number.isFinite(value)) {
      result[kind] = value
    }
  }
  return result
}

// Capture needs a user gesture, so the diagnostics page cannot try one. It
// reports when the last real capture worked instead. Failing to note it must
// never fail the capture itself.
export async function recordCaptureSuccess(
  kind: CaptureKind,
  now: () => number = Date.now
): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([LAST_CAPTURE_STORAGE_KEY])
    await chrome.storage.local.set({
      [LAST_CAPTURE_STORAGE_KEY]: {
        ...parseLastCapture(stored[LAST_CAPTURE_STORAGE_KEY]),
        [kind]: now(),
      },
    })
  } catch {
    // Diagnostics bookkeeping only.
  }
}
