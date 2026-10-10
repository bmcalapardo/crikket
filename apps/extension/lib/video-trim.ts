import type { TrimCut } from "./webm-trim"

/**
 * An applied trim. The original capture is never replaced: it stays in the
 * recorder hook until submission, so the trim can be undone or redone.
 */
export interface VideoTrim extends TrimCut {
  blob: Blob
  /** The capture this trim was cut from; a trim of another capture is stale. */
  source?: Blob
  durationMs: number
}

/** The blob to submit: the trimmed one if a trim is applied. */
export function videoToSubmit(
  original: Blob | null,
  trim: VideoTrim | null
): Blob | null {
  return currentTrim(original, trim)?.blob ?? original
}

/** The trim, only if it was cut from `original` (else it is stale: null). */
export function currentTrim(
  original: Blob | null,
  trim: VideoTrim | null
): VideoTrim | null {
  if (!trim || (trim.source !== undefined && trim.source !== original)) {
    return null
  }
  return trim
}

/**
 * Real start offset of the submitted video within the original recording, in
 * ms. Anything keyed to the original timeline (e.g. markers) subtracts this.
 */
export function trimStartOffsetMs(trim: VideoTrim | null): number {
  return trim?.startMs ?? 0
}

export function submittedDurationMs(
  trim: VideoTrim | null,
  recordedDurationMs: number
): number {
  return Math.max(0, Math.round(trim?.durationMs ?? recordedDurationMs))
}
