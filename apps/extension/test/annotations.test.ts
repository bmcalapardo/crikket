import { describe, expect, it } from "bun:test"
import {
  addAnnotation,
  commitPenStroke,
  createAnnotationHistory,
  deleteAnnotation,
  displayPointToNative,
  hitTest,
  redo,
  undo,
} from "../lib/annotations"

function stroke(id: string, points: [number, number][], width = 10) {
  return {
    id,
    kind: "pen" as const,
    color: "#ef4444",
    width,
    points: points.map(([x, y]) => ({ x, y })),
  }
}

describe("annotation history", () => {
  it("adds annotations in order", () => {
    const state = addAnnotation(
      addAnnotation(createAnnotationHistory(), stroke("a", [[0, 0]])),
      stroke("b", [[5, 5]])
    )
    expect(state.annotations.map((a) => a.id)).toEqual(["a", "b"])
  })

  it("undo removes the most recent annotation and redo restores it", () => {
    const added = addAnnotation(
      createAnnotationHistory(),
      stroke("a", [[0, 0]])
    )
    const undone = undo(added)
    expect(undone.annotations).toEqual([])
    expect(redo(undone).annotations).toEqual(added.annotations)
  })

  it("undo and redo on empty stacks are no-ops", () => {
    const empty = createAnnotationHistory()
    expect(undo(empty)).toBe(empty)
    expect(redo(empty)).toBe(empty)
  })

  it("a new action clears the redo stack", () => {
    let state = addAnnotation(createAnnotationHistory(), stroke("a", [[0, 0]]))
    state = undo(state)
    state = addAnnotation(state, stroke("b", [[1, 1]]))
    expect(redo(state)).toBe(state)
  })

  it("deleting removes the annotation, and undo restores it at its position", () => {
    let state = createAnnotationHistory()
    for (const id of ["a", "b", "c"]) {
      state = addAnnotation(state, stroke(id, [[0, 0]]))
    }
    state = deleteAnnotation(state, "b")
    expect(state.annotations.map((a) => a.id)).toEqual(["a", "c"])
    state = undo(state)
    expect(state.annotations.map((a) => a.id)).toEqual(["a", "b", "c"])
    state = redo(state)
    expect(state.annotations.map((a) => a.id)).toEqual(["a", "c"])
  })

  it("deleting an unknown id is a no-op", () => {
    const state = addAnnotation(
      createAnnotationHistory(),
      stroke("a", [[0, 0]])
    )
    expect(deleteAnnotation(state, "nope")).toBe(state)
  })

  it("does not mutate previous states", () => {
    const first = addAnnotation(
      createAnnotationHistory(),
      stroke("a", [[0, 0]])
    )
    addAnnotation(first, stroke("b", [[1, 1]]))
    expect(first.annotations).toHaveLength(1)
  })

  it("survives a JSON round trip", () => {
    let state = addAnnotation(createAnnotationHistory(), stroke("a", [[1, 2]]))
    state = addAnnotation(state, stroke("b", [[3, 4]]))
    state = undo(state)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe("hitTest", () => {
  const horizontal = stroke("h", [
    [0, 100],
    [200, 100],
  ])

  it("hits a point on the stroke", () => {
    expect(hitTest([horizontal], { x: 100, y: 100 }, 0)?.id).toBe("h")
  })

  it("hits within half the stroke width", () => {
    expect(hitTest([horizontal], { x: 100, y: 104 }, 0)?.id).toBe("h")
    expect(hitTest([horizontal], { x: 100, y: 106 }, 0)).toBeNull()
  })

  it("adds the tolerance to the stroke radius", () => {
    expect(hitTest([horizontal], { x: 100, y: 110 }, 6)?.id).toBe("h")
  })

  it("misses beyond the end of the segment", () => {
    expect(hitTest([horizontal], { x: 230, y: 100 }, 0)).toBeNull()
  })

  it("hits a single-point dot", () => {
    const dot = stroke("d", [[50, 50]])
    expect(hitTest([dot], { x: 53, y: 50 }, 0)?.id).toBe("d")
    expect(hitTest([dot], { x: 70, y: 50 }, 0)).toBeNull()
  })

  it("returns the topmost annotation when strokes overlap", () => {
    const under = stroke("under", [
      [0, 0],
      [100, 100],
    ])
    const over = stroke("over", [
      [0, 100],
      [100, 0],
    ])
    expect(hitTest([under, over], { x: 50, y: 50 }, 0)?.id).toBe("over")
  })
})

describe("displayPointToNative", () => {
  it("scales CSS pixels onto native pixels", () => {
    expect(
      displayPointToNative(
        { x: 100, y: 50 },
        { width: 960, height: 540 },
        { width: 3840, height: 2160 }
      )
    ).toEqual({ x: 400, y: 200 })
  })

  it("clamps to the image", () => {
    expect(
      displayPointToNative(
        { x: -5, y: 9999 },
        { width: 100, height: 100 },
        { width: 200, height: 200 }
      )
    ).toEqual({ x: 0, y: 200 })
  })
})

describe("commitPenStroke", () => {
  const existing = addAnnotation(
    createAnnotationHistory(),
    stroke("old", [
      [0, 100],
      [200, 100],
    ])
  )

  it("a click on an annotation deletes it, undoably", () => {
    const next = commitPenStroke(existing, stroke("new", [[100, 100]]), {
      isClick: true,
      tolerance: 0,
    })
    expect(next.annotations).toEqual([])
    expect(undo(next).annotations.map((a) => a.id)).toEqual(["old"])
  })

  it("a click on empty space draws a dot", () => {
    const next = commitPenStroke(existing, stroke("new", [[100, 500]]), {
      isClick: true,
      tolerance: 0,
    })
    expect(next.annotations.map((a) => a.id)).toEqual(["old", "new"])
  })

  it("a drag over an existing annotation always draws", () => {
    const next = commitPenStroke(
      existing,
      stroke("new", [
        [100, 100],
        [150, 160],
      ]),
      { isClick: false, tolerance: 0 }
    )
    expect(next.annotations.map((a) => a.id)).toEqual(["old", "new"])
  })
})
