import { describe, expect, it } from "bun:test"
import {
  type Annotation,
  addAnnotation,
  createAnnotationHistory,
  deleteAnnotation,
  hitTest,
  type PenAnnotation,
  type Point,
  redo,
  translateHistory,
  undo,
} from "../lib/annotations"

// Park-Miller LCG, seeded so a failure reproduces from its seed.
function rng(seed: number) {
  let state = seed
  return () => {
    state = (state * 16_807) % 2_147_483_647
    return state / 2_147_483_647
  }
}

const pen = (id: string, x = 5, y = 5): PenAnnotation => ({
  id,
  kind: "pen",
  color: "#f00",
  width: 4,
  points: [{ x, y }],
})

describe("annotation history vs a snapshot-stack reference model", () => {
  it("matches after every step of random add/delete/undo/redo sequences", () => {
    for (const seed of [1, 2, 3, 4]) {
      const next = rng(seed)
      let history = createAnnotationHistory()
      // Reference: whole-list snapshots, so it shares no logic with the SUT.
      let visible: string[] = []
      const past: string[][] = []
      const future: string[][] = []
      let counter = 0

      for (let step = 0; step < 300; step++) {
        const roll = next()
        if (roll < 0.35) {
          const id = `s${counter++}`
          history = addAnnotation(history, pen(id))
          past.push(visible)
          future.length = 0
          visible = [...visible, id]
        } else if (roll < 0.55) {
          const id =
            visible.length > 0 && next() < 0.9
              ? (visible[Math.floor(next() * visible.length)] as string)
              : "missing"
          history = deleteAnnotation(history, id)
          if (visible.includes(id)) {
            past.push(visible)
            future.length = 0
            visible = visible.filter((v) => v !== id)
          }
        } else if (roll < 0.8) {
          history = undo(history)
          const previous = past.pop()
          if (previous) {
            future.push(visible)
            visible = previous
          }
        } else {
          history = redo(history)
          const following = future.pop()
          if (following) {
            past.push(visible)
            visible = following
          }
        }

        expect(history.annotations.map((a) => a.id)).toEqual(visible)
        expect(history.undoStack.length).toBe(past.length)
        expect(history.redoStack.length).toBe(future.length)
        expect(new Set(visible).size).toBe(visible.length)
      }
    }
  })
})

describe("repeated crop changes", () => {
  it("keeps survivors consistent and clears history on every change", () => {
    let history = createAnnotationHistory()
    for (let i = 0; i < 500; i++)
      history = addAnnotation(history, pen(`s${i}`, i, 5))
    let total = 0
    // Shift left by 1px each time in a 300px-wide window: the leftmost
    // columns fall out, nothing else moves relative to the image.
    for (let i = 0; i < 100; i++) {
      const { history: moved, removed } = translateHistory(history, -1, 0, {
        width: 300,
        height: 10,
      })
      total += removed
      history = moved
      expect(history.undoStack).toEqual([])
      expect(history.redoStack).toEqual([])
    }
    expect(history.annotations.length + total).toBe(500)
    expect(history.annotations[0]?.points[0]?.x).toBeGreaterThanOrEqual(-2)
  })
})

describe("history fuzz with every annotation kind", () => {
  it("keeps ids unique and the undo/redo round trip exact", () => {
    const kinds = ["pen", "line", "arrow", "rectangle", "ellipse", "text"]
    for (const seed of [11, 12, 13]) {
      const next = rng(seed)
      let history = createAnnotationHistory()
      let counter = 0
      for (let step = 0; step < 400; step++) {
        const roll = next()
        if (roll < 0.4) {
          const kind = kinds[Math.floor(next() * kinds.length)] as string
          history = addAnnotation(history, {
            id: `k${counter++}`,
            kind,
            color: "#f00",
            width: 4,
            points: [
              { x: next() * 500, y: next() * 500 },
              { x: next() * 500, y: next() * 500 },
            ],
            ...(kind === "text" ? { text: "t", fontSize: 12 } : {}),
          } as Annotation)
        } else if (roll < 0.6 && history.annotations.length > 0) {
          const target = history.annotations[
            Math.floor(next() * history.annotations.length)
          ] as Annotation
          const hit = hitTest(history.annotations, target.points[0] as Point, 6)
          history = deleteAnnotation(history, (hit ?? target).id)
        } else if (roll < 0.8) {
          history = undo(history)
        } else {
          history = redo(history)
        }
        const ids = history.annotations.map((a) => a.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
      const snapshot = history.annotations.map((a) => a.id)
      let h = history
      const depth = h.undoStack.length
      for (let i = 0; i < depth; i++) h = undo(h)
      expect(h.annotations).toHaveLength(0)
      for (let i = 0; i < depth; i++) h = redo(h)
      expect(h.annotations.map((a) => a.id)).toEqual(snapshot)
    }
  })
})
