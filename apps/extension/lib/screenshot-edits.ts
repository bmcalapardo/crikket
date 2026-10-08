// The Capture is never altered: an edit (crop today, annotations later)
// produces a separate image, so the tester can always reset back to it.
export interface ScreenshotEdits {
  capture: Blob
  edited: Blob | null
}

export function startScreenshotEdits(capture: Blob): ScreenshotEdits {
  return { capture, edited: null }
}

export function applyScreenshotEdit(
  edits: ScreenshotEdits,
  edited: Blob
): ScreenshotEdits {
  return { ...edits, edited }
}

export function resetScreenshotEdits(edits: ScreenshotEdits): ScreenshotEdits {
  return { ...edits, edited: null }
}

export function screenshotToSubmit(edits: ScreenshotEdits): Blob {
  return edits.edited ?? edits.capture
}
