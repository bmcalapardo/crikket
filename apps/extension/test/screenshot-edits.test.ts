import { describe, expect, it } from "bun:test"
import {
  applyScreenshotEdit,
  resetScreenshotEdits,
  screenshotToSubmit,
  startScreenshotEdits,
} from "../lib/screenshot-edits"

const capture = new Blob(["original"], { type: "image/png" })
const cropped = new Blob(["cropped"], { type: "image/png" })

describe("screenshot edits", () => {
  it("submits the Capture when nothing has been edited", () => {
    expect(screenshotToSubmit(startScreenshotEdits(capture))).toBe(capture)
  })

  it("submits the edited image, not the Capture, once an edit is applied", () => {
    const edits = applyScreenshotEdit(startScreenshotEdits(capture), cropped)

    expect(screenshotToSubmit(edits)).toBe(cropped)
    expect(edits.capture).toBe(capture)
  })

  it("resetting after an applied edit returns the original Capture", () => {
    const edits = resetScreenshotEdits(
      applyScreenshotEdit(startScreenshotEdits(capture), cropped)
    )

    expect(screenshotToSubmit(edits)).toBe(capture)
    expect(edits.edited).toBeNull()
  })
})
