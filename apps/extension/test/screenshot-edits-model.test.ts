import { describe, expect, it } from "bun:test"
import fc from "fast-check"
import {
  addAnnotation,
  createAnnotationHistory,
  deleteAnnotation,
  type PenAnnotation,
  redo,
  undo,
} from "../lib/annotations"
import type { Rect } from "../lib/screenshot-crop"
import {
  applyAnnotations,
  applyScreenshotEdit,
  resetCrop,
  type ScreenshotEdits,
  startScreenshotEdits,
} from "../lib/screenshot-edits"

type Cmd =
  | { t: "commit"; x: number; y: number }
  | { t: "delete"; pick: number }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "crop"; rect: Rect }
  | { t: "resetCrop" }
  | { t: "cancel" }
  | { t: "begin" }

const rect = fc.record({
  x: fc.integer({ min: 0, max: 80 }),
  y: fc.integer({ min: 0, max: 80 }),
  width: fc.integer({ min: 1, max: 100 }),
  height: fc.integer({ min: 1, max: 100 }),
})
const cmd: fc.Arbitrary<Cmd> = fc.oneof(
  fc
    .record({
      x: fc.integer({ min: -50, max: 250 }),
      y: fc.integer({ min: -50, max: 250 }),
    })
    .map((p) => ({ t: "commit", ...p }) as const),
  fc.nat(20).map((pick) => ({ t: "delete", pick }) as const),
  fc.constant({ t: "undo" } as const),
  fc.constant({ t: "redo" } as const),
  rect.map((r) => ({ t: "crop", rect: r }) as const),
  fc.constant({ t: "resetCrop" } as const),
  fc.constant({ t: "cancel" } as const),
  fc.constant({ t: "begin" } as const)
)

interface Ref {
  // Annotations in Capture coordinates.
  visible: { id: string; x: number; y: number }[]
  crop: Rect | null
  undoDepth: number
  redoDepth: number
}

const stroke = (id: string, x: number, y: number): PenAnnotation => ({
  id,
  kind: "pen",
  color: "#f00",
  width: 2,
  points: [{ x, y }],
})

describe("screenshot edit session: model based", () => {
  it("annotations stay at fixed Capture coordinates through crop/undo/cancel", () => {
    fc.assert(
      fc.property(fc.array(cmd, { maxLength: 60 }), (cmds) => {
        const capture = new Blob(["c"])
        let edits: ScreenshotEdits = startScreenshotEdits(capture)
        let ref: Ref = { visible: [], crop: null, undoDepth: 0, redoDepth: 0 }
        let sessionStart = edits
        let refStart = ref
        let n = 0
        const ox = () => ref.crop?.x ?? 0
        const oy = () => ref.crop?.y ?? 0
        const hist = () => edits.annotations ?? createAnnotationHistory()
        const sync = () => {
          edits = applyAnnotations(edits, hist(), null)
        }
        // Reference keeps undo as snapshots of visible lists.
        const past: Ref["visible"][] = []
        const future: Ref["visible"][] = []
        let pastStart = past.slice()
        let futureStart = future.slice()

        const inside = (a: { x: number; y: number }, r: Rect | null) =>
          !(
            r &&
            (a.x + 1 < r.x ||
              a.y + 1 < r.y ||
              a.x - 1 > r.x + r.width ||
              a.y - 1 > r.y + r.height)
          )

        for (const c of cmds) {
          switch (c.t) {
            case "begin":
              sessionStart = edits
              refStart = ref
              pastStart = past.slice()
              futureStart = future.slice()
              break
            case "commit": {
              const id = `a${n++}`
              edits = applyAnnotations(
                edits,
                addAnnotation(hist(), stroke(id, c.x - ox(), c.y - oy())),
                null
              )
              past.push(ref.visible)
              future.length = 0
              ref = {
                ...ref,
                visible: [...ref.visible, { id, x: c.x, y: c.y }],
              }
              break
            }
            case "delete": {
              if (ref.visible.length === 0) break
              const target = ref.visible[c.pick % ref.visible.length]!
              edits = applyAnnotations(
                edits,
                deleteAnnotation(hist(), target.id),
                null
              )
              past.push(ref.visible)
              future.length = 0
              ref = {
                ...ref,
                visible: ref.visible.filter((a) => a.id !== target.id),
              }
              break
            }
            case "undo": {
              edits = applyAnnotations(edits, undo(hist()), null)
              const prev = past.pop()
              if (prev) {
                future.push(ref.visible)
                ref = { ...ref, visible: prev }
              }
              break
            }
            case "redo": {
              edits = applyAnnotations(edits, redo(hist()), null)
              const nxt = future.pop()
              if (nxt) {
                past.push(ref.visible)
                ref = { ...ref, visible: nxt }
              }
              break
            }
            case "crop": {
              edits = applyScreenshotEdit(edits, new Blob(["e"]), c.rect)
              ref = {
                ...ref,
                crop: c.rect,
                visible: ref.visible.filter((a) => inside(a, c.rect)),
              }
              past.length = 0
              future.length = 0
              break
            }
            case "resetCrop": {
              edits = resetCrop(edits)
              ref = { ...ref, crop: null }
              past.length = 0
              future.length = 0
              break
            }
            case "cancel":
              edits = sessionStart
              ref = refStart
              past.length = 0
              past.push(...pastStart)
              future.length = 0
              future.push(...futureStart)
              break
            default:
              break
          }
          sync()
          // Observable invariants.
          const got = (edits.annotations?.annotations ?? []).map((a) => ({
            id: a.id,
            x: (a.points[0]?.x ?? Number.NaN) + (edits.cropRect?.x ?? 0),
            y: (a.points[0]?.y ?? Number.NaN) + (edits.cropRect?.y ?? 0),
          }))
          expect(got).toEqual(ref.visible)
          expect(edits.capture).toBe(capture)
          expect(edits.cropRect).toEqual(ref.crop)
          expect(edits.annotated).toBeNull()
          for (const a of edits.annotations?.annotations ?? []) {
            for (const p of a.points) {
              expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
            }
          }
          expect(hist().undoStack.length).toBe(past.length)
          expect(hist().redoStack.length).toBe(future.length)
        }
      }),
      { numRuns: 400, seed: 52 }
    )
  })
})
