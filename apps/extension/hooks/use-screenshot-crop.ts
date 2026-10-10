import type { PointerEvent as ReactPointerEvent, RefObject } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  clampRectToBounds,
  isCropRectValid,
  mapDisplayRectToNativeRect,
  normalizeRect,
  type Rect,
  type Size,
} from "@/lib/screenshot-crop"

export type CropCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

/** Selections narrower or shorter than this many CSS pixels are treated as
 * an accidental click rather than a deliberate drag, and discarded. */
const MIN_DRAG_CSS_PIXELS = 4

interface DragState {
  mode: "create" | "move" | "resize"
  corner?: CropCorner
  pointerId: number
  originPoint: { x: number; y: number }
  originSelection: Rect
}

export interface UseScreenshotCropReturn {
  imageUrl: string | null
  naturalSize: Size | null
  displaySize: Size | null
  selection: Rect | null
  isValidSelection: boolean
  imgRef: RefObject<HTMLImageElement | null>
  containerRef: RefObject<HTMLDivElement | null>
  handleImageLoad: () => void
  beginCreateSelection: (event: ReactPointerEvent) => void
  beginMoveSelection: (event: ReactPointerEvent) => void
  beginResizeSelection: (event: ReactPointerEvent, corner: CropCorner) => void
  handleDragMove: (event: ReactPointerEvent) => void
  handleDragEnd: (event: ReactPointerEvent) => void
  moveSelectionBy: (dx: number, dy: number) => void
  resizeCornerBy: (corner: CropCorner, dx: number, dy: number) => void
  createDefaultSelection: () => void
  reset: () => void
  // `rect` is the crop in native pixels of the image shown (the Capture).
  applyCrop: () => Promise<{ blob: Blob; rect: Rect } | null>
}

function pointFromEvent(
  event: ReactPointerEvent,
  container: HTMLElement
): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function capturePointer(event: ReactPointerEvent) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is unavailable in some test/DOM environments; the
    // crop tool degrades to plain pointer events without it.
  }
}

function releasePointer(event: ReactPointerEvent) {
  try {
    event.currentTarget.releasePointerCapture(event.pointerId)
  } catch {
    // See capturePointer.
  }
}

export function useScreenshotCrop(
  imageBlob: Blob | null
): UseScreenshotCropReturn {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<Size | null>(null)
  const [displaySize, setDisplaySize] = useState<Size | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  useEffect(() => {
    if (!imageBlob) {
      setImageUrl(null)
      return
    }

    const url = URL.createObjectURL(imageBlob)
    setImageUrl(url)
    setNaturalSize(null)
    setDisplaySize(null)
    setSelection(null)

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

  const getDisplayBounds = useCallback((): Size | null => {
    const img = imgRef.current
    if (!img) return displaySize
    const rect = img.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }, [displaySize])

  const beginCreateSelection = useCallback((event: ReactPointerEvent) => {
    const container = containerRef.current
    if (!container) return
    capturePointer(event)
    const point = pointFromEvent(event, container)
    dragStateRef.current = {
      mode: "create",
      pointerId: event.pointerId,
      originPoint: point,
      originSelection: { x: point.x, y: point.y, width: 0, height: 0 },
    }
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 })
  }, [])

  const beginMoveSelection = useCallback(
    (event: ReactPointerEvent) => {
      if (!selection) return
      event.stopPropagation()
      const container = containerRef.current
      if (!container) return
      capturePointer(event)
      const point = pointFromEvent(event, container)
      dragStateRef.current = {
        mode: "move",
        pointerId: event.pointerId,
        originPoint: point,
        originSelection: selection,
      }
    },
    [selection]
  )

  const beginResizeSelection = useCallback(
    (event: ReactPointerEvent, corner: CropCorner) => {
      if (!selection) return
      event.stopPropagation()
      const container = containerRef.current
      if (!container) return
      capturePointer(event)
      const point = pointFromEvent(event, container)
      dragStateRef.current = {
        mode: "resize",
        corner,
        pointerId: event.pointerId,
        originPoint: point,
        originSelection: selection,
      }
    },
    [selection]
  )

  const handleDragMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragStateRef.current
      const container = containerRef.current
      const bounds = getDisplayBounds()
      if (
        !(drag && container && bounds) ||
        drag.pointerId !== event.pointerId
      ) {
        return
      }

      const point = pointFromEvent(event, container)
      const dx = point.x - drag.originPoint.x
      const dy = point.y - drag.originPoint.y

      if (drag.mode === "create") {
        setSelection(
          clampRectToBounds(
            {
              x: drag.originSelection.x,
              y: drag.originSelection.y,
              width: dx,
              height: dy,
            },
            bounds
          )
        )
        return
      }

      if (drag.mode === "move") {
        const next = {
          x: drag.originSelection.x + dx,
          y: drag.originSelection.y + dy,
          width: drag.originSelection.width,
          height: drag.originSelection.height,
        }
        const maxX = Math.max(0, bounds.width - next.width)
        const maxY = Math.max(0, bounds.height - next.height)
        setSelection({
          x: Math.max(0, Math.min(next.x, maxX)),
          y: Math.max(0, Math.min(next.y, maxY)),
          width: next.width,
          height: next.height,
        })
        return
      }

      if (drag.mode === "resize" && drag.corner) {
        setSelection(
          clampRectToBounds(
            resizeCorner(drag.originSelection, drag.corner, dx, dy),
            bounds
          )
        )
      }
    },
    [getDisplayBounds]
  )

  const handleDragEnd = useCallback((event: ReactPointerEvent) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    releasePointer(event)
    dragStateRef.current = null

    if (drag.mode === "create") {
      setSelection((current) => {
        if (
          !current ||
          current.width < MIN_DRAG_CSS_PIXELS ||
          current.height < MIN_DRAG_CSS_PIXELS
        ) {
          return null
        }
        return current
      })
    }
  }, [])

  const moveSelectionBy = useCallback(
    (dx: number, dy: number) => {
      const bounds = getDisplayBounds()
      if (!bounds) return
      setSelection((current) => {
        if (!current) return current
        const maxX = Math.max(0, bounds.width - current.width)
        const maxY = Math.max(0, bounds.height - current.height)
        return {
          ...current,
          x: Math.max(0, Math.min(current.x + dx, maxX)),
          y: Math.max(0, Math.min(current.y + dy, maxY)),
        }
      })
    },
    [getDisplayBounds]
  )

  const resizeCornerBy = useCallback(
    (corner: CropCorner, dx: number, dy: number) => {
      const bounds = getDisplayBounds()
      if (!bounds) return
      setSelection((current) => {
        if (!current) return current
        return clampRectToBounds(resizeCorner(current, corner, dx, dy), bounds)
      })
    },
    [getDisplayBounds]
  )

  const createDefaultSelection = useCallback(() => {
    const bounds = getDisplayBounds()
    if (!bounds) return
    const width = bounds.width * 0.6
    const height = bounds.height * 0.6
    setSelection({
      x: (bounds.width - width) / 2,
      y: (bounds.height - height) / 2,
      width,
      height,
    })
  }, [getDisplayBounds])

  const reset = useCallback(() => {
    dragStateRef.current = null
    setSelection(null)
  }, [])

  const applyCrop = useCallback(async (): Promise<{
    blob: Blob
    rect: Rect
  } | null> => {
    const img = imgRef.current
    const bounds = getDisplayBounds()
    if (!(img && naturalSize && bounds && selection)) return null

    const nativeRect = mapDisplayRectToNativeRect(
      normalizeRect(selection),
      bounds,
      naturalSize
    )
    if (!isCropRectValid(nativeRect)) return null

    const canvas = document.createElement("canvas")
    canvas.width = nativeRect.width
    canvas.height = nativeRect.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    ctx.drawImage(
      img,
      nativeRect.x,
      nativeRect.y,
      nativeRect.width,
      nativeRect.height,
      0,
      0,
      nativeRect.width,
      nativeRect.height
    )

    const blob = await canvasToPngBlob(canvas)
    return blob ? { blob, rect: nativeRect } : null
  }, [getDisplayBounds, naturalSize, selection])

  return {
    imageUrl,
    naturalSize,
    displaySize,
    selection,
    isValidSelection: isCropRectValid(selection && normalizeRect(selection)),
    imgRef,
    containerRef,
    handleImageLoad,
    beginCreateSelection,
    beginMoveSelection,
    beginResizeSelection,
    handleDragMove,
    handleDragEnd,
    moveSelectionBy,
    resizeCornerBy,
    createDefaultSelection,
    reset,
    applyCrop,
  }
}

function resizeCorner(
  rect: Rect,
  corner: CropCorner,
  dx: number,
  dy: number
): Rect {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  switch (corner) {
    case "top-left":
      return normalizeRect({
        x: left + dx,
        y: top + dy,
        width: right - (left + dx),
        height: bottom - (top + dy),
      })
    case "top-right":
      return normalizeRect({
        x: left,
        y: top + dy,
        width: right + dx - left,
        height: bottom - (top + dy),
      })
    case "bottom-left":
      return normalizeRect({
        x: left + dx,
        y: top,
        width: right - (left + dx),
        height: bottom + dy - top,
      })
    case "bottom-right":
      return normalizeRect({
        x: left,
        y: top,
        width: right + dx - left,
        height: bottom + dy - top,
      })
    default:
      return normalizeRect(rect)
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png")
  })
}
