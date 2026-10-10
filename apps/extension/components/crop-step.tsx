import { Button } from "@crikket/ui/components/ui/button"
import type { KeyboardEvent } from "react"
import { useCallback, useState } from "react"
import { type CropCorner, useScreenshotCrop } from "@/hooks/use-screenshot-crop"
import type { Rect } from "@/lib/screenshot-crop"

interface CropStepProps {
  // Always the original Capture, so a new crop never compounds an old one.
  imageBlob: Blob
  hasAppliedEdit: boolean
  onApply: (blob: Blob, rect: Rect) => void
  onResetEdit: () => void
  onSkip: () => void
}

const CORNERS: CropCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]

const CORNER_POSITION_CLASS: Record<CropCorner, string> = {
  "top-left": "-translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  "top-right": "translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  "bottom-left": "-translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  "bottom-right": "translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
}

const NUDGE_STEP = 1
const NUDGE_STEP_LARGE = 10

const FOCUS_RING_CLASS =
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-3"

function arrowKeyDelta(
  event: KeyboardEvent
): { dx: number; dy: number } | null {
  const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
  switch (event.key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 }
    case "ArrowRight":
      return { dx: step, dy: 0 }
    case "ArrowUp":
      return { dx: 0, dy: -step }
    case "ArrowDown":
      return { dx: 0, dy: step }
    default:
      return null
  }
}

export function CropStep({
  imageBlob,
  hasAppliedEdit,
  onApply,
  onResetEdit,
  onSkip,
}: CropStepProps) {
  const crop = useScreenshotCrop(imageBlob)
  const [isApplying, setIsApplying] = useState(false)
  const [applyFailed, setApplyFailed] = useState(false)

  const handleApply = useCallback(async () => {
    setIsApplying(true)
    setApplyFailed(false)
    try {
      const result = await crop.applyCrop()
      if (result) {
        onApply(result.blob, result.rect)
      } else {
        // No canvas, or toBlob returned null (e.g. over the canvas area limit).
        setApplyFailed(true)
      }
    } finally {
      setIsApplying(false)
    }
  }, [crop, onApply])

  const handleMoveKeyDown = (event: KeyboardEvent) => {
    const delta = arrowKeyDelta(event)
    if (!delta) return
    event.preventDefault()
    crop.moveSelectionBy(delta.dx, delta.dy)
  }

  const handleCornerKeyDown =
    (corner: CropCorner) => (event: KeyboardEvent) => {
      const delta = arrowKeyDelta(event)
      if (!delta) return
      event.preventDefault()
      crop.resizeCornerBy(corner, delta.dx, delta.dy)
    }

  const handleReset = () => {
    crop.reset()
    if (hasAppliedEdit) {
      onResetEdit()
    }
  }

  const selection = crop.selection

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {hasAppliedEdit
          ? "A crop is applied. Select a new region, keep the current crop, or reset to the original screenshot."
          : "Drag on the screenshot to crop it to the relevant area, or continue without cropping."}
      </p>

      {applyFailed ? (
        <p className="text-destructive text-sm" role="alert">
          The screenshot couldn't be cropped. Try a smaller region, or skip the
          crop.
        </p>
      ) : null}

      <div
        className="relative touch-none select-none overflow-hidden rounded-xl border bg-black shadow-sm"
        ref={crop.containerRef}
      >
        {crop.imageUrl ? (
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad is an image lifecycle event, not user interaction
          <img
            alt="Screenshot to crop"
            className="block h-auto w-full"
            draggable={false}
            onLoad={crop.handleImageLoad}
            ref={crop.imgRef}
            src={crop.imageUrl}
          />
        ) : null}

        {crop.imageUrl ? (
          <div
            className="absolute inset-0 cursor-crosshair"
            onPointerCancel={crop.handleDragEnd}
            onPointerDown={crop.beginCreateSelection}
            onPointerMove={crop.handleDragMove}
            onPointerUp={crop.handleDragEnd}
          />
        ) : null}

        {selection ? (
          <>
            <button
              aria-label="Move crop selection"
              className={`absolute cursor-move border-2 border-primary bg-primary/10 ${FOCUS_RING_CLASS}`}
              onKeyDown={handleMoveKeyDown}
              onPointerCancel={crop.handleDragEnd}
              onPointerDown={crop.beginMoveSelection}
              onPointerMove={crop.handleDragMove}
              onPointerUp={crop.handleDragEnd}
              style={{
                left: selection.x,
                top: selection.y,
                width: Math.abs(selection.width),
                height: Math.abs(selection.height),
              }}
              type="button"
            />
            {CORNERS.map((corner) => (
              <button
                aria-label={`Resize crop selection from the ${corner} corner`}
                className={`absolute z-10 h-4 w-4 rounded-full border-2 border-primary bg-background shadow ${CORNER_POSITION_CLASS[corner]} ${FOCUS_RING_CLASS}`}
                key={corner}
                onKeyDown={handleCornerKeyDown(corner)}
                onPointerCancel={crop.handleDragEnd}
                onPointerDown={(event) =>
                  crop.beginResizeSelection(event, corner)
                }
                onPointerMove={crop.handleDragMove}
                onPointerUp={crop.handleDragEnd}
                style={{
                  left: corner.includes("left")
                    ? selection.x
                    : selection.x + Math.abs(selection.width),
                  top: corner.includes("top")
                    ? selection.y
                    : selection.y + Math.abs(selection.height),
                }}
                type="button"
              />
            ))}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          className="flex-1"
          disabled={isApplying}
          onClick={crop.createDefaultSelection}
          type="button"
          variant="outline"
        >
          {selection ? "New Selection" : "Select Region"}
        </Button>
        <Button
          className="flex-1"
          disabled={!(selection || hasAppliedEdit) || isApplying}
          onClick={handleReset}
          type="button"
          variant="outline"
        >
          Reset
        </Button>
        <Button
          className="flex-1"
          disabled={isApplying}
          onClick={onSkip}
          type="button"
          variant="outline"
        >
          {hasAppliedEdit ? "Keep Current Crop" : "Skip Crop"}
        </Button>
        <Button
          className="flex-1"
          disabled={!crop.isValidSelection || isApplying}
          onClick={handleApply}
          type="button"
        >
          {isApplying ? "Cropping..." : "Apply Crop"}
        </Button>
      </div>
    </div>
  )
}
