// The annotation model: plain, JSON-serializable data plus pure functions, so
// history and hit-testing can be exercised without a canvas. Coordinates are
// in the image's native pixels, so the model is independent of how large the
// editor happens to be displayed. Rendering lives in annotation-render.ts.
import type { Size } from "@/lib/screenshot-crop"

export interface Point {
  x: number
  y: number
}

// Every annotation carries its own style (colour, width), so changing the
// active style later only affects what is drawn next, never what is already
// on the image. Later style fields (opacity) and tools (highlight, obscure)
// extend AnnotationBase and the union below. Every annotation also keeps its
// geometry in `points`, so translation, bounds and persistence are shared.
interface AnnotationBase {
  id: string
  color: string
  // Stroke width in native pixels.
  width: number
  points: Point[]
}

export interface PenAnnotation extends AnnotationBase {
  kind: "pen"
}

/** Shapes defined by two points: [start, end]. */
export type ShapeKind = "line" | "arrow" | "rectangle" | "ellipse"

export interface ShapeAnnotation extends AnnotationBase {
  kind: ShapeKind
}

/** One line of text with its top-left corner at points[0]. */
export interface TextAnnotation extends AnnotationBase {
  kind: "text"
  text: string
  // Font size in native pixels. `width` is the legibility halo thickness.
  fontSize: number
}

export type Annotation = PenAnnotation | ShapeAnnotation | TextAnnotation

export const SHAPE_KINDS: readonly ShapeKind[] = [
  "line",
  "arrow",
  "rectangle",
  "ellipse",
]

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
  switch (annotation.kind) {
    case "line":
      return hitsPolyline(points, point, reach)
    case "arrow":
      return (
        hitsPolyline(points, point, reach) ||
        hitsArrowHead(annotation, point, reach)
      )
    case "rectangle":
      return hitsRectangleOutline(points, point, reach)
    case "ellipse":
      return hitsEllipseOutline(points, point, reach)
    case "text": {
      const box = textBounds(annotation)
      return (
        point.x >= box.x - tolerance &&
        point.x <= box.x + box.width + tolerance &&
        point.y >= box.y - tolerance &&
        point.y <= box.y + box.height + tolerance
      )
    }
    default:
      return hitsPolyline(points, point, reach)
  }
}

function hitsArrowHead(
  annotation: Annotation,
  point: Point,
  reach: number
): boolean {
  const [start, end] = annotation.points
  if (!(start && end)) return false
  const [tip, left, right] = arrowHead(start, end, annotation.width)
  return (
    distanceToSegment(point, tip, left) <= reach ||
    distanceToSegment(point, tip, right) <= reach
  )
}

function hitsRectangleOutline(
  points: Point[],
  point: Point,
  reach: number
): boolean {
  const [a, b] = points
  if (!(a && b)) return false
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const bottom = Math.max(a.y, b.y)
  const corners: Point[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ]
  return hitsPolyline(corners, point, reach)
}

// Distance to the ellipse is approximated by f / |grad f| for the implicit
// form f = (x/a)^2 + (y/b)^2 - 1, which is accurate near the outline, the
// only place that matters for a hit.
function hitsEllipseOutline(
  points: Point[],
  point: Point,
  reach: number
): boolean {
  const [a, b] = points
  if (!(a && b)) return false
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const rx = Math.abs(b.x - a.x) / 2
  const ry = Math.abs(b.y - a.y) / 2
  if (rx < 1 || ry < 1) return hitsPolyline(points, point, reach)
  const dx = point.x - cx
  const dy = point.y - cy
  const f = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) - 1
  const gradient = Math.hypot((2 * dx) / (rx * rx), (2 * dy) / (ry * ry))
  if (gradient === 0) return Math.min(rx, ry) <= reach
  return Math.abs(f) / gradient <= reach
}

/** The arrowhead as [tip, left wing, right wing], shared by hit-testing and
 * rendering so what is drawn is what can be clicked. */
export function arrowHead(
  start: Point,
  end: Point,
  width: number
): [Point, Point, Point] {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const headLength = Math.min(length, Math.max(width * 4, 16))
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const spread = Math.PI / 7
  const wing = (offset: number): Point => ({
    x: end.x - headLength * Math.cos(angle + offset),
    y: end.y - headLength * Math.sin(angle + offset),
  })
  return [end, wing(spread), wing(-spread)]
}

/** Estimated box of a text annotation. The model has no canvas to measure
 * with, so this uses an average glyph width; renderer and hit-test agree. */
export function textBounds(annotation: TextAnnotation): {
  x: number
  y: number
  width: number
  height: number
} {
  const origin = annotation.points[0] ?? { x: 0, y: 0 }
  return {
    x: origin.x,
    y: origin.y,
    width: annotation.text.length * annotation.fontSize * 0.6,
    height: annotation.fontSize * 1.25,
  }
}

function hitsPolyline(points: Point[], point: Point, reach: number): boolean {
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
  return commitAnnotation(history, stroke, options)
}

/** Finishes any drawn annotation. A click on an existing annotation deletes
 * it. A click on empty space draws a pen dot, but a shape needs a drag, so a
 * stray click adds nothing. */
export function commitAnnotation(
  history: AnnotationHistory,
  annotation: Annotation,
  options: { isClick: boolean; tolerance: number }
): AnnotationHistory {
  if (!hasFinitePoints(annotation)) return history
  const start = annotation.points[0]
  if (options.isClick && start) {
    const hit = hitTest(history.annotations, start, options.tolerance)
    if (hit) return deleteAnnotation(history, hit.id)
    if (annotation.kind !== "pen") return history
  }
  // A drag that ended where it began (or a hand-built zero-extent shape)
  // would add an annotation with nothing to see or click.
  if (isShapeKind(annotation.kind) && isDegenerateShape(annotation.points)) {
    return history
  }
  return addAnnotation(history, annotation)
}

function isShapeKind(kind: Annotation["kind"]): kind is ShapeKind {
  return (SHAPE_KINDS as readonly string[]).includes(kind)
}

function hasFinitePoints(annotation: Annotation): boolean {
  return (
    annotation.points.length > 0 &&
    annotation.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  )
}

// Less than a native pixel between the two defining points is no shape.
function isDegenerateShape(points: Point[]): boolean {
  const [a, b] = points
  if (!(a && b)) return true
  return Math.hypot(b.x - a.x, b.y - a.y) < 1
}

/** Longest text a single annotation may hold. It is one line on the image;
 * beyond this it would run far off any screenshot and slow every repaint. */
export const MAX_TEXT_LENGTH = 200

function isControlOrSeparator(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code < 0x20 || code === 0x7f || code === 0x20_28 || code === 0x20_29
}

/** Cleans typed text for an annotation: line breaks and control characters
 * become spaces, runs of whitespace collapse, ends are trimmed, and the
 * length is capped (without splitting a surrogate pair). Returns "" when
 * nothing visible is left. */
export function normalizeAnnotationText(raw: string): string {
  const cleaned = Array.from(raw, (ch) => (isControlOrSeparator(ch) ? " " : ch))
    .join("")
    .split(" ")
    .filter(Boolean)
    .join(" ")
    .trim()
  const chars = Array.from(cleaned)
  return chars.length > MAX_TEXT_LENGTH
    ? chars.slice(0, MAX_TEXT_LENGTH).join("").trim()
    : cleaned
}

/** Font size that stays legible whatever the capture's resolution. */
export function defaultFontSize(native: Size): number {
  return Math.max(16, Math.round(native.width / 60))
}

function isFullyOutside(annotation: Annotation, bounds: Size): boolean {
  if (annotation.kind === "text") {
    // Text extends right and down from its origin, so test its whole box.
    const box = textBounds(annotation)
    return (
      box.x + box.width < 0 ||
      box.y + box.height < 0 ||
      box.x > bounds.width ||
      box.y > bounds.height
    )
  }
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
