export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

const MIN_CROP_NATIVE_PIXELS = 1

/** Normalizes a rect that may have been dragged in any direction to a
 * positive-width/height rect anchored at its top-left corner. */
export function normalizeRect(rect: Rect): Rect {
  const x = Math.min(rect.x, rect.x + rect.width)
  const y = Math.min(rect.y, rect.y + rect.height)
  return { x, y, width: Math.abs(rect.width), height: Math.abs(rect.height) }
}

/** Clamps a normalized rect so it stays fully inside `bounds`. */
export function clampRectToBounds(rect: Rect, bounds: Size): Rect {
  const normalized = normalizeRect(rect)
  const x = Math.max(0, Math.min(normalized.x, bounds.width))
  const y = Math.max(0, Math.min(normalized.y, bounds.height))
  const right = Math.max(
    0,
    Math.min(normalized.x + normalized.width, bounds.width)
  )
  const bottom = Math.max(
    0,
    Math.min(normalized.y + normalized.height, bounds.height)
  )
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  }
}

/**
 * Maps a rect selected in the crop UI's CSS-pixel display space onto the
 * screenshot's native pixel grid. The screenshot comes from
 * `captureVisibleTab`, which captures at the source tab's device pixel
 * ratio, so its natural size is `displaySize * devicePixelRatio` whenever
 * the crop UI renders the image at its CSS size. Scaling by
 * `naturalSize / displaySize` recovers the correct native pixels regardless
 * of what ratio produced the mismatch.
 */
export function mapDisplayRectToNativeRect(
  displayRect: Rect,
  displaySize: Size,
  naturalSize: Size
): Rect {
  if (displaySize.width <= 0 || displaySize.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const scaleX = naturalSize.width / displaySize.width
  const scaleY = naturalSize.height / displaySize.height
  const normalized = normalizeRect(displayRect)

  const native: Rect = {
    x: Math.round(normalized.x * scaleX),
    y: Math.round(normalized.y * scaleY),
    width: Math.round(normalized.width * scaleX),
    height: Math.round(normalized.height * scaleY),
  }

  return clampRectToBounds(native, naturalSize)
}

/** A crop rect must have a positive width and height so a zero-size crop can
 * never be produced. */
export function isCropRectValid(rect: Rect | null): rect is Rect {
  return (
    !!rect &&
    rect.width >= MIN_CROP_NATIVE_PIXELS &&
    rect.height >= MIN_CROP_NATIVE_PIXELS
  )
}
