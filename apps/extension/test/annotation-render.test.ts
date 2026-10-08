import { describe, expect, it } from "bun:test"
import {
  type DrawContext,
  drawAnnotations,
  drawPenIncrement,
  syncCommittedAnnotations,
} from "../lib/annotation-render"
import {
  addAnnotation,
  createAnnotationHistory,
  hitTest,
  type PenAnnotation,
} from "../lib/annotations"

function recordingContext() {
  const calls: string[] = []
  const record = (name: string) => () => {
    calls.push(name)
  }
  const ctx = {
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    arc: record("arc"),
    fill: record("fill"),
    save: record("save"),
    restore: record("restore"),
    clearRect: record("clearRect"),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
  } as DrawContext
  return { ctx, calls }
}

// A long, wiggly stroke across a 3840x2160 image.
function longStroke(id: string, pointCount: number): PenAnnotation {
  return {
    id,
    kind: "pen",
    color: "#ef4444",
    width: 15,
    points: Array.from({ length: pointCount }, (_, i) => ({
      x: (i * 7) % 3840,
      y: 1080 + Math.sin(i / 10) * 800,
    })),
  }
}

describe("pen rendering", () => {
  it("draws a stroke as one connected path", () => {
    const { ctx, calls } = recordingContext()
    drawAnnotations(ctx, [longStroke("a", 10)])
    expect(calls.filter((c) => c === "stroke")).toHaveLength(1)
    expect(calls.filter((c) => c === "lineTo")).toHaveLength(9)
  })

  it("draws a single-point stroke as a dot", () => {
    const { ctx, calls } = recordingContext()
    drawAnnotations(ctx, [{ ...longStroke("a", 1) }])
    expect(calls).toContain("arc")
    expect(calls).toContain("fill")
  })

  it("incremental drawing costs the same however long the stroke is", () => {
    const short = recordingContext()
    const long = recordingContext()
    drawPenIncrement(
      short.ctx,
      { color: "#000", width: 10 },
      longStroke("a", 3).points
    )
    drawPenIncrement(
      long.ctx,
      { color: "#000", width: 10 },
      longStroke("b", 50_000).points
    )
    expect(long.calls).toEqual(short.calls)
  })
})

describe("draw interaction budget on a 3840x2160 image", () => {
  const BUDGET_MS = 100

  it("keeps per-pointer-move work, commit and hit-testing under 100ms", () => {
    // 100 existing strokes of 2,000 points each, plus a live 5,000 point one.
    let state = createAnnotationHistory()
    for (let i = 0; i < 100; i++) {
      state = addAnnotation(state, longStroke(`s${i}`, 2000))
    }
    const live = longStroke("live", 5000)

    const { ctx } = recordingContext()
    // The fastest of several runs measures the work itself: a slow outlier
    // is the scheduler pre-empting this process on a busy machine, not the
    // code. A real regression slows every run, so it still fails.
    const bestOf = (run: () => void) => {
      let best = Number.POSITIVE_INFINITY
      for (let i = 0; i < 20; i++) {
        const start = performance.now()
        run()
        best = Math.min(best, performance.now() - start)
      }
      return best
    }

    // Pointer move: one incremental segment.
    const move = bestOf(() =>
      drawPenIncrement(ctx, live, live.points.slice(0, 4000))
    )
    // Pointer up: appending to the model.
    const commit = bestOf(() => addAnnotation(state, live))
    // Eraser click: hit-testing every stroke (worst case, a miss).
    const erase = bestOf(() =>
      hitTest(state.annotations, { x: 3839, y: 2159 }, 12)
    )

    expect(move).toBeLessThan(BUDGET_MS)
    expect(commit).toBeLessThan(BUDGET_MS)
    expect(erase).toBeLessThan(BUDGET_MS)
  })
})

describe("committed canvas sync", () => {
  const size = { width: 3840, height: 2160 }
  const strokes = [longStroke("a", 4), longStroke("b", 4), longStroke("c", 4)]

  it("draws only the new stroke when one is appended, with no full repaint", () => {
    const { ctx, calls } = recordingContext()
    const mode = syncCommittedAnnotations(
      ctx,
      size,
      strokes.slice(0, 2),
      strokes
    )
    expect(mode).toBe("incremental")
    expect(calls).not.toContain("clearRect")
    expect(calls.filter((c) => c === "stroke")).toHaveLength(1)
  })

  it("repaints exactly the remaining set after undo or delete", () => {
    const { ctx, calls } = recordingContext()
    const mode = syncCommittedAnnotations(ctx, size, strokes, [
      strokes[0] as PenAnnotation,
      strokes[2] as PenAnnotation,
    ])
    expect(mode).toBe("full")
    expect(calls.filter((c) => c === "clearRect")).toHaveLength(1)
    expect(calls.filter((c) => c === "stroke")).toHaveLength(2)
  })

  it("repaints in full when nothing is known to be painted yet", () => {
    const { ctx, calls } = recordingContext()
    expect(syncCommittedAnnotations(ctx, size, null, strokes)).toBe("full")
    expect(calls.filter((c) => c === "stroke")).toHaveLength(3)
  })

  it("does nothing when the set is unchanged", () => {
    const { ctx, calls } = recordingContext()
    expect(syncCommittedAnnotations(ctx, size, strokes, strokes)).toBe("none")
    expect(calls).toEqual([])
  })
})

describe("full repaint cost", () => {
  it("repaints 200 strokes of 500 points well inside the budget", () => {
    const strokes = Array.from({ length: 200 }, (_, i) =>
      longStroke(`s${i}`, 500)
    )
    // Fastest of several repaints, for the same reason as the budget above.
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 10; i++) {
      const { ctx } = recordingContext()
      const start = performance.now()
      const mode = syncCommittedAnnotations(
        ctx,
        { width: 3840, height: 2160 },
        null,
        strokes
      )
      best = Math.min(best, performance.now() - start)
      expect(mode).toBe("full")
    }
    expect(best).toBeLessThan(100)
  })
})
