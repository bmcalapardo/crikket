/** Chromium allows two `captureVisibleTab` calls per second per window
 * (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`). Slices are paced just above
 * that so the limit is rarely hit; hitting it anyway is retried. */
export const MIN_CAPTURE_INTERVAL_MS = 600

/** Longest side Chromium allows for a canvas, in device pixels. */
export const MAX_CANVAS_DIMENSION = 16_384

/** Largest canvas area Chromium allows, in device pixels. */
export const MAX_CANVAS_AREA = 268_435_456

export interface FullPageMetrics {
  /** Height of the whole scrollable document, in CSS pixels. */
  pageHeight: number
  viewportWidth: number
  viewportHeight: number
  devicePixelRatio: number
}

export interface FullPagePlan {
  /** Scroll offsets (CSS pixels) to capture, top to bottom. The last one is
   * pulled back so the final slice overlaps the previous one instead of
   * running past the end of the page. */
  scrollOffsets: number[]
  /** Stitched image size in device pixels. */
  canvasWidth: number
  canvasHeight: number
  /** Page height actually covered, in CSS pixels (capped by canvas limits). */
  capturedHeight: number
  /** True when the page was taller than the canvas limits allow. */
  truncated: boolean
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Plans the slices that make up a full-page capture. Pure: no DOM access. */
export function planFullPageCapture(
  metrics: FullPageMetrics,
  limits: { maxDimension?: number; maxArea?: number } = {}
): FullPagePlan {
  const maxDimension = limits.maxDimension ?? MAX_CANVAS_DIMENSION
  const maxArea = limits.maxArea ?? MAX_CANVAS_AREA
  const dpr = positive(metrics.devicePixelRatio, 1)
  const viewportWidth = Math.max(
    1,
    Math.floor(positive(metrics.viewportWidth, 1))
  )
  const viewportHeight = Math.max(
    1,
    Math.floor(positive(metrics.viewportHeight, 1))
  )
  const pageHeight = Math.max(
    viewportHeight,
    Math.ceil(positive(metrics.pageHeight, viewportHeight))
  )

  const canvasWidth = Math.round(viewportWidth * dpr)
  const maxCanvasHeight = Math.max(
    1,
    Math.min(maxDimension, Math.floor(maxArea / canvasWidth))
  )
  const maxCssHeight = Math.max(
    viewportHeight,
    Math.floor(maxCanvasHeight / dpr)
  )

  const truncated = pageHeight > maxCssHeight
  const capturedHeight = truncated ? maxCssHeight : pageHeight
  const canvasHeight = Math.min(
    maxCanvasHeight,
    Math.max(1, Math.round(capturedHeight * dpr))
  )

  const scrollOffsets: number[] = []
  const lastOffset = Math.max(0, capturedHeight - viewportHeight)
  for (let offset = 0; offset < lastOffset; offset += viewportHeight) {
    scrollOffsets.push(offset)
  }
  scrollOffsets.push(lastOffset)

  return {
    scrollOffsets,
    canvasWidth,
    canvasHeight,
    capturedHeight,
    truncated,
  }
}

export function isCaptureRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")
}

/** How long to wait before the next `captureVisibleTab` call. */
export function nextCaptureDelay(input: {
  now: number
  lastCaptureAt: number | null
  minIntervalMs?: number
}): number {
  if (input.lastCaptureAt === null) {
    return 0
  }
  const interval = input.minIntervalMs ?? MIN_CAPTURE_INTERVAL_MS
  return Math.max(0, input.lastCaptureAt + interval - input.now)
}
