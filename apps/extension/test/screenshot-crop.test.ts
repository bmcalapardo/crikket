import { describe, expect, it } from "bun:test"
import {
  clampRectToBounds,
  isCropRectValid,
  mapDisplayRectToNativeRect,
  normalizeRect,
} from "../lib/screenshot-crop"

describe("normalizeRect", () => {
  it("leaves an already-normalized rect unchanged", () => {
    expect(normalizeRect({ x: 10, y: 20, width: 30, height: 40 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
  })

  it("normalizes a rect dragged from bottom-right to top-left", () => {
    expect(normalizeRect({ x: 50, y: 60, width: -30, height: -20 })).toEqual({
      x: 20,
      y: 40,
      width: 30,
      height: 20,
    })
  })
})

describe("clampRectToBounds", () => {
  it("leaves a rect fully inside the bounds unchanged", () => {
    expect(
      clampRectToBounds(
        { x: 10, y: 10, width: 20, height: 20 },
        { width: 100, height: 100 }
      )
    ).toEqual({ x: 10, y: 10, width: 20, height: 20 })
  })

  it("clamps a rect that overflows the bounds", () => {
    expect(
      clampRectToBounds(
        { x: 90, y: 90, width: 30, height: 30 },
        { width: 100, height: 100 }
      )
    ).toEqual({ x: 90, y: 90, width: 10, height: 10 })
  })

  it("clamps a rect starting outside negative bounds", () => {
    expect(
      clampRectToBounds(
        { x: -10, y: -10, width: 30, height: 30 },
        { width: 100, height: 100 }
      )
    ).toEqual({ x: 0, y: 0, width: 20, height: 20 })
  })
})

describe("mapDisplayRectToNativeRect", () => {
  it("maps 1:1 when the display size matches the natural size", () => {
    const result = mapDisplayRectToNativeRect(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 200, height: 100 },
      { width: 200, height: 100 }
    )
    expect(result).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  it("scales up a CSS-pixel selection to a high-DPR native screenshot", () => {
    // A tab with devicePixelRatio 2 produces a screenshot twice the CSS size.
    // The crop UI renders the screenshot at its CSS size, so a selection
    // drawn in CSS pixels must be doubled to land on the right native pixels.
    const result = mapDisplayRectToNativeRect(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 400, height: 300 },
      { width: 800, height: 600 }
    )
    expect(result).toEqual({ x: 20, y: 40, width: 60, height: 80 })
  })

  it("rounds fractional native coordinates", () => {
    const result = mapDisplayRectToNativeRect(
      { x: 1, y: 1, width: 10, height: 10 },
      { width: 300, height: 300 },
      { width: 401, height: 401 }
    )
    expect(result.x).toBe(Math.round(1 * (401 / 300)))
    expect(result.width).toBe(Math.round(10 * (401 / 300)))
  })

  it("clamps the mapped rect to the natural image bounds", () => {
    const result = mapDisplayRectToNativeRect(
      { x: 90, y: 90, width: 20, height: 20 },
      { width: 100, height: 100 },
      { width: 200, height: 200 }
    )
    expect(result).toEqual({ x: 180, y: 180, width: 20, height: 20 })
  })

  it("returns an empty rect when the display size collapses to zero", () => {
    const result = mapDisplayRectToNativeRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 0, height: 0 },
      { width: 200, height: 200 }
    )
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe("isCropRectValid", () => {
  it("rejects null", () => {
    expect(isCropRectValid(null)).toBe(false)
  })

  it("rejects a zero-width rect", () => {
    expect(isCropRectValid({ x: 0, y: 0, width: 0, height: 10 })).toBe(false)
  })

  it("rejects a zero-height rect", () => {
    expect(isCropRectValid({ x: 0, y: 0, width: 10, height: 0 })).toBe(false)
  })

  it("accepts a rect with positive width and height", () => {
    expect(isCropRectValid({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
  })
})
