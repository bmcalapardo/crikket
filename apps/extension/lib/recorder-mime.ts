/** Preferred MediaRecorder containers/codecs, best first. */
export const RECORDER_MIME_PREFERENCE = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
] as const

/**
 * Picks the first supported type, or undefined to let the browser choose its
 * default. `isTypeSupported` may be absent (older runtimes) or throw.
 */
export function pickRecorderMimeType(
  isTypeSupported: ((type: string) => boolean) | undefined
): string | undefined {
  if (!isTypeSupported) {
    return undefined
  }
  for (const type of RECORDER_MIME_PREFERENCE) {
    try {
      if (isTypeSupported(type)) {
        return type
      }
    } catch {
      // Treat a throwing probe as unsupported.
    }
  }
  return undefined
}

/**
 * The real type of a finished recording: what the recorder reports, else what
 * was requested, else WebM (the default MediaRecorder container).
 */
export function resolveRecordingMimeType(
  recorderMimeType: string | undefined,
  requested: string | undefined
): string {
  return recorderMimeType || requested || "video/webm"
}
