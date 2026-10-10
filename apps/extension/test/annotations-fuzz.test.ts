import { describe, expect, it } from "bun:test"
import {
  addAnnotation,
  createAnnotationHistory,
  deleteAnnotation,
  type PenAnnotation,
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
