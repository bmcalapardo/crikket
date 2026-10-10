// Canvas 2D rendering for the annotation model. Kept apart from the model so
// the model stays testable without a canvas. Only the structural subset of the
// 2D context that is used is required, which lets tests pass a recording fake.
import type { Annotation, PenAnnotation, Point } from "@/lib/annotations"

export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "stroke"
  | "arc"
  | "fill"
  | "save"
  | "restore"
  | "clearRect"
> & {
  strokeStyle: CanvasRenderingContext2D["strokeStyle"]
  fillStyle: CanvasRenderingContext2D["fillStyle"]
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
}

type Pen = Pick<PenAnnotation, "color" | "width">

// Opens a save() that the caller closes with restore().
function applyPenStyle(ctx: DrawContext, pen: Pen) {
  ctx.save()
  ctx.strokeStyle = pen.color
  ctx.lineWidth = pen.width
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

function drawDot(ctx: DrawContext, pen: Pen, at: Point) {
  ctx.save()
  ctx.fillStyle = pen.color
  ctx.beginPath()
  ctx.arc(at.x, at.y, pen.width / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// The one path for every pen drawing: a lone point is a dot, anything longer
// is a single connected, round-capped line.
function drawPenPath(ctx: DrawContext, pen: Pen, points: Point[]) {
  const [first, ...rest] = points
  if (!first) return
  if (rest.length === 0) {
    drawDot(ctx, pen, first)
    return
  }
  applyPenStyle(ctx, pen)
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (const point of rest) ctx.lineTo(point.x, point.y)
  ctx.stroke()
  ctx.restore()
}

/** Draws only the newest piece of an in-progress pen stroke. The cost is
 * constant however long the stroke already is, so a draw interaction never
 * re-rasterises what is already on the live-stroke canvas. */
export function drawPenIncrement(ctx: DrawContext, pen: Pen, points: Point[]) {
  drawPenPath(ctx, pen, points.slice(-2))
}

export function drawAnnotation(ctx: DrawContext, annotation: Annotation) {
  switch (annotation.kind) {
    case "pen":
      drawPenPath(ctx, annotation, annotation.points)
      break
    default:
      break
  }
}

export function drawAnnotations(ctx: DrawContext, annotations: Annotation[]) {
  for (const annotation of annotations) drawAnnotation(ctx, annotation)
}

/** Brings the committed-annotations canvas up to date with minimal work.
 * `painted` is what the canvas currently shows (null if unknown or just
 * resized). A single appended annotation, the common case of finishing a
 * stroke, is drawn alone; anything else (undo, delete, first paint) needs a
 * full repaint because removal cannot be drawn. */
export function syncCommittedAnnotations(
  ctx: DrawContext,
  size: { width: number; height: number },
  painted: Annotation[] | null,
  next: Annotation[]
): "none" | "incremental" | "full" {
  if (painted === next) return "none"
  if (
    painted &&
    next.length === painted.length + 1 &&
    painted.every((annotation, i) => annotation === next[i])
  ) {
    drawAnnotation(ctx, next.at(-1) as Annotation)
    return "incremental"
  }
  ctx.clearRect(0, 0, size.width, size.height)
  drawAnnotations(ctx, next)
  return "full"
}

/** The export step of the pipeline: source image + annotations to a lossless
 * PNG at the source's native size. Run once on finish, never per pointer
 * event. */
export function renderAnnotatedBlob(
  source: HTMLImageElement,
  annotations: Annotation[]
): Promise<Blob | null> {
  const canvas = document.createElement("canvas")
  canvas.width = source.naturalWidth
  canvas.height = source.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(source, 0, 0)
  drawAnnotations(ctx, annotations)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png")
  })
}
