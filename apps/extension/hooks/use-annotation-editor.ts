import type { PointerEvent as ReactPointerEvent, RefObject } from "react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useAnnotationShortcuts } from "@/hooks/use-annotation-shortcuts"
import {
  drawPenIncrement,
  renderAnnotatedBlob,
  syncCommittedAnnotations,
} from "@/lib/annotation-render"
import {
  type Annotation,
  type AnnotationHistory,
  commitPenStroke,
  createAnnotationHistory,
  defaultPenWidth,
  deleteAnnotation,
  displayPointToNative,
  hitTest,
  type Point,
  redo as redoHistory,
  undo as undoHistory,
} from "@/lib/annotations"
import type { Size } from "@/lib/screenshot-crop"

export type AnnotationTool = "pen" | "eraser"

const PEN_COLOR = "#ef4444"

/** How far (in CSS pixels) from a stroke a click still counts as a hit, so
 * thin strokes on a downscaled preview stay easy to click. */
const ERASER_TOLERANCE_CSS_PIXELS = 8

/** A pointer that moves less than this many CSS pixels between press and
 * release is a click, not a drag. */
const CLICK_MOVE_THRESHOLD_CSS_PIXELS = 4

interface LiveStroke {
  pointerId: number
  width: number
  points: Point[]
  startClient: Point
  moved: boolean
}

export interface UseAnnotationEditorReturn {
  imageUrl: string | null
  history: AnnotationHistory
  tool: AnnotationTool
  canUndo: boolean
  canRedo: boolean
  imgRef: RefObject<HTMLImageElement | null>
  committedCanvasRef: RefObject<HTMLCanvasElement | null>
  liveStrokeCanvasRef: RefObject<HTMLCanvasElement | null>
  naturalSize: Size | null
  setTool: (tool: AnnotationTool) => void
  handleImageLoad: () => void
  handlePointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  handlePointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  handlePointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  handlePointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  undo: () => void
  redo: () => void
  renderAnnotated: () => Promise<{
    history: AnnotationHistory
    blob: Blob | null
  }>
}

function capturePointer(event: ReactPointerEvent) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is unavailable in some test/DOM environments; drawing
    // degrades to plain pointer events without it.
  }
}

function releasePointer(event: ReactPointerEvent) {
  try {
    event.currentTarget.releasePointerCapture(event.pointerId)
  } catch {
    // See capturePointer.
  }
}

/** Sets a canvas to the given pixel size and maps native image pixels onto
 * it, returning whether it changed. Assigning width/height clears a canvas
 * (and resets its transform), so it is only done when needed. */
function sizeCanvas(
  canvas: HTMLCanvasElement,
  pixels: Size,
  native: Size
): boolean {
  if (canvas.width === pixels.width && canvas.height === pixels.height) {
    return false
  }
  canvas.width = pixels.width
  canvas.height = pixels.height
  canvas
    .getContext("2d")
    ?.setTransform(
      pixels.width / native.width,
      0,
      0,
      pixels.height / native.height,
      0,
      0
    )
  return true
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const ctx = canvas?.getContext("2d")
  if (!(canvas && ctx)) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

export function useAnnotationEditor(
  imageBlob: Blob,
  initialHistory: AnnotationHistory | null
): UseAnnotationEditorReturn {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<Size | null>(null)
  // The on-screen size of the image in CSS pixels. The canvases are sized to
  // this (times devicePixelRatio), not to the native image, so repainting
  // costs the same however large the screenshot is.
  const [displaySize, setDisplaySize] = useState<Size | null>(null)
  const [history, setHistory] = useState<AnnotationHistory>(
    () => initialHistory ?? createAnnotationHistory()
  )
  const [tool, setTool] = useState<AnnotationTool>("pen")

  const imgRef = useRef<HTMLImageElement | null>(null)
  const committedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const liveStrokeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // Held in a ref, not state: pointer moves must not trigger React renders.
  const liveStrokeRef = useRef<LiveStroke | null>(null)
  // What the committed canvas currently shows, so a commit can add to it
  // instead of repainting it.
  const paintedRef = useRef<Annotation[] | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(imageBlob)
    setImageUrl(url)
    setNaturalSize(null)
    setDisplaySize(null)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [imageBlob])

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    const rect = img.getBoundingClientRect()
    setDisplaySize({ width: rect.width, height: rect.height })
  }, [])

  useEffect(() => {
    const img = imgRef.current
    if (!(img && naturalSize && typeof ResizeObserver !== "undefined")) return
    const observer = new ResizeObserver(() => {
      const rect = img.getBoundingClientRect()
      setDisplaySize((current) =>
        current?.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      )
    })
    observer.observe(img)
    return () => observer.disconnect()
  }, [naturalSize])

  // Keeps the committed canvas in step with the model. Finishing a stroke
  // draws just that stroke; undo, redo, delete and a resize repaint the
  // vectors (the screenshot is a plain <img> underneath). Canvases are only
  // resized when the display size changes, and the live-stroke canvas is
  // cleared in the same pass so a finished stroke is never shown twice.
  useLayoutEffect(() => {
    const committed = committedCanvasRef.current
    const live = liveStrokeCanvasRef.current
    if (!(committed && live && naturalSize && displaySize)) return
    const dpr = window.devicePixelRatio || 1
    const pixels = {
      width: Math.max(1, Math.round(displaySize.width * dpr)),
      height: Math.max(1, Math.round(displaySize.height * dpr)),
    }
    const resized = sizeCanvas(committed, pixels, naturalSize)
    sizeCanvas(live, pixels, naturalSize)
    const ctx = committed.getContext("2d")
    if (ctx) {
      syncCommittedAnnotations(
        ctx,
        naturalSize,
        resized ? null : paintedRef.current,
        history.annotations
      )
      paintedRef.current = history.annotations
    }
    clearCanvas(live)
  }, [history.annotations, naturalSize, displaySize])

  const toNative = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
      if (!naturalSize) return null
      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return displayPointToNative(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { width: rect.width, height: rect.height },
        naturalSize
      )
    },
    [naturalSize]
  )

  // Hit-test slack in native pixels for the current display scale.
  const hitTolerance = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): number => {
      const rect = event.currentTarget.getBoundingClientRect()
      if (!naturalSize || rect.width === 0) return 0
      return (ERASER_TOLERANCE_CSS_PIXELS * naturalSize.width) / rect.width
    },
    [naturalSize]
  )

  const drawLiveIncrement = useCallback((stroke: LiveStroke) => {
    const ctx = liveStrokeCanvasRef.current?.getContext("2d")
    if (!ctx) return
    drawPenIncrement(
      ctx,
      { color: PEN_COLOR, width: stroke.width },
      stroke.points
    )
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 || liveStrokeRef.current) return
      const point = toNative(event)
      if (!(point && naturalSize)) return

      if (tool === "eraser") {
        const tolerance = hitTolerance(event)
        setHistory((current) => {
          const hit = hitTest(current.annotations, point, tolerance)
          return hit ? deleteAnnotation(current, hit.id) : current
        })
        return
      }

      capturePointer(event)
      const stroke: LiveStroke = {
        pointerId: event.pointerId,
        width: defaultPenWidth(naturalSize),
        points: [point],
        startClient: { x: event.clientX, y: event.clientY },
        moved: false,
      }
      liveStrokeRef.current = stroke
      drawLiveIncrement(stroke)
    },
    [drawLiveIncrement, hitTolerance, naturalSize, toNative, tool]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = liveStrokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      const point = toNative(event)
      if (!point) return
      if (
        !stroke.moved &&
        Math.hypot(
          event.clientX - stroke.startClient.x,
          event.clientY - stroke.startClient.y
        ) > CLICK_MOVE_THRESHOLD_CSS_PIXELS
      ) {
        stroke.moved = true
      }
      stroke.points.push(point)
      drawLiveIncrement(stroke)
    },
    [drawLiveIncrement, toNative]
  )

  // Ends the live stroke for this pointer, if there is one.
  const takeLiveStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): LiveStroke | null => {
      const stroke = liveStrokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return null
      releasePointer(event)
      liveStrokeRef.current = null
      return stroke
    },
    []
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const stroke = takeLiveStroke(event)
      if (!stroke) return
      const tolerance = hitTolerance(event)
      setHistory((current) =>
        commitPenStroke(
          current,
          {
            id: crypto.randomUUID(),
            kind: "pen",
            color: PEN_COLOR,
            width: stroke.width,
            points: stroke.points,
          },
          { isClick: !stroke.moved, tolerance }
        )
      )
    },
    [hitTolerance, takeLiveStroke]
  )

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!takeLiveStroke(event)) return
      clearCanvas(liveStrokeCanvasRef.current)
    },
    [takeLiveStroke]
  )

  const renderAnnotated = useCallback(async () => {
    const img = imgRef.current
    if (history.annotations.length === 0 || !img) {
      return { history, blob: null }
    }
    return {
      history,
      blob: await renderAnnotatedBlob(img, history.annotations),
    }
  }, [history])

  // Ignored mid-stroke: the live preview would vanish while the pointer is
  // still down.
  const undo = useCallback(() => {
    if (!liveStrokeRef.current) setHistory(undoHistory)
  }, [])
  const redo = useCallback(() => {
    if (!liveStrokeRef.current) setHistory(redoHistory)
  }, [])

  useAnnotationShortcuts({ undo, redo })

  return {
    imageUrl,
    history,
    tool,
    canUndo: history.undoStack.length > 0,
    canRedo: history.redoStack.length > 0,
    imgRef,
    committedCanvasRef,
    liveStrokeCanvasRef,
    naturalSize,
    setTool,
    handleImageLoad,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    undo,
    redo,
    renderAnnotated,
  }
}
