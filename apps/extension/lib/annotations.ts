// The annotation model: plain, JSON-serializable data plus pure functions, so
// history and hit-testing can be exercised without a canvas. Coordinates are
// in the image's native pixels, so the model is independent of how large the
// editor happens to be displayed. Rendering lives in annotation-render.ts.
import type { Size } from "@/lib/screenshot-crop"

export interface Point {
  x: number
  y: number
}

export interface PenAnnotation {
  id: string
  kind: "pen"
  color: string
  // Stroke width in native pixels.
  width: number
  points: Point[]
}

// Extend this union as tools are added (shapes, text, highlight, obscure).
export type Annotation = PenAnnotation

// A history entry. Deletions record the index so undo can put the annotation
// back where it was, which matters for overlapping strokes.
export type AnnotationAction =
  | { type: "add"; annotation: Annotation }
  | { type: "delete"; annotation: Annotation; index: number }

export interface AnnotationHistory {
  // Visible annotations, bottom to top.
  annotations: Annotation[]
  undoStack: AnnotationAction[]
  redoStack: AnnotationAction[]
}

export function createAnnotationHistory(): AnnotationHistory {
  return { annotations: [], undoStack: [], redoStack: [] }
}

export function addAnnotation(
  state: AnnotationHistory,
  annotation: Annotation
): AnnotationHistory {
  return perform(state, { type: "add", annotation })
}

// Annotations are append-only; "delete" is the click-to-delete eraser. It is
// recorded in history, so a mis-click can be undone like any other action.
export function deleteAnnotation(
  state: AnnotationHistory,
  id: string
): AnnotationHistory {
  const index = state.annotations.findIndex((a) => a.id === id)
  if (index === -1) return state
  return perform(state, {
    type: "delete",
    annotation: state.annotations[index] as Annotation,
    index,
  })
}

export function undo(state: AnnotationHistory): AnnotationHistory {
  const action = state.undoStack.at(-1)
  if (!action) return state
  return {
    annotations: reverse(state.annotations, action),
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, action],
  }
}

export function redo(state: AnnotationHistory): AnnotationHistory {
  const action = state.redoStack.at(-1)
  if (!action) return state
  return {
    annotations: forward(state.annotations, action),
    undoStack: [...state.undoStack, action],
    redoStack: state.redoStack.slice(0, -1),
  }
}

function perform(
  state: AnnotationHistory,
  action: AnnotationAction
): AnnotationHistory {
  return {
    annotations: forward(state.annotations, action),
    undoStack: [...state.undoStack, action],
    redoStack: [],
  }
}

function forward(
  annotations: Annotation[],
  action: AnnotationAction
): Annotation[] {
  if (action.type === "add") return [...annotations, action.annotation]
  return annotations.filter((a) => a.id !== action.annotation.id)
}

function reverse(
  annotations: Annotation[],
  action: AnnotationAction
): Annotation[] {
  if (action.type === "add") {
    return annotations.filter((a) => a.id !== action.annotation.id)
  }
  const next = [...annotations]
  next.splice(action.index, 0, action.annotation)
  return next
}

/** Topmost annotation under `point`, or null. `tolerance` widens every
 * annotation's hit area (in native pixels) so thin strokes stay clickable. */
export function hitTest(
  annotations: Annotation[],
  point: Point,
  tolerance: number
): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const annotation = annotations[i] as Annotation
    if (hitsAnnotation(annotation, point, tolerance)) return annotation
  }
  return null
}

function hitsAnnotation(
  annotation: Annotation,
  point: Point,
  tolerance: number
): boolean {
  const reach = annotation.width / 2 + tolerance
  const { points } = annotation
  if (points.length === 1) {
    return (
      distanceToSegment(point, points[0] as Point, points[0] as Point) <= reach
    )
  }
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1] as Point
    const to = points[i] as Point
    if (distanceToSegment(point, from, to) <= reach) return true
  }
  return false
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared
          )
        )
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy))
}

/** Maps a point in displayed CSS pixels onto the image's native pixels,
 * clamped to the image. */
export function displayPointToNative(
  point: Point,
  display: Size,
  native: Size
): Point {
  const clamp = (value: number, max: number) =>
    Math.max(0, Math.min(value, max))
  return {
    x: clamp((point.x / display.width) * native.width, native.width),
    y: clamp((point.y / display.height) * native.height, native.height),
  }
}

/** A pen width that stays legible whatever the capture's resolution. */
export function defaultPenWidth(native: Size): number {
  return Math.max(3, Math.round(native.width / 250))
}

/** Finishes a pen stroke. A click (a stroke that barely moved) on an existing
 * annotation deletes it, the same as the eraser, so the default tool can
 * delete too; a click on empty space draws a dot and any drag always draws. */
export function commitPenStroke(
  history: AnnotationHistory,
  stroke: PenAnnotation,
  options: { isClick: boolean; tolerance: number }
): AnnotationHistory {
  const start = stroke.points[0]
  if (options.isClick && start) {
    const hit = hitTest(history.annotations, start, options.tolerance)
    if (hit) return deleteAnnotation(history, hit.id)
  }
  return addAnnotation(history, stroke)
}

function isFullyOutside(annotation: Annotation, bounds: Size): boolean {
  const reach = annotation.width / 2
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const { x, y } of annotation.points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return (
    maxX + reach < 0 ||
    maxY + reach < 0 ||
    minX - reach > bounds.width ||
    minY - reach > bounds.height
  )
}

/** Moves every annotation by (dx, dy), for when the image underneath is
 * re-cropped (a lossless crop is a pure translation). Annotations that end up
 * entirely outside `bounds` are dropped and counted; pass null to keep all.
 * Undo history is cleared, since it may refer to dropped annotations. */
export function translateHistory(
  history: AnnotationHistory,
  dx: number,
  dy: number,
  bounds: Size | null
): { history: AnnotationHistory; removed: number } {
  const moved = history.annotations.map(
    (annotation): Annotation => ({
      ...annotation,
      points: annotation.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    })
  )
  const kept = bounds ? moved.filter((a) => !isFullyOutside(a, bounds)) : moved
  return {
    history: { ...createAnnotationHistory(), annotations: kept },
    removed: moved.length - kept.length,
  }
}
