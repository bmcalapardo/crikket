import { describe, expect, it } from "bun:test"
import {
  addAnnotation,
  createAnnotationHistory,
  type PenAnnotation,
} from "../lib/annotations"
import {
  annotationBase,
  applyAnnotations,
  applyScreenshotEdit,
  resetCrop,
  resetScreenshotEdits,
  screenshotToSubmit,
  startScreenshotEdits,
} from "../lib/screenshot-edits"

const capture = new Blob(["original"], { type: "image/png" })
const cropped = new Blob(["cropped"], { type: "image/png" })
const annotated = new Blob(["annotated"], { type: "image/png" })

const crop = { x: 100, y: 50, width: 400, height: 300 }

function stroke(id: string, points: [number, number][]): PenAnnotation {
  return {
    id,
    kind: "pen",
    color: "#ef4444",
    width: 10,
    points: points.map(([x, y]) => ({ x, y })),
  }
}

function withStrokes(...strokes: PenAnnotation[]) {
  return strokes.reduce(addAnnotation, createAnnotationHistory())
}

describe("screenshot edits", () => {
  it("submits the Capture when nothing has been edited", () => {
    expect(screenshotToSubmit(startScreenshotEdits(capture))).toBe(capture)
  })

  it("submits the edited image, not the Capture, once an edit is applied", () => {
    const edits = applyScreenshotEdit(
      startScreenshotEdits(capture),
      cropped,
      crop
    )

    expect(screenshotToSubmit(edits)).toBe(cropped)
    expect(edits.capture).toBe(capture)
  })

  it("resetting after an applied edit returns the original Capture", () => {
    const edits = resetScreenshotEdits(
      applyScreenshotEdit(startScreenshotEdits(capture), cropped, crop)
    )

    expect(screenshotToSubmit(edits)).toBe(capture)
    expect(edits.edited).toBeNull()
    expect(edits.cropRect).toBeNull()
  })
})

describe("annotated screenshot edits", () => {
  it("submits the annotated image over the crop and the Capture", () => {
    const edits = applyAnnotations(
      applyScreenshotEdit(startScreenshotEdits(capture), cropped, crop),
      createAnnotationHistory(),
      annotated
    )

    expect(screenshotToSubmit(edits)).toBe(annotated)
    expect(annotationBase(edits)).toBe(cropped)
  })

  it("keeps the model when annotating without a rendered image", () => {
    const history = createAnnotationHistory()
    const edits = applyAnnotations(startScreenshotEdits(capture), history, null)

    expect(screenshotToSubmit(edits)).toBe(capture)
    expect(edits.annotations).toBe(history)
  })

  it("resetting to original discards crop and annotations", () => {
    const edits = resetScreenshotEdits(
      applyAnnotations(
        applyScreenshotEdit(startScreenshotEdits(capture), cropped, crop),
        withStrokes(stroke("a", [[10, 10]])),
        annotated
      )
    )

    expect(screenshotToSubmit(edits)).toBe(capture)
    expect(edits.annotations).toBeNull()
  })
})

describe("re-cropping annotated edits", () => {
  const drawn = (edits = startScreenshotEdits(capture)) =>
    applyAnnotations(edits, withStrokes(stroke("a", [[200, 100]])), annotated)

  it("translates annotations into the new crop's coordinates", () => {
    // Annotation at (200,100) of the uncropped capture; new crop starts at
    // (100,50), so it sits at (100,50) in the crop.
    const edits = applyScreenshotEdit(drawn(), cropped, crop)

    expect(edits.annotations?.annotations[0]?.points).toEqual([
      { x: 100, y: 50 },
    ])
    expect(edits.removedByCrop).toBe(0)
  })

  it("invalidates the rendered image so it can never be stale", () => {
    const edits = applyScreenshotEdit(drawn(), cropped, crop)

    expect(edits.annotated).toBeNull()
  })

  it("keeps an annotation that only partly overlaps the new crop", () => {
    const edits = applyScreenshotEdit(
      applyAnnotations(
        startScreenshotEdits(capture),
        withStrokes(
          stroke("edge", [
            [50, 100],
            [300, 100],
          ])
        ),
        null
      ),
      cropped,
      crop
    )

    expect(edits.annotations?.annotations).toHaveLength(1)
    expect(edits.removedByCrop).toBe(0)
  })

  it("drops annotations entirely outside the new crop and counts them", () => {
    const edits = applyScreenshotEdit(
      applyAnnotations(
        startScreenshotEdits(capture),
        withStrokes(
          stroke("in", [[200, 100]]),
          stroke("out1", [[900, 900]]),
          stroke("out2", [[10, 10]])
        ),
        null
      ),
      cropped,
      crop
    )

    expect(edits.annotations?.annotations.map((a) => a.id)).toEqual(["in"])
    expect(edits.removedByCrop).toBe(2)
  })

  it("re-applying the same crop leaves annotations unchanged", () => {
    const once = applyScreenshotEdit(drawn(), cropped, crop)
    const twice = applyScreenshotEdit(once, cropped, crop)

    expect(twice.annotations?.annotations).toEqual(
      once.annotations?.annotations as PenAnnotation[]
    )
    expect(twice.removedByCrop).toBe(0)
  })

  it("moves between two crops via Capture coordinates", () => {
    const first = applyScreenshotEdit(drawn(), cropped, crop)
    // New crop starts at (150, 60): the annotation, at (200,100) in the
    // capture, is now at (50, 40).
    const second = applyScreenshotEdit(first, cropped, {
      x: 150,
      y: 60,
      width: 300,
      height: 200,
    })

    expect(second.annotations?.annotations[0]?.points).toEqual([
      { x: 50, y: 40 },
    ])
  })

  it("resetting the crop maps annotations back to Capture coordinates", () => {
    const edits = resetCrop(applyScreenshotEdit(drawn(), cropped, crop))

    expect(edits.edited).toBeNull()
    expect(edits.cropRect).toBeNull()
    expect(edits.annotations?.annotations[0]?.points).toEqual([
      { x: 200, y: 100 },
    ])
  })
})

// Crop and annotate are one session; Cancel returns to the edits the tester
// entered with. Edits are immutable values, so that snapshot is just the
// value from before the session.
describe("edit session cancel", () => {
  it("fresh capture, crop, draw, cancel gives the original capture", () => {
    const start = startScreenshotEdits(capture)

    const cropped1 = applyScreenshotEdit(start, cropped, crop)
    const inSession = applyAnnotations(
      cropped1,
      withStrokes(stroke("a", [[10, 10]])),
      annotated
    )

    expect(screenshotToSubmit(inSession)).toBe(annotated)
    expect(screenshotToSubmit(start)).toBe(capture)
    expect(start.annotations).toBeNull()
    expect(start.edited).toBeNull()
  })

  it("cancelling a later session returns the prior session's result", () => {
    const prior = applyAnnotations(
      applyScreenshotEdit(startScreenshotEdits(capture), cropped, crop),
      withStrokes(stroke("a", [[10, 10]])),
      annotated
    )

    const newCrop = new Blob(["newer"], { type: "image/png" })
    const inSession = applyAnnotations(
      applyScreenshotEdit(prior, newCrop, {
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      }),
      withStrokes(stroke("b", [[5, 5]])),
      null
    )

    expect(screenshotToSubmit(inSession)).not.toBe(annotated)
    expect(screenshotToSubmit(prior)).toBe(annotated)
    expect(prior.edited).toBe(cropped)
    expect(prior.cropRect).toEqual(crop)
    expect(prior.annotations?.annotations.map((a) => a.id)).toEqual(["a"])
  })
})
