export const AUTH_DEBUG_BUILD_ID = "probes-v3-polar-signup-fix"

type AuthDebugLogInput = {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
}

export const writeAuthDebugLog = ({
  hypothesisId,
  location,
  message,
  data = {},
}: AuthDebugLogInput): void => {
  // #region agent log
  console.log(
    "[crikket-debug]",
    JSON.stringify({
      sessionId: "1bef44",
      debugBuildId: AUTH_DEBUG_BUILD_ID,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    })
  )
  // #endregion
}
