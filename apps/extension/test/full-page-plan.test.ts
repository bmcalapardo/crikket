import { describe, expect, it } from "bun:test"
import {
  isCaptureRateLimitError,
  MIN_CAPTURE_INTERVAL_MS,
  nextCaptureDelay,
  planFullPageCapture,
} from "../lib/full-page-plan"

const base = { viewportWidth: 1000, viewportHeight: 800, devicePixelRatio: 1 }

describe("planFullPageCapture", () => {
  it("plans a single slice when the page fits the viewport", () => {
    const plan = planFullPageCapture({ ...base, pageHeight: 800 })
    expect(plan.scrollOffsets).toEqual([0])
    expect(plan.canvasHeight).toBe(800)
    expect(plan.truncated).toBe(false)
  })

  it("steps by the viewport height", () => {
    const plan = planFullPageCapture({ ...base, pageHeight: 2400 })
    expect(plan.scrollOffsets).toEqual([0, 800, 1600])
  })

  it("pulls the last slice back so it overlaps the previous one", () => {
    const plan = planFullPageCapture({ ...base, pageHeight: 2000 })
    expect(plan.scrollOffsets).toEqual([0, 800, 1200])
    expect(plan.canvasHeight).toBe(2000)
  })

  it("scales the canvas by the device pixel ratio", () => {
    const plan = planFullPageCapture({
      ...base,
      devicePixelRatio: 2,
      pageHeight: 1600,
    })
    expect(plan.canvasWidth).toBe(2000)
    expect(plan.canvasHeight).toBe(3200)
    expect(plan.scrollOffsets).toEqual([0, 800])
  })

  it("truncates a page taller than the canvas dimension cap", () => {
    const plan = planFullPageCapture(
      { ...base, pageHeight: 10_000 },
      { maxDimension: 4000 }
    )
    expect(plan.truncated).toBe(true)
    expect(plan.canvasHeight).toBe(4000)
    expect(plan.capturedHeight).toBe(4000)
    expect(plan.scrollOffsets).toEqual([0, 800, 1600, 2400, 3200])
  })

  it("truncates against the area cap using the device pixel ratio", () => {
    const plan = planFullPageCapture(
      { ...base, devicePixelRatio: 2, pageHeight: 10_000 },
      { maxDimension: 100_000, maxArea: 2000 * 5000 }
    )
    expect(plan.truncated).toBe(true)
    expect(plan.canvasHeight).toBe(5000)
    expect(plan.capturedHeight).toBe(2500)
  })

  it("never plans fewer than one slice for bad metrics", () => {
    const plan = planFullPageCapture({
      viewportWidth: 0,
      viewportHeight: 0,
      devicePixelRatio: 0,
      pageHeight: Number.NaN,
    })
    expect(plan.scrollOffsets.length).toBeGreaterThanOrEqual(1)
    expect(plan.canvasHeight).toBeGreaterThan(0)
  })
})

describe("capture pacing", () => {
  it("does not delay the first capture", () => {
    expect(nextCaptureDelay({ now: 5000, lastCaptureAt: null })).toBe(0)
  })

  it("waits out the remainder of the interval", () => {
    expect(nextCaptureDelay({ now: 1200, lastCaptureAt: 1000 })).toBe(
      MIN_CAPTURE_INTERVAL_MS - 200
    )
    expect(nextCaptureDelay({ now: 9000, lastCaptureAt: 1000 })).toBe(0)
  })

  it("recognises the rate-limit error", () => {
    expect(
      isCaptureRateLimitError(
        new Error(
          "This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota."
        )
      )
    ).toBe(true)
    expect(isCaptureRateLimitError(new Error("No tab"))).toBe(false)
  })
})

describe("planFullPageCapture fuzz", () => {
  it("always yields in-range, covering, ordered offsets", () => {
    let seed = 12_345
    const rand = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296
      return seed / 4_294_967_296
    }
    const weird = [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]
    for (let i = 0; i < 2000; i++) {
      const pick = (v: number) =>
        rand() < 0.05 ? weird[Math.floor(rand() * 4)] : v
      const plan = planFullPageCapture({
        pageHeight: pick(rand() * 200_000),
        viewportWidth: pick(1 + rand() * 4000),
        viewportHeight: pick(1 + rand() * 2000),
        devicePixelRatio: pick(0.5 + rand() * 4),
      })
      expect(plan.canvasWidth).toBeGreaterThan(0)
      expect(plan.canvasHeight).toBeGreaterThan(0)
      expect(plan.canvasHeight).toBeLessThanOrEqual(16_384)
      expect(plan.canvasWidth * plan.canvasHeight).toBeLessThanOrEqual(
        Math.max(268_435_456, plan.canvasWidth)
      )
      expect(plan.scrollOffsets[0]).toBe(0)
      for (let j = 1; j < plan.scrollOffsets.length; j++) {
        expect(plan.scrollOffsets[j]).toBeGreaterThan(plan.scrollOffsets[j - 1])
      }
    }
  })
})
