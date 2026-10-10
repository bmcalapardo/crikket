/**
 * Video duration entitlement.
 *
 * `durationMs` is the PLAYABLE length of a video Capture: time the recorder
 * spent paused is not part of the media and is not billed. A tester who pauses
 * for five minutes does not burn five minutes of their plan's video allowance.
 *
 * What is and is not enforceable here:
 * - Enforced: the reported value must be a finite, non-negative number within
 *   the per-plan limit and under a hard sanity cap. NaN, Infinity, negatives
 *   and absurd values are rejected, never coerced into a passing number.
 * - Not enforceable: the number is reported by the client, and the server does
 *   not probe the uploaded WebM for its real length. A modified client can
 *   under-report the duration of a long video. Pausing adds no new hole (the
 *   server never saw wall-clock time either), but closing this properly needs
 *   server-side media probing during ingestion. Until then the per-plan
 *   upload size limits and the 24h sanity cap are the backstops.
 */

/** Anything longer than a day is rejected outright as nonsense. */
export const MAX_REPORTED_VIDEO_DURATION_MS = 24 * 60 * 60 * 1000

export type VideoDurationVerdict =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "exceeds_limit" }

export function evaluateVideoDuration(input: {
  durationMs: unknown
  /** null means the plan has no duration limit. */
  maxVideoDurationMs: number | null
}): VideoDurationVerdict {
  if (typeof input.maxVideoDurationMs !== "number") {
    return { ok: true }
  }

  const { durationMs } = input
  if (durationMs === undefined || durationMs === null) {
    return { ok: false, reason: "missing" }
  }

  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > MAX_REPORTED_VIDEO_DURATION_MS
  ) {
    return { ok: false, reason: "invalid" }
  }

  if (durationMs > input.maxVideoDurationMs) {
    return { ok: false, reason: "exceeds_limit" }
  }

  return { ok: true }
}
