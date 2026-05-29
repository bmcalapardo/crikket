export const DEBUG_BUILD_ID = "probes-v3-polar-signup-fix"

type DebugLogInput = {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
}

export const writeDebugLog = ({
  hypothesisId,
  location,
  message,
  data = {},
}: DebugLogInput): void => {
  const payload = {
    sessionId: "1bef44",
    debugBuildId: DEBUG_BUILD_ID,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  }

  // #region agent log
  console.log("[crikket-debug]", JSON.stringify(payload))
  fetch("http://127.0.0.1:7482/ingest/db513f7a-032d-45d9-b73e-6f2d49a123b5", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "1bef44",
    },
    body: JSON.stringify(payload),
  }).catch(() => undefined)
  // #endregion
}
