import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"

import { CropStep } from "../components/crop-step"
import { registerDomEnvironment } from "../happydom"
import { waitFor } from "./wait-for"

let container: HTMLDivElement | undefined
let root: Root | undefined

beforeEach(async () => {
  await registerDomEnvironment()
})

afterEach(() => {
  root?.unmount()
  container?.remove()
  root = undefined
  container = undefined
})

const renderCropStep = (
  onApply: (blob: Blob) => void = () => undefined,
  onSkip: () => void = () => undefined,
  options: { hasAppliedEdit?: boolean; onResetEdit?: () => void } = {}
) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)

  const imageBlob = new Blob(["fake-png-bytes"], { type: "image/png" })

  flushSync(() => {
    root?.render(
      <CropStep
        hasAppliedEdit={options.hasAppliedEdit ?? false}
        imageBlob={imageBlob}
        onApply={onApply}
        onResetEdit={options.onResetEdit ?? (() => undefined)}
        onSkip={onSkip}
      />
    )
  })

  return container
}

describe("CropStep", () => {
  it("starts with no selection: Apply and Reset are disabled", () => {
    const rendered = renderCropStep()
    const applyButton = rendered.querySelector(
      "button[type=submit], button:not([aria-label])"
    )
    const buttons = [...rendered.querySelectorAll("button")]
    const resetButton = buttons.find((b) => b.textContent === "Reset")
    const applyCropButton = buttons.find((b) => b.textContent === "Apply Crop")

    expect(resetButton?.hasAttribute("disabled")).toBe(true)
    expect(applyCropButton?.hasAttribute("disabled")).toBe(true)
    expect(applyButton).toBeDefined()
  })

  it("calls onSkip when Skip Crop is clicked", () => {
    const onSkip = mock(() => undefined)
    const rendered = renderCropStep(undefined, onSkip)
    const buttons = [...rendered.querySelectorAll("button")]
    const skipButton = buttons.find((b) => b.textContent === "Skip Crop")

    skipButton?.click()

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it("creates a keyboard-accessible selection via the Select Region button", async () => {
    const rendered = renderCropStep()
    // The image is only rendered once the Capture has been turned into an
    // object URL by an effect; Select Region does nothing before that.
    await waitFor(
      () => rendered.querySelector("img") !== null,
      "the screenshot to render"
    )
    const buttons = [...rendered.querySelectorAll("button")]
    const selectRegionButton = buttons.find(
      (b) => b.textContent === "Select Region"
    )

    flushSync(() => {
      selectRegionButton?.click()
    })

    const moveHandle = rendered.querySelector(
      '[aria-label="Move crop selection"]'
    )
    const cornerHandles = rendered.querySelectorAll(
      'button[aria-label^="Resize crop selection"]'
    )

    expect(moveHandle).not.toBeNull()
    expect(moveHandle?.tagName).toBe("BUTTON")
    expect(cornerHandles.length).toBe(4)
  })

  it("after a crop was applied, Reset returns to the original Capture", () => {
    const onResetEdit = mock(() => undefined)
    const rendered = renderCropStep(undefined, undefined, {
      hasAppliedEdit: true,
      onResetEdit,
    })
    const buttons = [...rendered.querySelectorAll("button")]
    const resetButton = buttons.find((b) => b.textContent === "Reset")

    expect(resetButton?.hasAttribute("disabled")).toBe(false)
    resetButton?.click()

    expect(onResetEdit).toHaveBeenCalledTimes(1)
  })
})
