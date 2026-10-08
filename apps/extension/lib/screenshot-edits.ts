import { type AnnotationHistory, translateHistory } from "@/lib/annotations"
import type { Rect } from "@/lib/screenshot-crop"

// The Capture is never altered: an edit (crop, then annotations) produces a
// separate image, so the tester can always reset back to it.
//
// Crop and annotate form one edit session: the tester enters editing, crops
// and/or annotates, then finishes (or cancels back to the ScreenshotEdits
// they entered with). Edits are immutable values, so the caller keeps the
// value from the start of the session as its cancel point.
export interface ScreenshotEdits {
  capture: Blob
  // The cropped image, when a crop has been applied, and where that crop sits
  // in the Capture's native pixels.
  edited: Blob | null
  cropRect: Rect | null
  // Annotation model (coordinates are native pixels of the crop, or of the
  // Capture when uncropped) and its rendered image. `annotated` is null
  // whenever it would be stale, so it can never disagree with the model.
  annotations: AnnotationHistory | null
  annotated: Blob | null
  // How many annotations the latest crop change dropped for falling entirely
  // outside the new crop.
  removedByCrop: number
}

export function startScreenshotEdits(capture: Blob): ScreenshotEdits {
  return {
    capture,
    edited: null,
    cropRect: null,
    annotations: null,
    annotated: null,
    removedByCrop: 0,
  }
}

function withoutAnnotations(edits: ScreenshotEdits): ScreenshotEdits {
  return { ...edits, annotations: null, annotated: null, removedByCrop: 0 }
}

// Moves annotations from the current crop's coordinates into the new one's.
// Crops are lossless and native-resolution, so this is a pure translation:
// shift into Capture coordinates, then out by the new crop's offset.
function recropAnnotations(
  edits: ScreenshotEdits,
  to: Rect | null
): Pick<ScreenshotEdits, "annotations" | "annotated" | "removedByCrop"> {
  if (!edits.annotations) {
    return { annotations: null, annotated: null, removedByCrop: 0 }
  }
  const dx = (edits.cropRect?.x ?? 0) - (to?.x ?? 0)
  const dy = (edits.cropRect?.y ?? 0) - (to?.y ?? 0)
  const { history, removed } = translateHistory(
    edits.annotations,
    dx,
    dy,
    to ? { width: to.width, height: to.height } : null
  )
  return { annotations: history, annotated: null, removedByCrop: removed }
}

// Annotations are re-mapped onto the new crop; any now entirely outside it
// are dropped (and counted in removedByCrop).
export function applyScreenshotEdit(
  edits: ScreenshotEdits,
  edited: Blob,
  cropRect: Rect
): ScreenshotEdits {
  return { ...edits, ...recropAnnotations(edits, cropRect), edited, cropRect }
}

// Undoes the crop only; annotations are kept, mapped back onto the Capture.
export function resetCrop(edits: ScreenshotEdits): ScreenshotEdits {
  return {
    ...edits,
    ...recropAnnotations(edits, null),
    edited: null,
    cropRect: null,
  }
}

// Discards everything: back to the raw Capture.
export function resetScreenshotEdits(edits: ScreenshotEdits): ScreenshotEdits {
  return { ...withoutAnnotations(edits), edited: null, cropRect: null }
}

/** The image annotations are drawn over: the crop if there is one. */
export function annotationBase(edits: ScreenshotEdits): Blob {
  return edits.edited ?? edits.capture
}

export function applyAnnotations(
  edits: ScreenshotEdits,
  annotations: AnnotationHistory,
  annotated: Blob | null
): ScreenshotEdits {
  return { ...edits, annotations, annotated, removedByCrop: 0 }
}

export function screenshotToSubmit(edits: ScreenshotEdits): Blob {
  return edits.annotated ?? edits.edited ?? edits.capture
}
