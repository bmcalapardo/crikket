import { describe, expect, it } from "bun:test"
import {
  captureFullPageSlices,
  encodeWithinBudget,
  type FullPageCaptureDeps,
  PAGE_CHANGED_MESSAGE,
  TOO_LARGE_MESSAGE,
} from "../lib/full-page-capture"

function makeDeps(overrides: Partial<FullPageCaptureDeps> = {}) {
  let clock = 0
  let scrollY = 300
  const deps: FullPageCaptureDeps = {
    measure: () =>
      Promise.resolve({
        pageHeight: 2000,
        viewportWidth: 1000,
        viewportHeight: 800,
        devicePixelRatio: 1,
        scrollY,
      }),
    scrollTo: (y) => {
      scrollY = y
      return Promise.resolve({ scrollY: y })
    },
    captureVisible: () => Promise.resolve(`data:image/png;${scrollY}`),
    now: () => clock,
    sleep: (ms) => {
      clock += ms
      return Promise.resolve()
    },
    ...overrides,
  }
  return { deps, getScroll: () => scrollY }
}

describe("captureFullPageSlices", () => {
  it("captures every planned slice and restores the scroll position", async () => {
    const { deps, getScroll } = makeDeps()
    const result = await captureFullPageSlices(deps)
    expect(result.slices.map((s) => s.scrollY)).toEqual([0, 800, 1200])
    expect(getScroll()).toBe(300)
  })

  it("keeps captures at least the minimum interval apart", async () => {
    const times: number[] = []
    const { deps } = makeDeps()
    deps.captureVisible = () => {
      times.push(deps.now())
      return Promise.resolve("data:image/png;x")
    }
    await captureFullPageSlices(deps)
    expect(times).toHaveLength(3)
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(500)
    }
  })

  it("retries when the rate limit is hit", async () => {
    let calls = 0
    const { deps } = makeDeps({
      captureVisible: () => {
        calls++
        if (calls === 1) {
          return Promise.reject(
            new Error(
              "exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota"
            )
          )
        }
        return Promise.resolve("data:image/png;ok")
      },
    })
    const result = await captureFullPageSlices(deps)
    expect(result.slices).toHaveLength(3)
    expect(calls).toBe(4)
  })

  it("restores the scroll position when a capture fails", async () => {
    const { deps, getScroll } = makeDeps({
      captureVisible: () => Promise.reject(new Error("No active tab")),
    })
    await expect(captureFullPageSlices(deps)).rejects.toThrow("No active tab")
    expect(getScroll()).toBe(300)
  })
})

describe("full-page hardening", () => {
  it("aborts when the tab navigates mid-capture and does not scroll the new page", async () => {
    let href = "https://a.test/"
    const scrolls: number[] = []
    const { deps } = makeDeps({
      measure: () =>
        Promise.resolve({
          pageHeight: 2000,
          viewportWidth: 1000,
          viewportHeight: 800,
          devicePixelRatio: 1,
          scrollY: 0,
          href,
        }),
      scrollTo: (y) => {
        scrolls.push(y)
        if (y === 800) {
          href = "https://b.test/"
        }
        return Promise.resolve({ scrollY: y, href })
      },
    })
    await expect(captureFullPageSlices(deps)).rejects.toThrow(
      PAGE_CHANGED_MESSAGE
    )
    expect(scrolls).toEqual([0, 800])
  })

  it("rejects an unusable screenshot result", async () => {
    const { deps } = makeDeps({ captureVisible: () => Promise.resolve("") })
    await expect(captureFullPageSlices(deps)).rejects.toThrow("unusable")
  })

  it("gives up after the retry budget on a persistent rate limit", async () => {
    let calls = 0
    const { deps } = makeDeps({
      captureVisible: () => {
        calls++
        return Promise.reject(
          new Error("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")
        )
      },
    })
    await expect(captureFullPageSlices(deps)).rejects.toThrow("MAX_CAPTURE")
    expect(calls).toBe(7)
  })

  it("reports truncation for a page taller than the canvas limit", async () => {
    const { deps } = makeDeps({
      measure: () =>
        Promise.resolve({
          pageHeight: 1_000_000,
          viewportWidth: 1000,
          viewportHeight: 800,
          devicePixelRatio: 1,
          scrollY: 0,
        }),
      captureVisible: () => Promise.resolve("data:image/png;base64,AA"),
    })
    const result = await captureFullPageSlices(deps)
    expect(result.plan.truncated).toBe(true)
    expect(result.slices.length).toBeLessThanOrEqual(22)
  })
})

describe("encodeWithinBudget", () => {
  const canvasOf = (sizes: Record<string, number>) => ({
    toDataURL: (type?: string, quality?: number) =>
      "x".repeat(sizes[`${type}${quality ?? ""}`] ?? 1_000_000),
  })

  it("prefers PNG when it fits", () => {
    expect(encodeWithinBudget(canvasOf({ "image/png": 10 }), 100)).toHaveLength(
      10
    )
  })

  it("steps down JPEG quality until it fits", () => {
    const out = encodeWithinBudget(
      canvasOf({ "image/png": 500, "image/jpeg0.9": 400, "image/jpeg0.7": 90 }),
      100
    )
    expect(out).toHaveLength(90)
  })

  it("throws a readable error when nothing fits", () => {
    expect(() => encodeWithinBudget(canvasOf({}), 100)).toThrow(
      TOO_LARGE_MESSAGE
    )
  })
})
